use tauri::State;
use winreg::enums::*;
use winreg::RegKey;

use crate::services::cache_db::CacheDbHandle;
use crate::utils::error::{AppError, MutexExt};

/// Try to find the Battle.net Launcher executable via Windows registry.
fn find_battlenet_launcher() -> Option<String> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = hklm
        .open_subkey(r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Battle.net")
        .ok()?;
    let install_loc: String = key.get_value("InstallLocation").ok()?;
    if install_loc.is_empty() {
        return None;
    }
    let path = std::path::Path::new(&install_loc).join("Battle.net Launcher.exe");
    if path.exists() {
        Some(path.to_string_lossy().to_string())
    } else {
        // Try alternate name
        let alt = std::path::Path::new(&install_loc).join("Battle.net.exe");
        if alt.exists() {
            Some(alt.to_string_lossy().to_string())
        } else {
            tracing::warn!(dir = %install_loc, "Battle.net install dir found but no launcher exe");
            None
        }
    }
}

/// Try to find the EA App (EA Desktop) executable via Windows registry or common paths.
fn find_ea_app_launcher() -> Option<String> {
    // Try registry first
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) = hklm.open_subkey(r"SOFTWARE\WOW6432Node\Electronic Arts\EA Desktop") {
        if let Ok(install_loc) = key.get_value::<String, _>("InstallLocation") {
            if !install_loc.is_empty() {
                let path = std::path::Path::new(&install_loc).join("EADesktop.exe");
                if path.exists() {
                    return Some(path.to_string_lossy().to_string());
                }
            }
        }
    }

    // Try common install paths
    let common_paths = [
        r"C:\Program Files\Electronic Arts\EA Desktop\EA Desktop\EADesktop.exe",
        r"C:\Program Files (x86)\Electronic Arts\EA Desktop\EA Desktop\EADesktop.exe",
    ];
    for p in &common_paths {
        if std::path::Path::new(p).exists() {
            return Some(p.to_string());
        }
    }

    tracing::warn!("EA App launcher not found via registry or common paths");
    None
}

/// Launch a game executable directly, including any stored launch arguments.
fn launch_direct(game_id: &str, db: &crate::services::cache_db::CacheDb) -> Result<(), AppError> {
    match db.get_primary_executable(game_id)? {
        Some(exe_path) => {
            let launch_args = db.get_launch_args(game_id)?;
            tracing::info!(game_id = %game_id, exe = %exe_path, args = ?launch_args, "Launching via direct executable");
            let mut cmd = std::process::Command::new(&exe_path);
            if let Some(ref args_str) = launch_args {
                cmd.args(args_str.split_whitespace());
            }
            cmd.spawn().map_err(|e| {
                tracing::error!(game_id = %game_id, error = %e, "Direct exe launch failed");
                AppError::Io(e)
            })?;
            Ok(())
        }
        None => Err(AppError::NotFound(format!(
            "No executable known for game {}. Launch it once from its native launcher so The Roost can detect it.",
            game_id
        ))),
    }
}

/// Open a URI scheme (steam://, com.epicgames.launcher://, etc.)
fn launch_uri(game_id: &str, uri: &str, launcher_name: &str) -> Result<(), AppError> {
    tracing::info!(game_id = %game_id, uri = %uri, "Launching via {} URI", launcher_name);
    open::that(uri).map_err(|e| {
        tracing::error!(game_id = %game_id, error = %e, "{} URI launch failed", launcher_name);
        AppError::Io(e)
    })
}

/// Resolve the effective launch mode for a game.
/// Steam and Manual always use their fixed modes; recognized launcher sources
/// default to "launcher" if no explicit preference is stored.
fn resolve_launch_mode(source: &str, stored: Option<String>) -> &'static str {
    match source {
        "steam" | "manual" => "fixed", // These don't use the toggle
        _ => match stored.as_deref() {
            Some("direct") => "direct",
            _ => "launcher", // Default for recognized launcher sources
        },
    }
}

