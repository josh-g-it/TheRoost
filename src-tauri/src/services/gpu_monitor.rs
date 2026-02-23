use std::collections::HashMap;

use nvml_wrapper::enums::device::UsedGpuMemory;
use nvml_wrapper::Nvml;
use windows::core::PCWSTR;
use windows::Win32::System::Performance::{
    PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhGetFormattedCounterArrayW,
    PdhOpenQueryW, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_HCOUNTER, PDH_HQUERY,
};

/// Result of a single GPU refresh cycle.
pub struct GpuSnapshot {
    /// System-wide GPU utilization % (NVML, NVIDIA only)
    pub system_gpu_percent: Option<f32>,
    /// System-wide VRAM used in bytes (NVML, NVIDIA only)
    pub system_vram_used: Option<u64>,
    /// System-wide VRAM total in bytes (NVML, NVIDIA only)
    pub system_vram_total: Option<u64>,
    /// Per-process GPU utilization % (PDH, all vendors)
    pub per_process_gpu: HashMap<u32, f32>,
    /// Per-process VRAM in bytes (NVML, NVIDIA only)
    pub per_process_vram: HashMap<u32, u64>,
}

/// Encapsulates GPU monitoring via NVML (NVIDIA) and Windows PDH (all vendors).
/// All methods degrade gracefully when hardware or APIs are unavailable.
pub struct GpuMonitor {
    /// NVML handle — None if no NVIDIA GPU or driver
    nvml: Option<Nvml>,
    /// PDH query handle for GPU Engine utilization counters
    pdh_query: Option<PDH_HQUERY>,
    /// PDH counter handle for the wildcard GPU Engine counter
    pdh_counter: Option<PDH_HCOUNTER>,
    /// Rate counters need 2 collects before returning valid data
    pdh_primed: bool,
}

impl GpuMonitor {
    pub fn new() -> Self {
        let nvml = match Nvml::init() {
            Ok(n) => {
                tracing::info!("NVML initialized — NVIDIA GPU monitoring available");
                Some(n)
            }
            Err(e) => {
                tracing::info!(error = %e, "NVML not available (no NVIDIA GPU or driver)");
                None
            }
        };

        let (pdh_query, pdh_counter) = Self::init_pdh();

        Self {
            nvml,
            pdh_query,
            pdh_counter,
            pdh_primed: false,
        }
    }

    /// Initialize PDH query with a wildcard counter for GPU Engine utilization.
    /// Returns (None, None) if PDH init fails (e.g. no GPU Engine counters on this system).
    fn init_pdh() -> (Option<PDH_HQUERY>, Option<PDH_HCOUNTER>) {
        unsafe {
            let mut query = PDH_HQUERY::default();
            let status = PdhOpenQueryW(PCWSTR::null(), 0, &mut query);
            if status != 0 {
                tracing::info!(
                    status = status,
                    "PDH query open failed — per-process GPU% unavailable"
                );
                return (None, None);
            }

            // Use English counter name for locale independence
            let counter_path: Vec<u16> = "\\GPU Engine(*)\\Utilization Percentage\0"
                .encode_utf16()
                .collect();
            let mut counter = PDH_HCOUNTER::default();
            let status =
                PdhAddEnglishCounterW(query, PCWSTR(counter_path.as_ptr()), 0, &mut counter);
            if status != 0 {
                tracing::info!(
                    status = status,
                    "PDH GPU Engine counter not available — per-process GPU% unavailable"
                );
                let _ = PdhCloseQuery(query);
                return (None, None);
            }

            // First collect primes the rate counter baseline (returns no usable data)
            let _ = PdhCollectQueryData(query);

            tracing::info!("PDH GPU Engine counters initialized — per-process GPU% available");
            (Some(query), Some(counter))
        }
    }

    /// Perform a complete GPU data refresh and return the snapshot.
    pub fn refresh(&mut self) -> GpuSnapshot {
        let (system_gpu_percent, system_vram_used, system_vram_total) = self.query_nvml_system();
        let per_process_gpu = self.query_pdh_process_gpu();
        let per_process_vram = self.query_nvml_process_vram();

        GpuSnapshot {
            system_gpu_percent,
            system_vram_used,
            system_vram_total,
            per_process_gpu,
            per_process_vram,
        }
    }

    /// Query NVML for system-wide GPU utilization and VRAM.
    fn query_nvml_system(&self) -> (Option<f32>, Option<u64>, Option<u64>) {
        let nvml = match &self.nvml {
            Some(n) => n,
            None => return (None, None, None),
        };

        let device = match nvml.device_by_index(0) {
            Ok(d) => d,
            Err(e) => {
                tracing::debug!(error = %e, "Failed to get NVML device 0");
                return (None, None, None);
            }
        };

        let gpu_percent = device.utilization_rates().ok().map(|u| u.gpu as f32);

        let (vram_used, vram_total) = match device.memory_info() {
            Ok(mem) => (Some(mem.used), Some(mem.total)),
            Err(_) => (None, None),
        };

        (gpu_percent, vram_used, vram_total)
    }

