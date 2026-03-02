use tauri::State;

use crate::models::news::{FeedNewsItem, GameNewsItem};
use crate::services::achievement_service;
use crate::services::cache_db::CacheDbHandle;
use crate::services::news_service;
use crate::utils::error::{AppError, MutexExt};

#[tauri::command]
pub async fn fetch_game_news(
    game_id: String,
    count: Option<u32>,
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<GameNewsItem>, AppError> {
    // Resolve the steam appid from game_id
    let appid = match achievement_service::resolve_steam_appid(&game_id, db.inner())? {
        Some(id) => id,
        None => {
            tracing::debug!(game_id, "Non-Steam game, no news available");
            return Ok(Vec::new());
        }
    };

    news_service::fetch_game_news(&game_id, appid, count.unwrap_or(10), db.inner(), false).await
}

#[tauri::command]
pub async fn fetch_followed_games(steam_id: String) -> Result<Vec<u32>, AppError> {
    let api_key = crate::services::credential_store::load_api_key()?.ok_or_else(|| {
        AppError::Credential(
            "Steam API key not configured. Add it in Settings > Connections.".into(),
        )
    })?;
    news_service::fetch_followed_games(&api_key, &steam_id).await
}

#[tauri::command]
pub async fn fetch_news_feed(
    force: Option<bool>,
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<FeedNewsItem>, AppError> {
    news_service::fetch_news_feed(db.inner(), force.unwrap_or(false)).await
}

#[tauri::command]
pub async fn mark_news_read(
    news_id: String,
    game_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    let db = db.lock_or_err("DB")?;
    db.mark_news_read(&news_id, &game_id)?;
    Ok(())
}

#[tauri::command]
pub async fn get_unread_news_count(db: State<'_, CacheDbHandle>) -> Result<u32, AppError> {
    let db = db.lock_or_err("DB")?;
    db.get_unread_news_count()
}

#[tauri::command]
pub async fn clear_news_cache(db: State<'_, CacheDbHandle>) -> Result<u32, AppError> {
    let db = db.lock_or_err("DB")?;
    db.clear_news_cache()
}
