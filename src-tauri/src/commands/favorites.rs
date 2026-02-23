use tauri::State;

use crate::services::cache_db::CacheDbHandle;
use crate::utils::error::{AppError, MutexExt};

#[tauri::command]
pub async fn toggle_favorite(
    game_id: String,
    is_favorite: bool,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    tracing::info!(game_id = %game_id, is_favorite, "Toggling favorite");
    let db = db.lock_or_err("DB")?;
    db.set_favorite(&game_id, is_favorite)
}

#[tauri::command]
pub async fn get_all_favorites(
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<String>, AppError> {
    tracing::debug!("Fetching all favorites");
    let db = db.lock_or_err("DB")?;
    db.get_all_favorites()
}
