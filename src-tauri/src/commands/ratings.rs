use tauri::State;

use crate::models::rating::GameRating;
use crate::services::cache_db::CacheDbHandle;
use crate::utils::error::{AppError, MutexExt};

#[tauri::command]
pub async fn get_game_rating(
    game_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<Option<GameRating>, AppError> {
    tracing::debug!(game_id = %game_id, "Fetching game rating");
    let db = db.lock_or_err("DB")?;
    db.get_game_rating(&game_id)
}

#[tauri::command]
pub async fn save_game_rating(
    game_id: String,
    rating: u8,
    review: Option<String>,
    db: State<'_, CacheDbHandle>,
) -> Result<GameRating, AppError> {
    tracing::info!(game_id = %game_id, rating, "Saving game rating");
    let db = db.lock_or_err("DB")?;
    db.save_game_rating(&game_id, rating, review.as_deref())
}

#[tauri::command]
pub async fn delete_game_rating(
    game_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    tracing::info!(game_id = %game_id, "Deleting game rating");
    let db = db.lock_or_err("DB")?;
    db.delete_game_rating(&game_id)
}

#[tauri::command]
pub async fn get_all_ratings(db: State<'_, CacheDbHandle>) -> Result<Vec<GameRating>, AppError> {
    tracing::debug!("Fetching all ratings");
    let db = db.lock_or_err("DB")?;
    db.get_all_ratings()
}
