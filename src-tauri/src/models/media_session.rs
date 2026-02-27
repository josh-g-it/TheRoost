use serde::{Deserialize, Serialize};

/// Playback status for a media session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MediaPlaybackStatus {
    Playing,
    Paused,
    Stopped,
    Closed,
    /// Catch-all for unknown/changed SMTC states
    Unknown,
}

/// Snapshot of the current media session returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSessionSnapshot {
    /// Track title (empty string if unavailable)
    pub title: String,
    /// Artist name (empty string if unavailable)
    pub artist: String,
    /// Album name (empty string if unavailable)
    pub album: String,
    /// Source app identity (e.g. "Spotify.exe", "chrome.exe")
    pub source_app_id: String,
    /// Current playback status
    pub status: MediaPlaybackStatus,
    /// Whether this is a valid/active session
    pub has_session: bool,
    /// Base64-encoded thumbnail/cover art (None if unavailable)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_b64: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serialization_camel_case() {
        let snap = MediaSessionSnapshot {
            title: "Test Song".to_string(),
            artist: "Test Artist".to_string(),
            album: "Test Album".to_string(),
            source_app_id: "spotify.exe".to_string(),
            status: MediaPlaybackStatus::Playing,
            has_session: true,
            thumbnail_b64: None,
        };
        let json = serde_json::to_string(&snap).unwrap();
        assert!(json.contains("\"status\":\"playing\""));
        assert!(json.contains("\"hasSession\":true"));
        assert!(json.contains("\"sourceAppId\":\"spotify.exe\""));
    }

    #[test]
    fn test_playback_status_variants() {
        let cases = vec![
            (MediaPlaybackStatus::Playing, "\"playing\""),
            (MediaPlaybackStatus::Paused, "\"paused\""),
            (MediaPlaybackStatus::Stopped, "\"stopped\""),
            (MediaPlaybackStatus::Closed, "\"closed\""),
            (MediaPlaybackStatus::Unknown, "\"unknown\""),
        ];
        for (status, expected) in cases {
            let json = serde_json::to_string(&status).unwrap();
            assert_eq!(json, expected);
        }
    }
}
