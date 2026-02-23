use serde::{Deserialize, Serialize};

/// A single point-in-time system-wide sample.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSample {
    /// Unix timestamp (seconds) when this sample was taken
    pub timestamp: i64,
    /// System-wide CPU usage, 0.0–100.0
    pub cpu_percent: f32,
    /// Used physical memory in bytes
    pub ram_used: u64,
    /// Total physical memory in bytes
    pub ram_total: u64,
    /// GPU utilization %, None until GPU monitoring is implemented
    pub gpu_percent: Option<f32>,
    /// VRAM used in bytes, None until GPU monitoring is implemented
    pub gpu_vram_used: Option<u64>,
    /// VRAM total in bytes, None until GPU monitoring is implemented
    pub gpu_vram_total: Option<u64>,
}

/// Per-process resource metrics for a tracked process.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMetrics {
    /// OS process ID
    pub pid: u32,
    /// Game UUID, or "__self__" for The Roost's own process
    pub game_id: String,
    /// Display name (game name or "The Roost")
    pub name: String,
    /// Executable name (e.g. "portal2.exe")
    pub exe_name: String,
    /// CPU% normalized to 0–100 range (divided by cpu count)
    pub cpu_percent: f32,
    /// Resident memory in bytes
    pub ram_bytes: u64,
    /// GPU% per process (from Windows PDH — works for all GPU vendors)
    pub gpu_percent: Option<f32>,
    /// VRAM used by this process in bytes (from NVML — NVIDIA only)
    pub gpu_vram_bytes: Option<u64>,
}

/// Full snapshot returned to the frontend by get_system_metrics.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMetricsSnapshot {
    /// Current system-wide sample (latest from history)
    pub current: SystemSample,
    /// Rolling history buffer (up to 60 samples, oldest first)
    pub history: Vec<SystemSample>,
    /// Per-process metrics for tracked game processes + The Roost
    pub processes: Vec<ProcessMetrics>,
    /// Number of logical CPU cores
    pub cpu_count: usize,
}
