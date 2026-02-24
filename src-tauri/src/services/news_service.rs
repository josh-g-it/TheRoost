use crate::models::news::*;
use crate::services::cache_db::CacheDbHandle;
use crate::services::steam_client::steam_get_json;
use crate::utils::error::{AppError, MutexExt};

/// Fetch news for a game. Results are cached in SQLite with a 1-hour TTL.
pub async fn fetch_game_news(
    game_id: &str,
    appid: u32,
    count: u32,
    db: &CacheDbHandle,
) -> Result<Vec<GameNewsItem>, AppError> {
    // Check cache first
    {
        let db = db.lock_or_err("DB")?;
        if db.is_news_fresh(game_id)? {
            let items = db.get_game_news(game_id)?;
            if !items.is_empty() {
                tracing::debug!(game_id, count = items.len(), "News cache hit");
                return Ok(items);
            }
        }
    }

    tracing::info!(game_id, appid, count, "Fetching game news from Steam API");

    // No API key needed for this endpoint
    let appid_str = appid.to_string();
    let count_str = count.to_string();
    let news_resp: NewsResponse = steam_get_json(
        "/ISteamNews/GetNewsForApp/v2/",
        &[
            ("appid", &appid_str),
            ("count", &count_str),
            ("maxlength", "500"),
            ("format", "json"),
        ],
    )
    .await?;

    let items: Vec<GameNewsItem> = news_resp
        .appnews
        .newsitems
        .into_iter()
        .map(|item| GameNewsItem {
            news_id: item.gid,
            game_id: game_id.to_string(),
            title: item.title,
            url: item.url,
            author: item.author,
            contents: item.contents,
            date: item.date,
            feed_label: item.feedlabel,
        })
        .collect();

    // Cache the result
    {
        let db = db.lock_or_err("DB")?;
        if let Err(e) = db.cache_game_news(game_id, &items) {
            tracing::warn!(game_id, error = %e, "Failed to cache game news");
        }
    }

    tracing::info!(game_id, count = items.len(), "Game news fetched and cached");
    Ok(items)
}

/// Fetch the list of game appids the user follows on Steam.
pub async fn fetch_followed_games(api_key: &str, steam_id: &str) -> Result<Vec<u32>, AppError> {
    tracing::info!("Fetching followed games from Steam API");

    let followed: FollowedGamesResponse = steam_get_json(
        "/IStoreService/GetGamesFollowed/v1/",
        &[("key", api_key), ("steamid", steam_id), ("format", "json")],
    )
    .await?;

    let appids: Vec<u32> = followed
        .response
        .games
        .unwrap_or_default()
        .into_iter()
        .map(|g| g.appid)
        .collect();

    tracing::info!(count = appids.len(), "Followed games fetched");
    Ok(appids)
}
