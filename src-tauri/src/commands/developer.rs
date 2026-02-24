use tauri::Manager;

use crate::services::credential_store;
use crate::utils::error::AppError;

/// Nuclear option: delete all user data (database, settings, credentials) and exit.
/// On next launch, the app starts completely fresh with onboarding.
#[tauri::command]
pub async fn clear_all_data(
    confirmation: String,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    if confirmation != "CONFIRM_DELETE_ALL" {
        return Err(AppError::Validation(
            "Invalid confirmation token. Pass 'CONFIRM_DELETE_ALL' to proceed.".to_string(),
        ));
    }
    tracing::warn!("Clear all data requested — deleting everything");

    // 1. Delete credentials from Windows Credential Manager
    match credential_store::delete_api_key() {
        Ok(()) => tracing::info!("Steam API key deleted from credential manager"),
        Err(e) => tracing::warn!(error = %e, "Failed to delete Steam API key (may not exist)"),
    }
    match credential_store::delete_sgdb_api_key() {
        Ok(()) => tracing::info!("SteamGridDB API key deleted from credential manager"),
        Err(e) => {
            tracing::warn!(error = %e, "Failed to delete SteamGridDB API key (may not exist)")
        }
    }

    // 2. Delete entire app data directory (settings.json, database, WAL, etc.)
    let app_data = app_handle.path().app_data_dir().map_err(|e| {
        AppError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            e.to_string(),
        ))
    })?;

    match std::fs::remove_dir_all(&app_data) {
        Ok(()) => tracing::info!(path = %app_data.display(), "Deleted app data directory"),
        Err(e) => {
            tracing::warn!(path = %app_data.display(), error = %e, "Failed to delete app data directory")
        }
    }

    tracing::warn!("All user data cleared — exiting app");
    app_handle.exit(0);
    Ok(())
}