    /// Query NVML for per-process VRAM usage (graphics + compute processes).
    fn query_nvml_process_vram(&self) -> HashMap<u32, u64> {
        let mut map = HashMap::new();
        let nvml = match &self.nvml {
            Some(n) => n,
            None => return map,
        };

        let device = match nvml.device_by_index(0) {
            Ok(d) => d,
            Err(_) => return map,
        };

        // Graphics processes (games, 3D apps)
        if let Ok(procs) = device.running_graphics_processes() {
            for p in procs {
                if let UsedGpuMemory::Used(bytes) = p.used_gpu_memory {
                    *map.entry(p.pid).or_insert(0) += bytes;
                }
            }
        }

        // Compute processes (CUDA workloads — some games use compute shaders)
        if let Ok(procs) = device.running_compute_processes() {
            for p in procs {
                if let UsedGpuMemory::Used(bytes) = p.used_gpu_memory {
                    *map.entry(p.pid).or_insert(0) += bytes;
                }
            }
        }

        map
    }

    /// Query Windows PDH for per-process GPU utilization %.
    /// Parses GPU Engine counter instances and sums utilization across engines per PID.
    fn query_pdh_process_gpu(&mut self) -> HashMap<u32, f32> {
        let mut map: HashMap<u32, f32> = HashMap::new();

        let (query, counter) = match (self.pdh_query, self.pdh_counter) {
            (Some(q), Some(c)) => (q, c),
            _ => return map,
        };

        unsafe {
            // Collect fresh data
            let status = PdhCollectQueryData(query);
            if status != 0 {
                return map;
            }

            if !self.pdh_primed {
                // Rate counters need 2 collects — first real call after init returns no data
                self.pdh_primed = true;
                return map;
            }

            // First pass: determine required buffer size
            let mut buffer_size: u32 = 0;
            let mut item_count: u32 = 0;
            let status = PdhGetFormattedCounterArrayW(
                counter,
                PDH_FMT_DOUBLE,
                &mut buffer_size,
                &mut item_count,
                None,
            );

            // PDH_MORE_DATA (0x800007D2) is expected — tells us the required buffer size
            const PDH_MORE_DATA: u32 = 0x800007D2;
            if status != PDH_MORE_DATA && status != 0 {
                return map;
            }
            if item_count == 0 || buffer_size == 0 {
                return map;
            }

            // Second pass: fill buffer with counter data
            let mut buffer: Vec<u8> = vec![0u8; buffer_size as usize];
            let items_ptr = buffer.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;

            let status = PdhGetFormattedCounterArrayW(
                counter,
                PDH_FMT_DOUBLE,
                &mut buffer_size,
                &mut item_count,
                Some(items_ptr),
            );

            if status != 0 {
                return map;
            }

            let items = std::slice::from_raw_parts(items_ptr, item_count as usize);
            for item in items {
                if let Ok(name) = item.szName.to_string() {
                    if let Some(pid) = parse_pid_from_instance(&name) {
                        let value = item.FmtValue.Anonymous.doubleValue;
                        *map.entry(pid).or_insert(0.0) += value as f32;
                    }
                }
            }
        }

        map
    }
}

impl Drop for GpuMonitor {
    fn drop(&mut self) {
        if let Some(query) = self.pdh_query {
            unsafe {
                let _ = PdhCloseQuery(query);
            }
        }
    }
}

// PDH handle types are opaque isize handles — safe to move across threads
// when only accessed under the SystemMetrics mutex.
unsafe impl Send for GpuMonitor {}

/// Parse PID from a GPU Engine counter instance name.
/// Format: "pid_12345_luid_0x00000000_0x0000ABCD_phys_0_eng_0_engtype_3D"
fn parse_pid_from_instance(name: &str) -> Option<u32> {
    let name = name.strip_prefix("pid_")?;
    let end = name.find('_')?;
    name[..end].parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_pid_from_instance_basic() {
        assert_eq!(
            parse_pid_from_instance(
                "pid_12345_luid_0x00000000_0x0000ABCD_phys_0_eng_0_engtype_3D"
            ),
            Some(12345)
        );
    }

    #[test]
    fn test_parse_pid_from_instance_large_pid() {
        assert_eq!(
            parse_pid_from_instance("pid_4294967295_luid_0x00_phys_0_eng_0_engtype_Copy"),
            Some(4294967295)
        );
    }

    #[test]
    fn test_parse_pid_from_instance_invalid() {
        assert_eq!(parse_pid_from_instance(""), None);
        assert_eq!(parse_pid_from_instance("no_pid_here"), None);
        assert_eq!(parse_pid_from_instance("pid_notanumber_luid"), None);
        assert_eq!(parse_pid_from_instance("pid_"), None);
    }

    #[test]
    fn test_gpu_monitor_new_graceful() {
        // Verifies GpuMonitor::new() doesn't panic even without GPU hardware
        let _monitor = GpuMonitor::new();
    }

    #[test]
    fn test_gpu_snapshot_default() {
        let snap = GpuSnapshot {
            system_gpu_percent: None,
            system_vram_used: None,
            system_vram_total: None,
            per_process_gpu: HashMap::new(),
            per_process_vram: HashMap::new(),
        };
        assert!(snap.per_process_gpu.is_empty());
        assert!(snap.per_process_vram.is_empty());
        assert!(snap.system_gpu_percent.is_none());
    }
}
