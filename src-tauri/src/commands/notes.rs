use tauri::{Emitter, State};

use crate::models::note::{GameNote, GameNoteWithName};
use crate::services::cache_db::CacheDbHandle;
use crate::utils::error::{AppError, MutexExt};

#[tauri::command]
pub async fn get_game_note(
    game_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<Option<GameNote>, AppError> {
    tracing::debug!(game_id = %game_id, "Fetching game note");
    let db = db.lock_or_err("DB")?;
    db.get_game_note(&game_id)
}

#[tauri::command]
pub async fn save_game_note(
    game_id: String,
    content: String,
    db: State<'_, CacheDbHandle>,
    app_handle: tauri::AppHandle,
) -> Result<GameNote, AppError> {
    if content.chars().count() > 5000 {
        return Err(AppError::Validation(
            "Note content exceeds maximum length of 5000 characters".into(),
        ));
    }
    tracing::debug!(game_id = %game_id, len = content.len(), "Saving game note");
    let note = {
        let db = db.lock_or_err("DB")?;
        db.save_game_note(&game_id, &content)?
    }; // DB lock dropped before event emission

    // Broadcast note change to all windows for cross-window sync (KI #16).
    // Both the main /notes page and overlay game-notes panel receive this event.
    if let Err(e) = app_handle.emit("note-changed", &note) {
        tracing::warn!(error = %e, "Failed to emit note-changed");
    }

    Ok(note)
}

#[tauri::command]
pub async fn delete_game_note(
    game_id: String,
    db: State<'_, CacheDbHandle>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    tracing::info!(game_id = %game_id, "Deleting game note");
    {
        let db = db.lock_or_err("DB")?;
        db.delete_game_note(&game_id)?;
    } // DB lock dropped before event emission

    // Broadcast note deletion to all windows for cross-window sync.
    if let Err(e) = app_handle.emit("note-deleted", &game_id) {
        tracing::warn!(error = %e, "Failed to emit note-deleted");
    }

    Ok(())
}

#[tauri::command]
pub async fn get_all_notes_with_content(
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<GameNoteWithName>, AppError> {
    tracing::debug!("Fetching all notes with content");
    let db = db.lock_or_err("DB")?;
    db.get_all_notes_with_content()
}
