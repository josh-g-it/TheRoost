use tauri::State;

use crate::models::game::{Game, GameLibrary, GameSource};
use crate::services::cache_db::CacheDbHandle;
use crate::services::launchers;
use crate::utils::error::{AppError, MutexExt};

/// Scan all non-Steam launchers for installed games and include custom games.
/// Registers discovered games in the database and returns them with stable UUIDs.
#[tauri::command]
pub async fn scan_external_games(
    db: State<'_, CacheDbHandle>,
) -> Result<GameLibrary, AppError> {
    tracing::info!("Starting external launcher scan");

    let (scanned, warnings) = launchers::scan_all_launchers();
    tracing::info!(
        found = scanned.len(),
        warnings = warnings.len(),
        "External scan complete"
    );

    let db_guard = db.lock_or_err("DB")?;

    let mut games = Vec::new();

    for sg in scanned {
        let game_id =
            db_guard.register_game(sg.source.as_str(), &sg.source_id, &sg.name)?;

        if let Some(ref path) = sg.install_path {
            let _ = db_guard.set_install_path(&game_id, path);
        }

        if let Some(ref exe_path) = sg.executable_path {
            if let Some(exe_name) = std::path::Path::new(exe_path)
                .file_name()
                .map(|n| n.to_string_lossy().to_lowercase())
            {
                let _ = db_guard.add_game_executable(&game_id, exe_path, &exe_name);
            }
        }

        games.push(Game {
            game_id,
            source: sg.source,
            source_id: sg.source_id,
            name: sg.name,
            install_dir: None,
            install_path: sg.install_path,
            size_on_disk: None,
            last_updated: None,
            playtime_forever: 0,
            playtime_2weeks: None,
            last_played: None,
            is_installed: true,
            img_icon_url: None,
            description: None,
            launch_args: None,
        });
    }

    // Include custom (manual) games from the database
    if let Ok(manual_games) = db_guard.get_manual_games() {
        let manual_count = manual_games.len();
        for (game_id, source_id, name, install_path, description, launch_args) in manual_games {
            games.push(Game {
                game_id,
                source: GameSource::Manual,
                source_id,
                name,
                install_dir: None,
                install_path,
                size_on_disk: None,
                last_updated: None,
                playtime_forever: 0,
                playtime_2weeks: None,
                last_played: None,
                is_installed: true,
                img_icon_url: None,
                description,
                launch_args,
            });
        }
        if manual_count > 0 {
            tracing::info!(count = manual_count, "Custom games included");
        }
    }

    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    let total_count = games.len();

    // Spawn background cover art resolution (non-blocking)
    if total_count > 0 {
        let art_db = db.inner().clone();
        tauri::async_runtime::spawn(async move {
            use crate::services::cover_art::CoverArtService;
            let service = CoverArtService::new(art_db);
            match service.backfill_missing(100).await {
                Ok(count) => tracing::info!(count, "Background cover art fetch complete"),
                Err(e) => tracing::warn!(error = %e, "Background cover art fetch failed"),
            }
        });
    }

    Ok(GameLibrary {
        games,
        total_count,
        warnings,
    })
}
