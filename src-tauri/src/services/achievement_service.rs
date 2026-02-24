use std::collections::HashMap;

use tauri::Emitter;

use crate::models::achievement::*;
use crate::services::cache_db::CacheDbHandle;
use crate::services::steam_client::{sanitize_steam_error, steam_get_json, steam_get_raw};
use crate::utils::error::{AppError, MutexExt};

/// Fetch achievements for a game, merging data from 3 Steam API endpoints.
/// Results are cached in SQLite with a 1-day TTL.
pub async fn fetch_game_achievements(
    api_key: &str,
    steam_id: &str,
    game_id: &str,
    appid: u32,
    db: &CacheDbHandle,
) -> Result<GameAchievementSummary, AppError> {
    // Check cache first (uses freshness table — covers games with AND without achievements)
    {
        let db = db.lock_or_err("DB")?;
        if db.is_achievements_fresh(game_id)? {
            let achievements = db.get_game_achievements(game_id)?;
            let unlocked = achievements.iter().filter(|a| a.achieved).count() as u32;
            let total = achievements.len() as u32;
            return Ok(GameAchievementSummary {
                game_id: game_id.to_string(),
                total,
                unlocked,
                achievements,
            });
        }
    }

    tracing::debug!(game_id, appid, "Fetching achievements from Steam API");

    // Fetch all 3 endpoints in parallel
    let (player_result, schema_result, global_result) = tokio::join!(
        fetch_player_achievements(api_key, steam_id, appid),
        fetch_schema(api_key, appid),
        fetch_global_percentages(appid),
    );

    // Player achievements — if this fails, the game likely has no achievements.
    // Mark as checked so we don't keep retrying.
    // EXCEPTION: 403 means privacy settings block ALL games — propagate error so
    // the batch can abort early and the frontend can show a helpful message.
    let player_achievements: Vec<ApiAchievement> = match player_result {
        Ok(achs) => achs,
        Err(ref e) if is_forbidden_error(e) => {
            tracing::warn!(
                game_id,
                "Steam returned 403 — game details are likely set to private"
            );
            return Err(AppError::StoreApi(
                "Steam profile game details are set to private. Set Game details to Public in Steam → Profile → Privacy Settings to enable achievements.".to_string(),
            ));
        }
        Err(e) => {
            tracing::debug!(game_id, appid, error = %e, "No player achievements (game may have none)");
            // Mark as checked so the batch doesn't retry this game
            if let Ok(db) = db.lock() {
                let _ = db.mark_achievements_checked(game_id);
            }
            return Ok(GameAchievementSummary {
                game_id: game_id.to_string(),
                total: 0,
                unlocked: 0,
                achievements: Vec::new(),
            });
        }
    };

    // Schema — optional enrichment
    let schema_map: HashMap<String, SchemaAchievement> = match schema_result {
        Ok(schemas) => schemas.into_iter().map(|s| (s.name.clone(), s)).collect(),
        Err(e) => {
            tracing::warn!(game_id, error = %e, "Failed to fetch achievement schema, continuing without");
            HashMap::new()
        }
    };

    // Global percentages — optional enrichment
    let global_map: HashMap<String, f64> = match global_result {
        Ok(globals) => globals
            .into_iter()
            .map(|g| (g.name.clone(), g.percent))
            .collect(),
        Err(e) => {
            tracing::warn!(game_id, error = %e, "Failed to fetch global percentages, continuing without");
            HashMap::new()
        }
    };

    // Merge all data
    let achievements: Vec<GameAchievement> = player_achievements
        .iter()
        .map(|pa| {
            let schema = schema_map.get(&pa.apiname);
            let global_percent = global_map.get(&pa.apiname).copied();

            GameAchievement {
                api_name: pa.apiname.clone(),
                display_name: schema
                    .and_then(|s| s.display_name.clone())
                    .unwrap_or_else(|| pa.apiname.clone()),
                description: schema.and_then(|s| s.description.clone()),
                icon_url: schema.and_then(|s| s.icon.clone()),
                icon_gray_url: schema.and_then(|s| s.icongray.clone()),
                hidden: schema.map(|s| s.hidden.unwrap_or(0) != 0).unwrap_or(false),
                achieved: pa.achieved != 0,
                unlock_time: if pa.achieved != 0 {
                    pa.unlocktime
                } else {
                    None
                },
                global_percent,
            }
        })
        .collect();

    let unlocked = achievements.iter().filter(|a| a.achieved).count() as u32;
    let total = achievements.len() as u32;

    // Cache the merged result + mark freshness
    {
        let db = db.lock_or_err("DB")?;
        if let Err(e) = db.cache_game_achievements(game_id, &achievements) {
            tracing::warn!(game_id, error = %e, "Failed to cache achievements");
        }
        if let Err(e) = db.mark_achievements_checked(game_id) {
            tracing::warn!(game_id, error = %e, "Failed to mark achievements freshness");
        }
    }

    tracing::debug!(game_id, total, unlocked, "Achievements fetched and cached");

    Ok(GameAchievementSummary {
        game_id: game_id.to_string(),
        total,
        unlocked,
        achievements,
    })
}

/// Resolve a game_id to its Steam appid. Returns None for non-Steam games.
pub fn resolve_steam_appid(game_id: &str, db: &CacheDbHandle) -> Result<Option<u32>, AppError> {
    let db = db.lock_or_err("DB")?;
    match db.get_game_source(game_id)? {
        Some((source, source_id)) if source == "steam" => Ok(source_id.parse::<u32>().ok()),
        _ => Ok(None),
    }
}

