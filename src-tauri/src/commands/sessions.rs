use tauri::State;

use crate::models::session::GameSession;
use crate::services::cache_db::CacheDbHandle;
use crate::utils::error::{AppError, MutexExt};

#[tauri::command]
pub async fn get_game_sessions(
    game_id: String,
    limit: u32,
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<GameSession>, AppError> {
    let db = db.lock_or_err("DB")?;
    db.get_sessions(&game_id, limit)
}

#[tauri::command]
pub async fn get_recent_sessions(
    limit: u32,
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<GameSession>, AppError> {
    let db = db.lock_or_err("DB")?;
    db.get_recent_sessions(limit)
}

#[tauri::command]
pub async fn get_active_sessions(
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<GameSession>, AppError> {
    let db = db.lock_or_err("DB")?;
    db.get_all_active_sessions()
}
