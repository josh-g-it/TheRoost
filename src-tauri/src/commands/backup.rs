use std::collections::HashMap;

use tauri::{AppHandle, Manager, State};

use crate::services::backup_service::{self, BackupEstimate, BackupManifest, RestoreValidation};
use crate::services::cache_db::CacheDbHandle;
use crate::utils::error::AppError;

/// Estimate the size of a full backup.
#[tauri::command]
pub async fn estimate_backup_size(
    app_handle: AppHandle,
    db: State<'_, CacheDbHandle>,
) -> Result<BackupEstimate, AppError> {
    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;
    backup_service::estimate_backup_size(&app_data, db.inner())
}

/// Create a full backup at the user-selected output path.
#[tauri::command]
pub async fn create_backup(
    output_path: String,
    app_handle: AppHandle,
    db: State<'_, CacheDbHandle>,
) -> Result<BackupManifest, AppError> {
    tracing::info!(path = %output_path, "Creating backup");
    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;
    backup_service::create_backup(
        &app_handle,
        &app_data,
        db.inner(),
        &std::path::PathBuf::from(&output_path),
    )
}

/// Validate a `.roost` archive without restoring.
#[tauri::command]
pub async fn validate_backup(archive_path: String) -> Result<RestoreValidation, AppError> {
    tracing::info!(path = %archive_path, "Validating backup");
    backup_service::validate_backup(&std::path::PathBuf::from(&archive_path))
}

/// Check for active game sessions (blocks restore if any are running).
#[tauri::command]
pub async fn check_active_sessions(db: State<'_, CacheDbHandle>) -> Result<Vec<String>, AppError> {
    let db_guard = db
        .lock()
        .map_err(|_| AppError::LockPoisoned("DB lock poisoned".to_string()))?;
    let sessions = db_guard.get_active_sessions_with_names()?;
    Ok(sessions.into_iter().map(|(_, name, _)| name).collect())
}

/// Perform the full restore from a validated `.roost` archive.
///
/// `credential_values` maps account names to their key values
/// (e.g. `{"steam_api_key": "ABC...", "steamgriddb_api_key": "DEF..."}`).
#[tauri::command]
pub async fn restore_from_backup(
    archive_path: String,
    credential_values: HashMap<String, String>,
    app_handle: AppHandle,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    tracing::info!(path = %archive_path, "Starting restore from backup");
    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;

    // 1. Create safety backup first
    let safety_path = backup_service::create_safety_backup(&app_handle, &app_data, db.inner())?;

    // 2. Attempt restore
    match backup_service::restore_from_backup(
        &app_handle,
        &app_data,
        db.inner(),
        &std::path::PathBuf::from(&archive_path),
        &credential_values,
    ) {
        Ok(()) => {
            tracing::info!("Restore completed successfully");
            // Clean up safety backup on success
            let _ = std::fs::remove_file(&safety_path);
            Ok(())
        }
        Err(e) => {
            // 3. Auto-rollback on failure
            tracing::error!(error = %e, "Restore failed, rolling back to safety backup");
            if let Err(rollback_err) =
                backup_service::rollback_to_safety(&app_handle, &app_data, db.inner(), &safety_path)
            {
                tracing::error!(error = %rollback_err, "Rollback also failed!");
            }
            Err(e)
        }
    }
}

/// Get credential hints from a `.roost` archive (for the restore wizard).
#[tauri::command]
pub async fn get_backup_credential_hints(archive_path: String) -> Result<Vec<String>, AppError> {
    backup_service::get_credential_hints(&std::path::PathBuf::from(&archive_path))
}

/// Restart the app (used after successful restore).
#[tauri::command]
pub async fn restart_app(app_handle: AppHandle) -> Result<(), AppError> {
    tracing::info!("App restart requested (post-restore)");
    app_handle.restart();
    #[allow(unreachable_code)]
    Ok(())
}
