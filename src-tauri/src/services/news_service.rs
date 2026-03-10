use std::collections::HashSet;

use crate::models::news::*;
use crate::services::cache_db::CacheDbHandle;
use crate::services::steam_client::steam_get_json;
use crate::utils::error::{AppError, MutexExt};

/// Fetch news for a game. Results are cached in SQLite with a 1-hour TTL.
/// When `force` is true, the cache TTL is bypassed and fresh data is fetched.
pub async fn fetch_game_news(
    game_id: &str,
    appid: u32,
    count: u32,
    db: &CacheDbHandle,
    force: bool,
) -> Result<Vec<GameNewsItem>, AppError> {
    // Check cache first (skip when force-refreshing)
    if !force {
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
            is_external: item.feed_type == 0,
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

/// Build an aggregated news feed from favorites + recently played games.
/// Reuses `fetch_game_news` per-game (respects 1-hour cache TTL unless `force` is true).
/// Articles whose `feed_label` is in `blocked_sources` are excluded from the result.
pub async fn fetch_news_feed(
    db: &CacheDbHandle,
    force: bool,
    blocked_sources: &std::collections::HashSet<String>,
) -> Result<Vec<FeedNewsItem>, AppError> {
    // Step 1: Gather candidate game IDs (favorites + recent 15 days)
    let games: Vec<(String, u32, String)> = {
        let db_guard = db.lock_or_err("DB")?;
        let fav_ids = db_guard.get_all_favorites().unwrap_or_default();
        let recent_ids = db_guard
            .get_recently_played_game_ids(15)
            .unwrap_or_default();

        let mut seen = HashSet::new();
        let mut result = Vec::new();

        for game_id in fav_ids.into_iter().chain(recent_ids.into_iter()) {
            if !seen.insert(game_id.clone()) {
                continue;
            }
            // Only Steam games have news via this API
            if let Ok(Some((source, source_id))) = db_guard.get_game_source(&game_id) {
                if source == "steam" {
                    if let Ok(appid) = source_id.parse::<u32>() {
                        let name = db_guard
                            .get_game_name(&game_id)
                            .ok()
                            .flatten()
                            .unwrap_or_default();
                        result.push((game_id, appid, name));
                    }
                }
            }
        }
        result
    };

    if games.is_empty() {
        tracing::debug!("No Steam games in scope for news feed");
        return Ok(Vec::new());
    }

    tracing::info!(game_count = games.len(), "Building news feed");

    // Step 2: Fetch news per game (5 articles each, uses cache)
    let mut all_items: Vec<(GameNewsItem, String, String)> = Vec::new();
    for (game_id, appid, game_name) in &games {
        let source_id = appid.to_string();
        match fetch_game_news(game_id, *appid, 5, db, force).await {
            Ok(items) => {
                for item in items {
                    all_items.push((item, game_name.clone(), source_id.clone()));
                }
            }
            Err(e) => {
                tracing::warn!(game_id, error = %e, "Failed to fetch news for game, skipping");
            }
        }
    }

    // Step 2b: Filter out permanently banned + user-blocked sources
    {
        let before = all_items.len();
        all_items.retain(|(item, _, _)| {
            !is_permanently_blocked(&item.feed_label) && !blocked_sources.contains(&item.feed_label)
        });
        let filtered = before - all_items.len();
        if filtered > 0 {
            tracing::debug!(filtered, "Excluded articles from blocked news sources");
        }
    }

    if all_items.is_empty() {
        return Ok(Vec::new());
    }

    // Step 3: Batch-query read status
    let news_ids: Vec<String> = all_items
        .iter()
        .map(|(item, _, _)| item.news_id.clone())
        .collect();
    let read_ids = {
        let db_guard = db.lock_or_err("DB")?;
        db_guard.get_read_news_ids(&news_ids).unwrap_or_default()
    };

    // Step 4: Assemble FeedNewsItems
    let mut feed: Vec<FeedNewsItem> = all_items
        .into_iter()
        .map(|(item, game_name, source_id)| {
            let is_read = read_ids.contains(&item.news_id);
            FeedNewsItem {
                news_id: item.news_id,
                game_id: item.game_id,
                game_name,
                source_id,
                title: item.title,
                url: item.url,
                author: item.author,
                contents: item.contents,
                date: item.date,
                feed_label: item.feed_label,
                is_external: item.is_external,
                is_read,
            }
        })
        .collect();

    // Step 5: Sort by date descending (newest first)
    feed.sort_by(|a, b| b.date.cmp(&a.date));

    tracing::info!(count = feed.len(), "News feed assembled");
    Ok(feed)
}

/// Domain suffixes that are permanently blocked from the news feed.
/// These sources are excluded at fetch time and hidden from the settings UI.
const PERMANENTLY_BLOCKED_DOMAINS: &[&str] = &[".ru", ".cn", ".com.cn"];

/// Exact feed labels that are permanently blocked.
const PERMANENTLY_BLOCKED_LABELS: &[&str] = &["Gamemag.ru"];

/// Check if a feed label is permanently blocked (banned domains or exact matches).
pub fn is_permanently_blocked(label: &str) -> bool {
    let lower = label.to_lowercase();
    if PERMANENTLY_BLOCKED_LABELS
        .iter()
        .any(|b| lower == b.to_lowercase())
    {
        return true;
    }
    PERMANENTLY_BLOCKED_DOMAINS
        .iter()
        .any(|suffix| lower.ends_with(suffix))
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
