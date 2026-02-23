use std::time::Duration;

use crate::services::cache_db::CacheDbHandle;
use crate::services::credential_store;
use crate::services::settings_store;
use crate::services::steam_client;

const POLL_INTERVAL: Duration = Duration::from_secs(30 * 60); // 30 minutes

/// Background task that periodically polls the Steam API to keep the library
/// and playtime snapshots up to date. Session detection is handled separately
/// by the process monitor.
pub async fn run(app_handle: tauri::AppHandle, db: CacheDbHandle) {
    tracing::info!("Library sync started (poll interval: 30 min)");
    let mut interval = tokio::time::interval(POLL_INTERVAL);

    loop {
        interval.tick().await;

        if let Err(e) = sync_once(&app_handle, &db).await {
            tracing::warn!(error = %e, "Library sync poll failed");
        }
    }
}

async fn sync_once(
    app_handle: &tauri::AppHandle,
    db: &CacheDbHandle,
) -> Result<(), Box<dyn std::error::Error>> {
    // Load settings to get API key + Steam ID
    let settings = settings_store::load_settings(app_handle)?;

    let api_key = match settings.steam_api_key {
        Some(ref k) if !k.is_empty() => k.clone(),
        _ => match credential_store::load_api_key()? {
            Some(k) if !k.is_empty() => k,
            _ => return Ok(()), // No API key configured, skip silently
        },
    };

    let steam_id = match settings.steam_id {
        Some(ref id) if !id.is_empty() => id.clone(),
        _ => return Ok(()),
    };

    // Fetch current library from Steam API
    let mut games = steam_client::fetch_owned_games(&api_key, &steam_id).await?;
    let now = chrono::Utc::now().timestamp();

    // Register all games and record playtime snapshots
    let db_guard = db
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    for game in &mut games {
        let game_id =
            db_guard.register_game(game.source.as_str(), &game.source_id, &game.name)?;
        game.game_id = game_id.clone();
        db_guard.insert_snapshot(&game_id, game.playtime_forever, now)?;

        // Persist Steam's last_played timestamp when available
        if let Some(lp) = game.last_played {
            if lp > 0 {
                db_guard.set_last_played(&game_id, lp)?;
            }
        }
    }

    // Periodic cleanup of old snapshots (keep 30 days)
    let deleted = db_guard.cleanup_old_snapshots(30)?;
    if deleted > 0 {
        tracing::debug!(deleted, "Cleaned up old playtime snapshots");
    }

    tracing::debug!(games = games.len(), "Library sync complete");

    Ok(())
}
