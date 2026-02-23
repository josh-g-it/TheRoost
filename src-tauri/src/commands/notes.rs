use tauri::State;

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
) -> Result<GameNote, AppError> {
    tracing::debug!(game_id = %game_id, len = content.len(), "Saving game note");
    let db = db.lock_or_err("DB")?;
    db.save_game_note(&game_id, &content)
}

#[tauri::command]
pub async fn delete_game_note(
    game_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    tracing::info!(game_id = %game_id, "Deleting game note");
    let db = db.lock_or_err("DB")?;
    db.delete_game_note(&game_id)
}

#[tauri::command]
pub async fn get_all_notes_with_content(
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<GameNoteWithName>, AppError> {
    tracing::debug!("Fetching all notes with content");
    let db = db.lock_or_err("DB")?;
    db.get_all_notes_with_content()
}
