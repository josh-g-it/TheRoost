use std::fs;
use std::path::PathBuf;

use tauri::Manager;

use crate::models::settings::AppSettings;
use crate::services::credential_store;
use crate::utils::error::AppError;

fn settings_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let app_data = app_handle.path().app_data_dir().map_err(|e| {
        AppError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            e.to_string(),
        ))
    })?;
    fs::create_dir_all(&app_data)?;
    Ok(app_data.join("settings.json"))
}

pub fn load_settings(app_handle: &tauri::AppHandle) -> Result<AppSettings, AppError> {
    let path = settings_path(app_handle)?;

    let mut settings = if path.exists() {
        let content = fs::read_to_string(&path)?;
        serde_json::from_str::<AppSettings>(&content).map_err(|e| AppError::Parse(e.to_string()))?
    } else {
        AppSettings::default()
    };

    // Load API key from secure credential storage
    if let Ok(Some(key)) = credential_store::load_api_key() {
        settings.steam_api_key = Some(key);
    }

    Ok(settings)
}

pub fn save_settings(
    app_handle: &tauri::AppHandle,
    settings: &AppSettings,
) -> Result<(), AppError> {
    // Store API key securely, separate from the JSON file
    if let Some(ref key) = settings.steam_api_key {
        if !key.is_empty() {
            credential_store::store_api_key(key)?;
        } else {
            credential_store::delete_api_key()?;
        }
    } else {
        credential_store::delete_api_key()?;
    }

    // Save settings without the API key in the JSON file
    let mut file_settings = settings.clone();
    file_settings.steam_api_key = None;

    let path = settings_path(app_handle)?;
    let content =
        serde_json::to_string_pretty(&file_settings).map_err(|e| AppError::Parse(e.to_string()))?;

    // Atomic write: write to temp file, then rename over the target.
    // On Windows (same volume), fs::rename uses MoveFileExW with MOVEFILE_REPLACE_EXISTING.
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, content)?;
    fs::rename(&tmp_path, &path)?;
    Ok(())
}
