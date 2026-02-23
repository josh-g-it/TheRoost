use serde::{Deserialize, Serialize};

/// A single audio session (an application producing sound).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSession {
    /// OS process ID that owns this session (0 = system sounds).
    pub pid: u32,
    /// Display name (app name or "System Sounds").
    pub display_name: String,
    /// Executable file name (e.g. "spotify.exe").
    pub exe_name: String,
    /// Current volume level, 0.0 to 1.0.
    pub volume: f32,
    /// Whether the session is muted.
    pub is_muted: bool,
    /// Current peak audio level, 0.0 to 1.0 (from IAudioMeterInformation).
    pub peak_level: f32,
}

/// An audio endpoint device (speaker, headset, microphone, etc.).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    /// Opaque device ID used for SetDefaultEndpoint.
    pub id: String,
    /// Hardware name (e.g. "Speakers (Realtek Audio)").
    pub name: String,
    /// Whether this is the current default device.
    pub is_default: bool,
    /// User-defined alias from the database, if set.
    pub custom_name: Option<String>,
}

/// Persisted per-exe-name visibility preference for the auto-hide feature.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSessionPref {
    pub exe_name: String,
    pub hidden: bool,
}

/// Complete audio state snapshot returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSnapshot {
    /// Master volume of the default render device (0.0–1.0).
    pub master_volume: f32,
    /// Whether master is muted.
    pub master_muted: bool,
    /// Active audio sessions on the default render device.
    pub sessions: Vec<AudioSession>,
    /// Available output (render) devices.
    pub output_devices: Vec<AudioDevice>,
    /// Available input (capture) devices.
    pub input_devices: Vec<AudioDevice>,
    /// Persisted session hide preferences (by exe name).
    pub session_prefs: Vec<AudioSessionPref>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_session_serialization() {
        let session = AudioSession {
            pid: 1234,
            display_name: "Spotify".to_string(),
            exe_name: "spotify.exe".to_string(),
            volume: 0.75,
            is_muted: false,
            peak_level: 0.42,
        };
        let json = serde_json::to_string(&session).unwrap();
        assert!(json.contains("\"displayName\""));
        assert!(json.contains("\"exeName\""));
        assert!(json.contains("\"isMuted\""));
        assert!(json.contains("\"peakLevel\""));
    }

    #[test]
    fn test_audio_snapshot_empty() {
        let snap = AudioSnapshot {
            master_volume: 1.0,
            master_muted: false,
            sessions: vec![],
            output_devices: vec![],
            input_devices: vec![],
            session_prefs: vec![],
        };
        let json = serde_json::to_string(&snap).unwrap();
        assert!(json.contains("\"masterVolume\""));
        assert!(json.contains("\"masterMuted\""));
        assert!(json.contains("\"outputDevices\""));
        assert!(json.contains("\"inputDevices\""));
        assert!(json.contains("\"sessionPrefs\""));
    }

    #[test]
    fn test_audio_device_custom_name() {
        let device = AudioDevice {
            id: "test-id".to_string(),
            name: "Speakers (Realtek)".to_string(),
            is_default: true,
            custom_name: Some("Desktop Speakers".to_string()),
        };
        let json = serde_json::to_string(&device).unwrap();
        assert!(json.contains("\"customName\""));
        assert!(json.contains("Desktop Speakers"));
    }

    #[test]
    fn test_audio_session_pref_serialization() {
        let pref = AudioSessionPref {
            exe_name: "spotify.exe".to_string(),
            hidden: true,
        };
        let json = serde_json::to_string(&pref).unwrap();
        assert!(json.contains("\"exeName\""));
        assert!(json.contains("\"hidden\""));
    }
}
