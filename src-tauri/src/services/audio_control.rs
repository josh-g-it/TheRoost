//! Audio control service — WASAPI session enumeration, volume control, and device management.
//!
//! Stateless per-call pattern (like media_controls.rs): each function creates fresh COM objects.

use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;

use windows::core::{Interface, GUID, HRESULT, PCWSTR, PWSTR};
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Media::Audio::{
    eCapture, eConsole, eRender, EDataFlow,
    IAudioSessionControl, IAudioSessionControl2, IAudioSessionEnumerator,
    IAudioSessionManager2, IMMDevice, IMMDeviceCollection, IMMDeviceEnumerator,
    ISimpleAudioVolume, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
};
use windows::Win32::Media::Audio::Endpoints::{IAudioEndpointVolume, IAudioMeterInformation};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ,
};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;

use crate::models::audio::{AudioDevice, AudioSession, AudioSnapshot};

// ── IPolicyConfig (undocumented but stable COM interface) ─────────────

// IPolicyConfig interface GUID
const IPOLICYCONFIG_GUID: GUID = GUID::from_values(
    0xf8679f50,
    0x850a,
    0x41cf,
    [0x9c, 0x72, 0x43, 0x0f, 0x29, 0x02, 0x90, 0xc8],
);

// PolicyConfigClient class GUID
const POLICYCONFIG_CLIENT_GUID: GUID = GUID::from_values(
    0x870af99c,
    0x171d,
    0x4f9e,
    [0xaf, 0x0d, 0xe6, 0x3d, 0xf4, 0x0c, 0x2b, 0xc9],
);

/// IPolicyConfig vtable — we only need SetDefaultEndpoint (index 12 in the vtable).
/// The interface inherits from IUnknown (3 methods) + has 10 methods before SetDefaultEndpoint.
#[repr(C)]
struct IPolicyConfigVtbl {
    // IUnknown
    query_interface: usize,
    add_ref: usize,
    release: usize,
    // IPolicyConfig methods 0-9 (we don't use these)
    _get_mix_format: usize,
    _get_device_format: usize,
    _reset_device_format: usize,
    _set_device_format: usize,
    _get_processing_period: usize,
    _set_processing_period: usize,
    _get_share_mode: usize,
    _set_share_mode: usize,
    _get_property_value: usize,
    _set_property_value: usize,
    // Method we need (index 13)
    set_default_endpoint: unsafe extern "system" fn(
        this: *mut std::ffi::c_void,
        device_id: PCWSTR,
        role: u32,
    ) -> HRESULT,
    _set_endpoint_visibility: usize,
}

// ── Public API ─────────────────────────────────────────────────────────

/// Get a complete audio snapshot. Never panics.
pub fn get_audio_snapshot() -> AudioSnapshot {
    match try_get_audio_snapshot() {
        Ok(snap) => snap,
        Err(e) => {
            tracing::debug!(error = %e, "Failed to get audio snapshot");
            empty_snapshot()
        }
    }
}

/// Set volume for a specific audio session by PID.
pub fn set_session_volume(pid: u32, volume: f32) -> Result<(), String> {
    let volume = volume.clamp(0.0, 1.0);
    with_session_volume(pid, |vol| unsafe {
        vol.SetMasterVolume(volume, std::ptr::null())
    })
}

/// Set mute state for a specific audio session by PID.
pub fn set_session_mute(pid: u32, muted: bool) -> Result<(), String> {
    with_session_volume(pid, |vol| unsafe {
        vol.SetMute(muted, std::ptr::null())
    })
}

/// Set the master volume of the default render device.
pub fn set_master_volume(volume: f32) -> Result<(), String> {
    let volume = volume.clamp(0.0, 1.0);
    unsafe {
        init_com();
        let enumerator = create_device_enumerator().map_err(|e| e.to_string())?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .map_err(|e| e.to_string())?;
        let endpoint_vol: IAudioEndpointVolume = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| e.to_string())?;
        endpoint_vol
            .SetMasterVolumeLevelScalar(volume, std::ptr::null())
            .map_err(|e| e.to_string())
    }
}

