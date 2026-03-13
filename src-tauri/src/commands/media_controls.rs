use crate::models::media_session::MediaSessionSnapshot;
use crate::services::media_controls;
use crate::utils::error::AppError;

/// Get the current media session snapshot (track info + playback status).
///
/// Must be `async` so Tauri runs it on the tokio thread pool, NOT the main thread.
/// The WinRT SMTC APIs use `.join()` which blocks waiting for an async callback
/// that must be dispatched through the thread's message pump. If this runs on the
/// main thread (synchronous command), it deadlocks — the main thread blocks on
/// `.join()` while the WinRT callback waits for the main thread's message pump.
#[tauri::command]
pub async fn get_media_session() -> MediaSessionSnapshot {
    media_controls::get_media_snapshot()
}

/// Toggle play/pause on the current media session.
#[tauri::command]
pub async fn media_toggle_play_pause() -> Result<(), AppError> {
    media_controls::toggle_play_pause()
        .map_err(|e| AppError::StoreApi(format!("Media control failed: {}", e)))
}

/// Skip to the next track.
#[tauri::command]
pub async fn media_skip_next() -> Result<(), AppError> {
    media_controls::skip_next()
        .map_err(|e| AppError::StoreApi(format!("Media control failed: {}", e)))
}

/// Skip to the previous track.
#[tauri::command]
pub async fn media_skip_previous() -> Result<(), AppError> {
    media_controls::skip_previous()
        .map_err(|e| AppError::StoreApi(format!("Media control failed: {}", e)))
}
