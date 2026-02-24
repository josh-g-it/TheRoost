use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession, GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};

use crate::models::media_session::{MediaPlaybackStatus, MediaSessionSnapshot};

/// Get a snapshot of the current media session. Never panics — returns empty snapshot on any error.
pub fn get_media_snapshot() -> MediaSessionSnapshot {
    match try_get_media_snapshot() {
        Ok(snap) => snap,
        Err(e) => {
            tracing::debug!(error = %e, "Failed to query SMTC");
            empty_snapshot()
        }
    }
}

fn try_get_media_snapshot() -> Result<MediaSessionSnapshot, Box<dyn std::error::Error>> {
    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.join()?;

    let session: GlobalSystemMediaTransportControlsSession = match manager.GetCurrentSession() {
        Ok(s) => s,
        Err(_) => return Ok(empty_snapshot()),
    };

    // Get playback info
    let playback_info = session.GetPlaybackInfo()?;
    let status = match playback_info.PlaybackStatus()? {
        GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing => {
            MediaPlaybackStatus::Playing
        }
        GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused => {
            MediaPlaybackStatus::Paused
        }
        GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped => {
            MediaPlaybackStatus::Stopped
        }
        GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed => {
            MediaPlaybackStatus::Closed
        }
        _ => MediaPlaybackStatus::Unknown,
    };

    // Get media properties (async — .join() blocks until complete)
    let props = session.TryGetMediaPropertiesAsync()?.join()?;
    let title = props.Title()?.to_string_lossy();
    let artist = props.Artist()?.to_string_lossy();
    let album = props.AlbumTitle()?.to_string_lossy();

    // Source app identity
    let source_app_id = session
        .SourceAppUserModelId()
        .map(|s| s.to_string_lossy())
        .unwrap_or_default();

    Ok(MediaSessionSnapshot {
        title,
        artist,
        album,
        source_app_id,
        status,
        has_session: true,
    })
}

/// Execute a command on the current SMTC session.
fn with_current_session<F>(f: F) -> Result<(), String>
where
    F: FnOnce(&GlobalSystemMediaTransportControlsSession) -> windows::core::Result<()>,
{
    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|e| e.to_string())?
        .join()
        .map_err(|e| e.to_string())?;

    let session = manager.GetCurrentSession().map_err(|e| e.to_string())?;
    f(&session).map_err(|e| e.to_string())
}

/// Toggle play/pause on the current media session.
pub fn toggle_play_pause() -> Result<(), String> {
    with_current_session(|session| {
        session.TryTogglePlayPauseAsync()?.join()?;
        Ok(())
    })
}

/// Skip to next track.
pub fn skip_next() -> Result<(), String> {
    with_current_session(|session| {
        session.TrySkipNextAsync()?.join()?;
        Ok(())
    })
}

/// Skip to previous track.
pub fn skip_previous() -> Result<(), String> {
    with_current_session(|session| {
        session.TrySkipPreviousAsync()?.join()?;
        Ok(())
    })
}

fn empty_snapshot() -> MediaSessionSnapshot {
    MediaSessionSnapshot {
        title: String::new(),
        artist: String::new(),
        album: String::new(),
        source_app_id: String::new(),
        status: MediaPlaybackStatus::Closed,
        has_session: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_snapshot_values() {
        let snap = empty_snapshot();
        assert!(!snap.has_session);
        assert!(snap.title.is_empty());
        assert!(snap.artist.is_empty());
        assert!(snap.album.is_empty());
        assert!(snap.source_app_id.is_empty());
        assert_eq!(snap.status, MediaPlaybackStatus::Closed);
    }

    #[test]
    fn test_get_media_snapshot_graceful() {
        // Should never panic even if SMTC is unavailable (e.g., CI without audio)
        let snap = get_media_snapshot();
        if !snap.has_session {
            assert_eq!(snap.status, MediaPlaybackStatus::Closed);
        }
    }
}
