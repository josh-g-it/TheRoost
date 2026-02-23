use crate::models::media_session::MediaSessionSnapshot;
use crate::services::media_controls;
use crate::utils::error::AppError;

/// Get the current media session snapshot (track info + playback status).
#[tauri::command]
pub fn get_media_session() -> MediaSessionSnapshot {
    media_controls::get_media_snapshot()
}

/// Toggle play/pause on the current media session.
#[tauri::command]
pub fn media_toggle_play_pause() -> Result<(), AppError> {
    media_controls::toggle_play_pause()
        .map_err(|e| AppError::StoreApi(format!("Media control failed: {}", e)))
}

/// Skip to the next track.
#[tauri::command]
pub fn media_skip_next() -> Result<(), AppError> {
    media_controls::skip_next()
        .map_err(|e| AppError::StoreApi(format!("Media control failed: {}", e)))
}

/// Skip to the previous track.
#[tauri::command]
pub fn media_skip_previous() -> Result<(), AppError> {
    media_controls::skip_previous()
        .map_err(|e| AppError::StoreApi(format!("Media control failed: {}", e)))
}
