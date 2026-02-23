use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

use crate::utils::error::AppError;

#[tauri::command]
pub fn get_autostart_enabled(app_handle: AppHandle) -> Result<bool, AppError> {
    app_handle
        .autolaunch()
        .is_enabled()
        .map_err(|e| AppError::StoreApi(format!("Autostart check failed: {e}")))
}

#[tauri::command]
pub fn set_autostart_enabled(app_handle: AppHandle, enabled: bool) -> Result<(), AppError> {
    let manager = app_handle.autolaunch();
    if enabled {
        tracing::info!("Enabling autostart");
        manager
            .enable()
            .map_err(|e| AppError::StoreApi(format!("Autostart enable failed: {e}")))
    } else {
        tracing::info!("Disabling autostart");
        manager
            .disable()
            .map_err(|e| AppError::StoreApi(format!("Autostart disable failed: {e}")))
    }
}
