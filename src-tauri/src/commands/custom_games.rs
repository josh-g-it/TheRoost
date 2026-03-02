use std::path::Path;

use tauri::State;

use crate::models::game::{Game, GameSource};
use crate::services::cache_db::CacheDbHandle;
use crate::utils::error::{AppError, MutexExt};

/// Add a custom game by name and executable path.
#[tauri::command]
pub async fn add_custom_game(
    name: String,
    exe_path: String,
    description: Option<String>,
    launch_args: Option<String>,
    db: State<'_, CacheDbHandle>,
) -> Result<Game, AppError> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Validation(
            "Game name cannot be empty".to_string(),
        ));
    }
    if name.chars().count() > 255 {
        return Err(AppError::Validation(
            "Game name exceeds maximum length of 255 characters".into(),
        ));
    }
    if let Some(ref desc) = description {
        if desc.chars().count() > 1000 {
            return Err(AppError::Validation(
                "Description exceeds maximum length of 1000 characters".into(),
            ));
        }
    }
    if let Some(ref args) = launch_args {
        if args.chars().count() > 500 {
            return Err(AppError::Validation(
                "Launch arguments exceed maximum length of 500 characters".into(),
            ));
        }
    }

    let exe = Path::new(&exe_path);
    if !exe.exists() {
        return Err(AppError::Validation(format!(
            "Executable not found: {}",
            exe_path
        )));
    }

    let db_guard = db.lock_or_err("DB")?;

    let source_id = uuid::Uuid::new_v4().to_string();
    let game_id = db_guard.register_game("manual", &source_id, &name)?;

    if let Some(ref desc) = description {
        let desc = desc.trim();
        if !desc.is_empty() {
            db_guard.set_game_description(&game_id, desc)?;
        }
    }

    if let Some(ref args) = launch_args {
        let args = args.trim();
        if !args.is_empty() {
            db_guard.set_launch_args(&game_id, args)?;
        }
    }

    // Set install path to the exe's parent directory
    if let Some(parent) = exe.parent() {
        let _ = db_guard.set_install_path(&game_id, &parent.to_string_lossy());
    }

    // Record the executable for process monitor matching
    if let Some(file_name) = exe.file_name() {
        let exe_name = file_name.to_string_lossy().to_lowercase();
        db_guard.add_game_executable(&game_id, &exe_path, &exe_name)?;
    }

    tracing::info!(
        game_id = %game_id,
        name = %name,
        exe_path = %exe_path,
        "Custom game added"
    );

    Ok(Game {
        game_id,
        source: GameSource::Manual,
        source_id,
        name,
        install_dir: None,
        install_path: exe.parent().map(|p| p.to_string_lossy().to_string()),
        size_on_disk: None,
        last_updated: None,
        playtime_forever: 0,
        playtime_2weeks: None,
        last_played: None,
        is_installed: true,
        img_icon_url: None,
        description,
        launch_args,
    })
}

/// Remove a custom game and all its related data.
#[tauri::command]
pub async fn remove_custom_game(
    game_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    let db_guard = db.lock_or_err("DB")?;

    // Verify game exists and is manual
    let (source, _source_id) = db_guard
        .get_game_source(&game_id)?
        .ok_or_else(|| AppError::NotFound(format!("Game not found: {}", game_id)))?;

    if source != "manual" {
        return Err(AppError::Validation(
            "Only custom games can be removed".to_string(),
        ));
    }

    db_guard.delete_game(&game_id)?;

    tracing::info!(game_id = %game_id, "Custom game removed");
    Ok(())
}

/// Update a custom game's name, executable path, and/or description.
#[tauri::command]
pub async fn update_custom_game(
    game_id: String,
    name: Option<String>,
    exe_path: Option<String>,
    description: Option<String>,
    launch_args: Option<String>,
    db: State<'_, CacheDbHandle>,
) -> Result<Game, AppError> {
    let db_guard = db.lock_or_err("DB")?;

    // Verify game exists and is manual
    let (source, source_id) = db_guard
        .get_game_source(&game_id)?
        .ok_or_else(|| AppError::NotFound(format!("Game not found: {}", game_id)))?;

    if source != "manual" {
        return Err(AppError::Validation(
            "Only custom games can be edited".to_string(),
        ));
    }

    if let Some(ref n) = name {
        if n.chars().count() > 255 {
            return Err(AppError::Validation(
                "Game name exceeds maximum length of 255 characters".into(),
            ));
        }
    }
    if let Some(ref desc) = description {
        if desc.chars().count() > 1000 {
            return Err(AppError::Validation(
                "Description exceeds maximum length of 1000 characters".into(),
            ));
        }
    }
    if let Some(ref args) = launch_args {
        if args.chars().count() > 500 {
            return Err(AppError::Validation(
                "Launch arguments exceed maximum length of 500 characters".into(),
            ));
        }
    }

    // Update name if provided
    let current_name = if let Some(ref new_name) = name {
        let new_name = new_name.trim().to_string();
        if new_name.is_empty() {
            return Err(AppError::Validation(
                "Game name cannot be empty".to_string(),
            ));
        }
        db_guard.update_game_name(&game_id, &new_name)?;
        new_name
    } else {
        db_guard
            .get_game_info(&game_id)?
            .map(|(_, _, n)| n)
            .unwrap_or_default()
    };

    // Update description if provided (empty string clears it)
    if let Some(ref desc) = description {
        let desc = desc.trim();
        if desc.is_empty() {
            db_guard.set_game_description(&game_id, "")?;
        } else {
            db_guard.set_game_description(&game_id, desc)?;
        }
    }

    // Update launch args if provided (empty string clears them)
    if let Some(ref args) = launch_args {
        db_guard.set_launch_args(&game_id, args)?;
    }

    // Update executable if provided
    let mut install_path: Option<String> = None;
    if let Some(ref new_exe) = exe_path {
        let exe = Path::new(new_exe);
        if !exe.exists() {
            return Err(AppError::Validation(format!(
                "Executable not found: {}",
                new_exe
            )));
        }
        db_guard.delete_game_executables(&game_id)?;
        if let Some(file_name) = exe.file_name() {
            let exe_name = file_name.to_string_lossy().to_lowercase();
            db_guard.add_game_executable(&game_id, new_exe, &exe_name)?;
        }
        if let Some(parent) = exe.parent() {
            let path = parent.to_string_lossy().to_string();
            db_guard.set_install_path(&game_id, &path)?;
            install_path = Some(path);
        }
    }

    let current_description = db_guard.get_game_description(&game_id)?;
    let current_launch_args = db_guard.get_launch_args(&game_id)?;

    let playtime = db_guard.get_manual_playtime(&game_id).unwrap_or(0);
    let last_played = db_guard.get_last_played(&game_id).unwrap_or(None);

    tracing::info!(game_id = %game_id, "Custom game updated");

    Ok(Game {
        game_id,
        source: GameSource::Manual,
        source_id,
        name: current_name,
        install_dir: None,
        install_path,
        size_on_disk: None,
        last_updated: None,
        playtime_forever: playtime,
        playtime_2weeks: None,
        last_played,
        is_installed: true,
        img_icon_url: None,
        description: current_description,
        launch_args: current_launch_args,
    })
}