/// Launch a game by its game_id. Routes to the appropriate launcher by source
/// and respects the per-game launch mode preference.
#[tauri::command]
pub async fn launch_game(game_id: String, db: State<'_, CacheDbHandle>) -> Result<(), AppError> {
    let db = db.lock_or_err("DB")?;

    let (source, source_id) = db
        .get_game_source(&game_id)?
        .ok_or_else(|| AppError::NotFound(format!("Game not found: {}", game_id)))?;

    let stored_mode = db.get_launch_mode(&game_id)?;
    let mode = resolve_launch_mode(&source, stored_mode);

    tracing::info!(
        game_id = %game_id,
        source = %source,
        source_id = %source_id,
        launch_mode = %mode,
        "Launching game"
    );

    match source.as_str() {
        "steam" => {
            let url = format!("steam://rungameid/{}", source_id);
            launch_uri(&game_id, &url, "Steam")?;
        }
        "manual" => {
            launch_direct(&game_id, &db)?;
        }
        "epic" => {
            if mode == "direct" {
                if let Err(e) = launch_direct(&game_id, &db) {
                    tracing::warn!(game_id = %game_id, error = %e, "Direct launch failed, falling back to Epic URI");
                    let url = format!(
                        "com.epicgames.launcher://apps/{}?action=launch&silent=true",
                        source_id
                    );
                    launch_uri(&game_id, &url, "Epic")?;
                }
            } else {
                let url = format!(
                    "com.epicgames.launcher://apps/{}?action=launch&silent=true",
                    source_id
                );
                launch_uri(&game_id, &url, "Epic")?;
            }
        }
        "gog" => {
            if mode == "direct" {
                if let Err(e) = launch_direct(&game_id, &db) {
                    tracing::warn!(game_id = %game_id, error = %e, "Direct launch failed, falling back to GOG Galaxy URI");
                    let url = format!("goggalaxy://openGameView/{}", source_id);
                    launch_uri(&game_id, &url, "GOG Galaxy")?;
                }
            } else {
                // Launcher mode: use GOG Galaxy URI
                let url = format!("goggalaxy://openGameView/{}", source_id);
                if let Err(e) = launch_uri(&game_id, &url, "GOG Galaxy") {
                    tracing::warn!(game_id = %game_id, error = %e, "GOG Galaxy URI failed, falling back to direct exe");
                    launch_direct(&game_id, &db)?;
                }
            }
        }
        "ubisoft" => {
            if mode == "direct" {
                if let Err(e) = launch_direct(&game_id, &db) {
                    tracing::warn!(game_id = %game_id, error = %e, "Direct launch failed, falling back to Ubisoft URI");
                    let url = format!("uplay://launch/{}/0", source_id);
                    launch_uri(&game_id, &url, "Ubisoft Connect")?;
                }
            } else {
                let url = format!("uplay://launch/{}/0", source_id);
                launch_uri(&game_id, &url, "Ubisoft Connect")?;
            }
        }
        "ea_app" => {
            if mode == "direct" {
                launch_direct(&game_id, &db)?;
            } else {
                // Launcher mode: open EA App
                if let Some(ea_path) = find_ea_app_launcher() {
                    tracing::info!(game_id = %game_id, launcher = %ea_path, "Opening EA App");
                    std::process::Command::new(&ea_path).spawn().map_err(|e| {
                        tracing::error!(game_id = %game_id, error = %e, "EA App launch failed");
                        AppError::Io(e)
                    })?;
                } else {
                    tracing::warn!(game_id = %game_id, "EA App not found, falling back to direct exe");
                    launch_direct(&game_id, &db)?;
                }
            }
        }
        "battlenet" => {
            if mode == "direct" {
                launch_direct(&game_id, &db)?;
            } else {
                // Launcher mode: open Battle.net
                if let Some(bnet_path) = find_battlenet_launcher() {
                    tracing::info!(game_id = %game_id, launcher = %bnet_path, "Opening Battle.net");
                    std::process::Command::new(&bnet_path)
                        .spawn()
                        .map_err(|e| {
                            tracing::error!(game_id = %game_id, error = %e, "Battle.net launch failed");
                            AppError::Io(e)
                        })?;
                } else {
                    tracing::warn!(game_id = %game_id, "Battle.net not found, falling back to direct exe");
                    launch_direct(&game_id, &db)?;
                }
            }
        }
        _ => {
            tracing::warn!(game_id = %game_id, source = %source, "No launcher implemented for this source");
            return Err(AppError::NotFound(format!(
                "No launcher for source: {}",
                source
            )));
        }
    }

    tracing::info!(game_id = %game_id, "Game launch invoked successfully");
    Ok(())
}

/// Get the effective launch mode for a game.
/// Returns "launcher" or "direct". Steam and Manual games return "fixed".
#[tauri::command]
pub async fn get_launch_mode(
    game_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<String, AppError> {
    let db = db.lock_or_err("DB")?;

    let (source, _source_id) = db
        .get_game_source(&game_id)?
        .ok_or_else(|| AppError::NotFound(format!("Game not found: {}", game_id)))?;

    let stored = db.get_launch_mode(&game_id)?;
    let effective = resolve_launch_mode(&source, stored);
    Ok(effective.to_string())
}

/// Set the launch mode for a game ("launcher" or "direct").
#[tauri::command]
pub async fn set_launch_mode(
    game_id: String,
    launch_mode: String,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    if launch_mode != "launcher" && launch_mode != "direct" {
        return Err(AppError::NotFound(format!(
            "Invalid launch mode: {}. Must be 'launcher' or 'direct'.",
            launch_mode
        )));
    }

    let db = db.lock_or_err("DB")?;

    tracing::info!(game_id = %game_id, mode = %launch_mode, "Setting launch mode");
    db.set_launch_mode(&game_id, &launch_mode)?;
    Ok(())
}
