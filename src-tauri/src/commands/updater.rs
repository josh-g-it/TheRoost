use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

use crate::utils::error::AppError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

#[tauri::command]
pub async fn check_for_update(app_handle: AppHandle) -> Result<Option<UpdateInfo>, AppError> {
    tracing::info!("Checking for updates");

    let updater = app_handle
        .updater_builder()
        .build()
        .map_err(|e| AppError::StoreApi(format!("Updater init failed: {e}")))?;

    match updater.check().await {
        Ok(Some(update)) => {
            tracing::info!(version = %update.version, "Update available");
            Ok(Some(UpdateInfo {
                version: update.version.clone(),
                body: update.body.clone(),
                date: update.date.map(|d| d.to_string()),
            }))
        }
        Ok(None) => {
            tracing::info!("No update available");
            Ok(None)
        }
        Err(e) => {
            tracing::error!(error = %e, "Update check failed");
            Err(AppError::StoreApi(format!("Update check failed: {e}")))
        }
    }
}

#[tauri::command]
pub async fn install_update(app_handle: AppHandle) -> Result<(), AppError> {
    tracing::info!("Installing update");

    let updater = app_handle
        .updater_builder()
        .build()
        .map_err(|e| AppError::StoreApi(format!("Updater init failed: {e}")))?;

    let update = updater
        .check()
        .await
        .map_err(|e| AppError::StoreApi(format!("Update check failed: {e}")))?
        .ok_or_else(|| AppError::NotFound("No update available".to_string()))?;

    tracing::info!(version = %update.version, "Downloading and installing update");

    update
        .download_and_install(|_chunk_len, _content_len| {}, || {})
        .await
        .map_err(|e| AppError::StoreApi(format!("Update install failed: {e}")))?;

    tracing::info!("Update installed, restarting");
    app_handle.restart();
}

#[tauri::command]
pub fn get_app_version(app_handle: AppHandle) -> String {
    app_handle.package_info().version.to_string()
}
