use std::collections::HashMap;
use std::path::Path;

use tauri::State;

use crate::models::game::{Game, GameLibrary, GameSource};
use crate::services::cache_db::CacheDbHandle;
use crate::services::{credential_store, registry, steam_client, vdf_parser};
use crate::utils::error::{AppError, MutexExt};

/// Scan the local filesystem for installed Steam games.
#[tauri::command]
pub async fn scan_local_library() -> Result<Vec<Game>, AppError> {
    tracing::info!("Starting local library scan");
    let steam_path = registry::get_steam_install_path()?;
    tracing::info!(steam_path = %steam_path, "Steam installation found");

    let folders = vdf_parser::parse_library_folders(&steam_path)?;
    tracing::info!(folder_count = folders.len(), "Library folders discovered");

    let mut games = Vec::new();

    for folder in &folders {
        let steamapps = format!("{}\\steamapps", folder.path);
        let steamapps_path = Path::new(&steamapps);

        if !steamapps_path.exists() {
            tracing::debug!(path = %folder.path, "Skipping non-existent steamapps directory");
            continue;
        }

        // Read all appmanifest files in this library folder
        let entries = match std::fs::read_dir(steamapps_path) {
            Ok(e) => e,
            Err(e) => {
                tracing::warn!(path = %steamapps, error = %e, "Cannot read steamapps directory");
                continue;
            }
        };

        let mut folder_count = 0u32;
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if !file_name.starts_with("appmanifest_") || !file_name.ends_with(".acf") {
                continue;
            }

            match vdf_parser::parse_app_manifest(&entry.path()) {
                Ok(info) => {
                    folder_count += 1;
                    let full_path =
                        format!("{}\\steamapps\\common\\{}", folder.path, info.install_dir);
                    games.push(Game {
                        game_id: String::new(), // Placeholder — assigned after DB registration
                        source: GameSource::Steam,
                        source_id: info.appid.to_string(),
                        name: info.name,
                        install_dir: Some(info.install_dir),
                        install_path: Some(full_path),
                        size_on_disk: Some(info.size_on_disk),
                        last_updated: Some(info.last_updated),
                        playtime_forever: 0,
                        playtime_2weeks: None,
                        last_played: None,
                        is_installed: true,
                        img_icon_url: None,
                        description: None,
                        launch_args: None,
                    });
                }
                Err(e) => {
                    tracing::warn!(file = %file_name, error = %e, "Skipped unreadable manifest");
                    continue;
                }
            }
        }
        tracing::debug!(path = %folder.path, games_found = folder_count, "Scanned library folder");
    }

    tracing::info!(total_games = games.len(), "Local library scan complete");
    Ok(games)
}

/// Fetch the full library by merging local scan data with Steam API data.
#[tauri::command]
pub async fn get_full_library(
    steam_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<GameLibrary, AppError> {
    tracing::info!("Building full library (local + API)");
    let mut warnings: Vec<String> = Vec::new();

    // Scan local games (non-fatal — continue with empty list if scan fails)
    let local_games = match scan_local_library().await {
        Ok(games) => games,
        Err(e) => {
            let msg = format!("Local library scan failed: {e}. Only API data is shown — install status and disk size may be missing.");
            tracing::warn!(error = %e, "Local scan failed, continuing with empty list");
            warnings.push(msg);
            Vec::new()
        }
    };
    tracing::info!(local_count = local_games.len(), "Local scan phase complete");

    // Build lookup of local game info by source_id (Steam appid as string)
    let local_map: HashMap<&str, &Game> = local_games
        .iter()
        .map(|g| (g.source_id.as_str(), g))
        .collect();

    // Load API key from credential store (never passed from frontend)
    let api_key = credential_store::load_api_key()?.ok_or_else(|| {
        AppError::Credential(
            "Steam API key not configured. Add it in Settings > Connections.".into(),
        )
    })?;

    // Fetch API data (owned games with playtime)
    let api_games = steam_client::fetch_owned_games(&api_key, &steam_id).await?;
    tracing::info!(api_count = api_games.len(), "API fetch phase complete");

    // Merge: start with API data, enrich with local info
    let mut merged: HashMap<String, Game> = HashMap::new();

    for mut game in api_games {
        if let Some(local) = local_map.get(game.source_id.as_str()) {
            game.is_installed = true;
            game.install_dir = local.install_dir.clone();
            game.install_path = local.install_path.clone();
            game.size_on_disk = local.size_on_disk;
            game.last_updated = local.last_updated;
        }
        merged.insert(game.source_id.clone(), game);
    }

    // Add any locally-installed games not in the API response
    let mut local_only = 0u32;
    for local_game in &local_games {
        if !merged.contains_key(&local_game.source_id) {
            merged.insert(local_game.source_id.clone(), local_game.clone());
            local_only += 1;
        }
    }

    // Register all games in the DB and assign stable UUIDs
    let db_guard = db.lock_or_err("DB")?;

    let mut games: Vec<Game> = merged.into_values().collect();
    for game in &mut games {
        let game_id = db_guard.register_game(game.source.as_str(), &game.source_id, &game.name)?;
        game.game_id = game_id.clone();
        if let Some(ref path) = game.install_path {
            let _ = db_guard.set_install_path(&game_id, path);
        }
        // Persist Steam's last_played timestamp
        if let Some(lp) = game.last_played {
            if lp > 0 {
                let _ = db_guard.set_last_played(&game_id, lp);
            }
        }
    }

    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    let total_count = games.len();
    let installed = games.iter().filter(|g| g.is_installed).count();
    tracing::info!(
        total = total_count,
        installed = installed,
        local_only = local_only,
        "Library merge complete"
    );

    Ok(GameLibrary {
        games,
        total_count,
        warnings,
    })
}
