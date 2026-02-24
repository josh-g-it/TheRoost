use tauri::State;

use crate::models::achievement::GameAchievementSummary;
use crate::services::achievement_service;
use crate::services::cache_db::CacheDbHandle;
use crate::utils::error::{AppError, MutexExt};

#[tauri::command]
pub async fn fetch_game_achievements(
    api_key: String,
    steam_id: String,
    game_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<GameAchievementSummary, AppError> {
    // Resolve the steam appid from game_id
    let appid = match achievement_service::resolve_steam_appid(&game_id, db.inner())? {
        Some(id) => id,
        None => {
            tracing::debug!(game_id, "Non-Steam game, no achievements available");
            return Ok(GameAchievementSummary {
                game_id,
                total: 0,
                unlocked: 0,
                achievements: Vec::new(),
            });
        }
    };

    achievement_service::fetch_game_achievements(&api_key, &steam_id, &game_id, appid, db.inner())
        .await
}

#[tauri::command]
pub async fn get_all_achievement_stats(
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<(String, u32, u32)>, AppError> {
    let db = db.lock_or_err("DB")?;
    db.get_all_achievement_summaries()
}

#[tauri::command]
pub async fn batch_fetch_achievements(
    api_key: String,
    steam_id: String,
    db: State<'_, CacheDbHandle>,
    app_handle: tauri::AppHandle,
) -> Result<u32, AppError> {
    achievement_service::batch_fetch_achievements(&api_key, &steam_id, db.inner(), &app_handle)
        .await
}

#[tauri::command]
pub async fn clear_achievement_cache(db: State<'_, CacheDbHandle>) -> Result<u32, AppError> {
    let db = db.lock_or_err("DB")?;
    db.clear_achievement_cache()
}
