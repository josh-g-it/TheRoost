use crate::models::settings::AppSettings;
use crate::services::settings_store;
use crate::utils::error::AppError;

#[tauri::command]
pub fn load_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, AppError> {
    tracing::info!("Loading settings");
    let result = settings_store::load_settings(&app_handle);
    match &result {
        Ok(s) => tracing::info!(
            theme = %s.theme,
            has_api_key = s.steam_api_key.is_some(),
            has_steam_id = s.steam_id.is_some(),
            is_first_run = s.is_first_run,
            "Settings loaded"
        ),
        Err(e) => tracing::error!(error = %e, "Failed to load settings"),
    }
    result
}

#[tauri::command]
pub fn save_settings(app_handle: tauri::AppHandle, settings: AppSettings) -> Result<(), AppError> {
    tracing::info!(theme = %settings.theme, "Saving settings");
    let result = settings_store::save_settings(&app_handle, &settings);
    match &result {
        Ok(()) => tracing::info!("Settings saved successfully"),
        Err(e) => tracing::error!(error = %e, "Failed to save settings"),
    }
    result
}
