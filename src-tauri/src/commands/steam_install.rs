use tauri::State;

use crate::models::install::SteamLibraryFolderInfo;
use crate::services::{registry, storage_service, vdf_parser};
use crate::utils::error::AppError;

type CacheDbHandle = std::sync::Arc<std::sync::Mutex<crate::services::cache_db::CacheDb>>;

/// Return all Steam library folders with drive stats for the install dialog.
#[tauri::command]
pub async fn get_steam_library_folders(
    _db: State<'_, CacheDbHandle>,
) -> Result<Vec<SteamLibraryFolderInfo>, AppError> {
    let steam_path = registry::get_steam_install_path()?;
    let folders = vdf_parser::parse_library_folders(&steam_path)?;

    let mut result = Vec::new();
    for folder in &folders {
        let drive_letter = storage_service::extract_drive_letter(&folder.path);
        let (total_bytes, free_bytes) =
            storage_service::get_drive_stats(&drive_letter).unwrap_or((0, 0));

        result.push(SteamLibraryFolderInfo {
            path: folder.path.clone(),
            drive_letter,
            total_bytes,
            free_bytes,
            game_count: folder.apps.len() as u32,
        });
    }

    tracing::info!(folder_count = result.len(), "Fetched Steam library folders");
    Ok(result)
}

/// Trigger a Steam game install via the steam:// URI scheme.
#[tauri::command]
pub async fn steam_install_game(source_id: String) -> Result<(), AppError> {
    let uri = format!("steam://install/{}", source_id);
    tracing::info!(source_id = %source_id, uri = %uri, "Triggering Steam install");
    open::that(&uri).map_err(|e| {
        tracing::error!(source_id = %source_id, error = %e, "Steam install URI failed");
        AppError::Io(e)
    })
}

/// Trigger a Steam game uninstall via the steam:// URI scheme.
#[tauri::command]
pub async fn steam_uninstall_game(source_id: String) -> Result<(), AppError> {
    let uri = format!("steam://uninstall/{}", source_id);
    tracing::info!(source_id = %source_id, uri = %uri, "Triggering Steam uninstall");
    open::that(&uri).map_err(|e| {
        tracing::error!(source_id = %source_id, error = %e, "Steam uninstall URI failed");
        AppError::Io(e)
    })
}

/// Trigger a Steam game update via steam://validate which forces file verification + update.
#[tauri::command]
pub async fn steam_update_game(source_id: String) -> Result<(), AppError> {
    let uri = format!("steam://validate/{}", source_id);
    tracing::info!(source_id = %source_id, uri = %uri, "Triggering Steam update/validate");
    open::that(&uri).map_err(|e| {
        tracing::error!(source_id = %source_id, error = %e, "Steam validate URI failed");
        AppError::Io(e)
    })
}