/// Set the master mute state.
pub fn set_master_mute(muted: bool) -> Result<(), String> {
    unsafe {
        init_com();
        let enumerator = create_device_enumerator().map_err(|e| e.to_string())?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .map_err(|e| e.to_string())?;
        let endpoint_vol: IAudioEndpointVolume = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| e.to_string())?;
        endpoint_vol
            .SetMute(muted, std::ptr::null())
            .map_err(|e| e.to_string())
    }
}

/// Set the default output (render) device.
pub fn set_default_output_device(device_id: &str) -> Result<(), String> {
    set_default_device(device_id)
}

/// Set the default input (capture) device.
pub fn set_default_input_device(device_id: &str) -> Result<(), String> {
    set_default_device(device_id)
}

// ── Internal helpers ───────────────────────────────────────────────────

fn init_com() {
    unsafe {
        // Idempotent: returns S_FALSE if already initialized with same model.
        // We ignore errors — if COM is already initialized differently, we proceed anyway.
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
}

unsafe fn create_device_enumerator() -> windows::core::Result<IMMDeviceEnumerator> {
    CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
}

fn try_get_audio_snapshot() -> Result<AudioSnapshot, Box<dyn std::error::Error>> {
    unsafe {
        init_com();
        let enumerator = create_device_enumerator()?;

        // ── Master volume ──
        let (master_volume, master_muted) = get_master_volume_info(&enumerator);

        // ── Audio sessions ──
        let sessions = enumerate_sessions(&enumerator);

        // ── Devices ──
        let output_devices = enumerate_devices(&enumerator, eRender);
        let input_devices = enumerate_devices(&enumerator, eCapture);

        Ok(AudioSnapshot {
            master_volume,
            master_muted,
            sessions,
            output_devices,
            input_devices,
            session_prefs: vec![], // Populated by command layer from DB
        })
    }
}

unsafe fn get_master_volume_info(enumerator: &IMMDeviceEnumerator) -> (f32, bool) {
    let device = match enumerator.GetDefaultAudioEndpoint(eRender, eConsole) {
        Ok(d) => d,
        Err(_) => return (1.0, false),
    };
    let endpoint_vol: IAudioEndpointVolume = match device.Activate(CLSCTX_ALL, None) {
        Ok(v) => v,
        Err(_) => return (1.0, false),
    };
    let volume = endpoint_vol.GetMasterVolumeLevelScalar().unwrap_or(1.0);
    let muted = endpoint_vol.GetMute().map(|b| b.as_bool()).unwrap_or(false);
    (volume, muted)
}

unsafe fn enumerate_sessions(enumerator: &IMMDeviceEnumerator) -> Vec<AudioSession> {
    let device = match enumerator.GetDefaultAudioEndpoint(eRender, eConsole) {
        Ok(d) => d,
        Err(_) => return vec![],
    };

    let session_mgr: IAudioSessionManager2 = match device.Activate(CLSCTX_ALL, None) {
        Ok(m) => m,
        Err(_) => return vec![],
    };

    let session_enum: IAudioSessionEnumerator = match session_mgr.GetSessionEnumerator() {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    let count = match session_enum.GetCount() {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let mut sessions = Vec::new();

    for i in 0..count {
        let control: IAudioSessionControl = match session_enum.GetSession(i) {
            Ok(c) => c,
            Err(_) => continue,
        };

        // Get extended control for PID
        let control2: IAudioSessionControl2 = match control.cast() {
            Ok(c) => c,
            Err(_) => continue,
        };

        let pid = match control2.GetProcessId() {
            Ok(p) => p,
            Err(_) => continue,
        };

        // Get volume interface
        let volume_iface: ISimpleAudioVolume = match control.cast() {
            Ok(v) => v,
            Err(_) => continue,
        };

        let volume = volume_iface.GetMasterVolume().unwrap_or(1.0);
        let is_muted = volume_iface.GetMute().map(|b| b.as_bool()).unwrap_or(false);

        // Get peak level from IAudioMeterInformation (graceful fallback)
        let peak_level = match control.cast::<IAudioMeterInformation>() {
            Ok(meter) => meter.GetPeakValue().unwrap_or(0.0),
            Err(_) => 0.0,
        };

        // Resolve display name
        let display_name = get_session_display_name(&control2, pid);
        let exe_name = get_process_exe_name(pid);

        sessions.push(AudioSession {
            pid,
            display_name,
            exe_name,
            volume,
            is_muted,
            peak_level,
        });
    }

    sessions
}

/// Try to get a friendly display name for an audio session.
unsafe fn get_session_display_name(control: &IAudioSessionControl2, pid: u32) -> String {
    if pid == 0 {
        return "System Sounds".to_string();
    }

    // Try the session's own display name first
    if let Ok(name) = control.GetDisplayName() {
        let s = name.to_string();
        if let Ok(s) = s {
            let trimmed = s.trim().to_string();
            if !trimmed.is_empty() {
                return trimmed;
            }
        }
    }

    // Fall back to process exe name (strip .exe, capitalize)
    let exe = get_process_exe_name(pid);
    if exe != "Unknown" {
        let base = exe.trim_end_matches(".exe").trim_end_matches(".EXE");
        return base.to_string();
    }

    format!("PID {}", pid)
}

/// Get the executable name for a PID using sysinfo.
fn get_process_exe_name(pid: u32) -> String {
    if pid == 0 {
        return "System".to_string();
    }
    let sysinfo_pid = sysinfo::Pid::from_u32(pid);
    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[sysinfo_pid]), true);
    match sys.process(sysinfo_pid) {
        Some(proc) => proc.name().to_string_lossy().to_string(),
        None => "Unknown".to_string(),
    }
}

unsafe fn enumerate_devices(
    enumerator: &IMMDeviceEnumerator,
    flow: EDataFlow,
) -> Vec<AudioDevice> {
    let collection: IMMDeviceCollection =
        match enumerator.EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE) {
            Ok(c) => c,
            Err(_) => return vec![],
        };

    let count = match collection.GetCount() {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    // Get default device ID for comparison
    let default_id = enumerator
        .GetDefaultAudioEndpoint(flow, eConsole)
        .ok()
        .and_then(|d| d.GetId().ok())
        .map(|id| pwstr_to_string(id));

    let mut devices = Vec::new();

    for i in 0..count {
        let device: IMMDevice = match collection.Item(i) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let id = match device.GetId() {
            Ok(id) => {
                let s = pwstr_to_string(id);
                // Free the allocated string
                windows::Win32::System::Com::CoTaskMemFree(Some(id.0 as *const _));
                s
            }
            Err(_) => continue,
        };

        let name = get_device_name(&device);
        let is_default = default_id.as_deref() == Some(id.as_str());

        devices.push(AudioDevice {
            id,
            name,
            is_default,
            custom_name: None, // Populated by command layer from DB
        });
    }

    devices
}

/// Read the friendly name from a device's property store.
unsafe fn get_device_name(device: &IMMDevice) -> String {
    let store: IPropertyStore = match device.OpenPropertyStore(STGM_READ) {
        Ok(s) => s,
        Err(_) => return "Unknown Device".to_string(),
    };

    let prop = match store.GetValue(&PKEY_Device_FriendlyName) {
        Ok(p) => p,
        Err(_) => return "Unknown Device".to_string(),
    };

    // PROPVARIANT for VT_LPWSTR: the string is in Anonymous.Anonymous.Anonymous.pwszVal
    let pwsz = prop.Anonymous.Anonymous.Anonymous.pwszVal;
    if pwsz.0.is_null() {
        return "Unknown Device".to_string();
    }

    pwsz.to_string().unwrap_or_else(|_| "Unknown Device".to_string())
}

/// Convert a PWSTR to a Rust String (without freeing the pointer).
fn pwstr_to_string(pwstr: PWSTR) -> String {
    if pwstr.0.is_null() {
        return String::new();
    }
    unsafe {
        let len = (0..).take_while(|&i| *pwstr.0.add(i) != 0).count();
        let slice = std::slice::from_raw_parts(pwstr.0, len);
        OsString::from_wide(slice).to_string_lossy().to_string()
    }
}

/// Find an audio session by PID and apply a closure to its ISimpleAudioVolume.
fn with_session_volume<F>(pid: u32, f: F) -> Result<(), String>
where
    F: FnOnce(&ISimpleAudioVolume) -> windows::core::Result<()>,
{
    unsafe {
        init_com();
        let enumerator = create_device_enumerator().map_err(|e| e.to_string())?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .map_err(|e| e.to_string())?;

        let session_mgr: IAudioSessionManager2 =
            device.Activate(CLSCTX_ALL, None).map_err(|e| e.to_string())?;

        let session_enum = session_mgr.GetSessionEnumerator().map_err(|e| e.to_string())?;
        let count = session_enum.GetCount().map_err(|e| e.to_string())?;

        for i in 0..count {
            let control: IAudioSessionControl = match session_enum.GetSession(i) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let control2: IAudioSessionControl2 = match control.cast() {
                Ok(c) => c,
                Err(_) => continue,
            };

            if let Ok(session_pid) = control2.GetProcessId() {
                if session_pid == pid {
                    let volume_iface: ISimpleAudioVolume =
                        control.cast().map_err(|e| e.to_string())?;
                    return f(&volume_iface).map_err(|e| e.to_string());
                }
            }
        }

        Err(format!("No audio session found for PID {}", pid))
    }
}

/// Set the default audio device via IPolicyConfig.
fn set_default_device(device_id: &str) -> Result<(), String> {
    unsafe {
        init_com();

        // Create PolicyConfigClient COM object
        let policy: windows::core::IUnknown =
            CoCreateInstance(&POLICYCONFIG_CLIENT_GUID, None, CLSCTX_ALL)
                .map_err(|e| format!("Failed to create PolicyConfig: {}", e))?;

        // Get the raw COM pointer and query for IPolicyConfig
        let policy_ptr = policy.as_raw();

        // Read the vtable
        let vtbl_ptr = *(policy_ptr as *const *const IPolicyConfigVtbl);
        let vtbl = &*vtbl_ptr;

        // Encode device ID as wide string
        let wide: Vec<u16> = device_id.encode_utf16().chain(std::iter::once(0)).collect();
        let device_pcwstr = PCWSTR(wide.as_ptr());

        // Set for all three roles: eConsole=0, eMultimedia=1, eCommunications=2
        for role in 0u32..3 {
            let hr = (vtbl.set_default_endpoint)(policy_ptr as *mut _, device_pcwstr, role);
            if hr.is_err() {
                return Err(format!(
                    "SetDefaultEndpoint failed for role {}: 0x{:08x}",
                    role, hr.0
                ));
            }
        }

        Ok(())
    }
}

fn empty_snapshot() -> AudioSnapshot {
    AudioSnapshot {
        master_volume: 1.0,
        master_muted: false,
        sessions: vec![],
        output_devices: vec![],
        input_devices: vec![],
        session_prefs: vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_snapshot_graceful() {
        // Should never panic even in CI without audio hardware
        let snap = get_audio_snapshot();
        assert!(snap.master_volume >= 0.0 && snap.master_volume <= 1.0);
    }

    #[test]
    fn test_empty_snapshot_values() {
        let snap = empty_snapshot();
        assert_eq!(snap.master_volume, 1.0);
        assert!(!snap.master_muted);
        assert!(snap.sessions.is_empty());
        assert!(snap.output_devices.is_empty());
        assert!(snap.input_devices.is_empty());
    }

    #[test]
    fn test_pwstr_null() {
        let s = pwstr_to_string(PWSTR(std::ptr::null_mut()));
        assert!(s.is_empty());
    }
}
