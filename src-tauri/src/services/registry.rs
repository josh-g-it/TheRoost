use winreg::enums::*;
use winreg::RegKey;

use crate::utils::error::AppError;

/// Find the Steam installation path from the Windows registry.
pub fn get_steam_install_path() -> Result<String, AppError> {
    tracing::debug!("Looking up Steam installation path");

    // Try 64-bit registry view first (WOW6432Node)
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    let paths = [
        "SOFTWARE\\WOW6432Node\\Valve\\Steam",
        "SOFTWARE\\Valve\\Steam",
    ];

    for reg_path in &paths {
        tracing::debug!(registry_key = reg_path, "Checking registry");
        if let Ok(key) = hklm.open_subkey(reg_path) {
            if let Ok(path) = key.get_value::<String, _>("InstallPath") {
                if !path.is_empty() && std::path::Path::new(&path).exists() {
                    tracing::debug!(path = %path, source = "HKLM registry", "Steam installation found");
                    return Ok(path);
                }
            }
        }
    }

    // Fallback: try current user registry
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey("SOFTWARE\\Valve\\Steam") {
        if let Ok(path) = key.get_value::<String, _>("SteamPath") {
            if !path.is_empty() {
                // SteamPath uses forward slashes, normalize it
                let normalized = path.replace('/', "\\");
                if std::path::Path::new(&normalized).exists() {
                    tracing::debug!(path = %normalized, source = "HKCU registry", "Steam installation found");
                    return Ok(normalized);
                }
            }
        }
    }

    // Last resort: check common default paths
    let defaults = ["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam"];

    for default_path in &defaults {
        if std::path::Path::new(default_path).exists() {
            tracing::info!(
                path = default_path,
                source = "default path",
                "Steam installation found"
            );
            return Ok(default_path.to_string());
        }
    }

    tracing::error!("Steam installation not found");
    Err(AppError::NotFound(
        "Could not find Steam installation. Please ensure Steam is installed.".to_string(),
    ))
}
