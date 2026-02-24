use tauri::State;

use crate::models::news::GameNewsItem;
use crate::services::achievement_service;
use crate::services::cache_db::CacheDbHandle;
use crate::services::news_service;
use crate::utils::error::AppError;

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

    news_service::fetch_game_news(&game_id, appid, count.unwrap_or(10), db.inner()).await
}

#[tauri::command]
pub async fn fetch_followed_games(api_key: String, steam_id: String) -> Result<Vec<u32>, AppError> {
    news_service::fetch_followed_games(&api_key, &steam_id).await
}
