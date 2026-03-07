use tauri::{Emitter, State};

use crate::services::cache_db::CacheDbHandle;
use crate::utils::error::{AppError, MutexExt};

#[tauri::command]
pub async fn toggle_hidden(
    game_id: String,
    is_hidden: bool,
    db: State<'_, CacheDbHandle>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    tracing::info!(game_id = %game_id, is_hidden, "Toggling hidden state");
    {
        let db = db.lock_or_err("DB")?;
        db.set_hidden(&game_id, is_hidden)?;
    }

    // Broadcast to all windows for cross-window sync.
    if let Err(e) = app_handle.emit("hidden-changed", &game_id) {
        tracing::warn!(error = %e, "Failed to emit hidden-changed");
    }

    Ok(())
}

#[tauri::command]
pub async fn get_all_hidden(db: State<'_, CacheDbHandle>) -> Result<Vec<String>, AppError> {
    tracing::debug!("Fetching all hidden games");
    let db = db.lock_or_err("DB")?;
    db.get_all_hidden()
}