/// Check if an AppError represents a 403 Forbidden response.
fn is_forbidden_error(e: &AppError) -> bool {
    match e {
        AppError::StoreApi(msg) => msg.contains("403"),
        AppError::Http(reqwest_err) => reqwest_err
            .status()
            .map(|s| s.as_u16() == 403)
            .unwrap_or(false),
        _ => false,
    }
}

// ── Internal HTTP helpers ──────────────────────────────────────────

async fn fetch_player_achievements(
    api_key: &str,
    steam_id: &str,
    appid: u32,
) -> Result<Vec<ApiAchievement>, AppError> {
    let appid_str = appid.to_string();
    let response = steam_get_raw(
        "/ISteamUserStats/GetPlayerAchievements/v1/",
        &[
            ("key", api_key),
            ("steamid", steam_id),
            ("appid", &appid_str),
            ("format", "json"),
        ],
    )
    .await?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| sanitize_steam_error(e, "GetPlayerAchievements"))?;

    if !status.is_success() {
        tracing::warn!(appid, status = %status, "Steam GetPlayerAchievements returned HTTP error");
        return Err(AppError::StoreApi(format!(
            "Steam API returned HTTP {status} for appid {appid}"
        )));
    }

    let resp: AchievementsResponse = serde_json::from_str(&body).map_err(|e| {
        tracing::warn!(appid, error = %e, "Failed to parse GetPlayerAchievements response");
        AppError::StoreApi(format!(
            "Failed to parse achievements response for appid {appid}: {e}"
        ))
    })?;

    // Check the success field — Steam returns success=false for games with no achievements
    // or when rate-limited. Treat as an error so we don't cache empty results as "real".
    if resp.playerstats.success == Some(false) {
        return Err(AppError::StoreApi(
            "Steam API reported no achievements for this game".to_string(),
        ));
    }

    let achievements = resp.playerstats.achievements.unwrap_or_default();
    Ok(achievements)
}

async fn fetch_schema(api_key: &str, appid: u32) -> Result<Vec<SchemaAchievement>, AppError> {
    let appid_str = appid.to_string();
    let resp: SchemaResponse = steam_get_json(
        "/ISteamUserStats/GetSchemaForGame/v2/",
        &[("key", api_key), ("appid", &appid_str), ("format", "json")],
    )
    .await?;
    Ok(resp
        .game
        .available_game_stats
        .and_then(|s| s.achievements)
        .unwrap_or_default())
}

async fn fetch_global_percentages(appid: u32) -> Result<Vec<GlobalPercent>, AppError> {
    let appid_str = appid.to_string();
    let resp: GlobalPercentResponse = steam_get_json(
        "/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/",
        &[("gameid", &appid_str), ("format", "json")],
    )
    .await?;
    Ok(resp.achievementpercentages.achievements)
}

/// Batch-fetch achievements for all Steam games that don't have fresh cache.
/// Returns the number of games that were fetched (not cached).
/// Aborts early if a 403 is detected (privacy settings block all games).
/// Emits `"achievement-batch-progress"` events via `app_handle` for live progress tracking.
pub async fn batch_fetch_achievements(
    api_key: &str,
    steam_id: &str,
    db: &CacheDbHandle,
    app_handle: &tauri::AppHandle,
) -> Result<u32, AppError> {
    // Get all Steam games from DB
    let steam_games = {
        let db = db.lock_or_err("DB")?;
        db.get_all_steam_games()?
    };

    let total = steam_games.len();
    tracing::info!(total, "Starting batch achievement fetch");

    // Emit initial progress
    let _ = app_handle.emit(
        "achievement-batch-progress",
        serde_json::json!({ "total": total, "current": 0 }),
    );

    let mut fetched = 0u32;
    let mut skipped = 0u32;
    for (i, (game_id, appid)) in steam_games.iter().enumerate() {
        // Check if cache is already fresh (skip if so)
        {
            let db = db.lock().map_err(|e| {
                AppError::Database(rusqlite::Error::ToSqlConversionFailure(Box::new(
                    std::io::Error::other(e.to_string()),
                )))
            })?;
            if db.is_achievements_fresh(game_id)? {
                let _ = app_handle.emit(
                    "achievement-batch-progress",
                    serde_json::json!({ "total": total, "current": i + 1 }),
                );
                continue;
            }
        }

        // Fetch this game's achievements
        match fetch_game_achievements(api_key, steam_id, game_id, *appid, db).await {
            Ok(_) => fetched += 1,
            Err(ref e) if is_forbidden_error(e) => {
                // 403 = privacy settings block ALL games. Abort the batch entirely.
                tracing::warn!("Batch aborting — Steam returned 403 (game details are private)");
                return Err(AppError::StoreApi(
                    "Steam profile game details are set to private. Set Game details to Public in Steam → Profile → Privacy Settings to enable achievements.".to_string(),
                ));
            }
            Err(_) => {
                skipped += 1;
            }
        }

        // Emit progress after each game
        let _ = app_handle.emit(
            "achievement-batch-progress",
            serde_json::json!({ "total": total, "current": i + 1 }),
        );

        // Delay between games to avoid Steam API rate limiting.
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
    }

    tracing::info!(fetched, skipped, total, "Batch achievement fetch complete");
    Ok(fetched)
}
