use std::collections::HashMap;

use winreg::enums::*;
use winreg::RegKey;

use crate::models::game::GameSource;

use super::ScannedGame;

/// Registry path where Ubisoft Connect stores per-game install directories.
const UBISOFT_INSTALLS_KEY: &str = r"SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs";

/// Scan for installed Ubisoft Connect games.
///
/// Primary source: `HKLM\...\Ubisoft\Launcher\Installs\{id}` which has
/// `InstallDir` values. Cross-references the Windows Uninstall registry
/// to resolve display names (the Installs key only stores paths).
pub fn scan() -> Result<Vec<ScannedGame>, String> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let installs_key = match hklm.open_subkey(UBISOFT_INSTALLS_KEY) {
        Ok(k) => k,
        Err(_) => {
            tracing::debug!("Ubisoft Connect registry key not found, skipping");
            return Ok(Vec::new());
        }
    };

    // Build a map of install_path → display_name from Uninstall registry
    let name_map = build_ubisoft_name_map();

    let mut games = Vec::new();

    for subkey_name in installs_key.enum_keys().flatten() {
        let game_key = match installs_key.open_subkey(&subkey_name) {
            Ok(k) => k,
            Err(_) => continue,
        };

        let install_dir: String = game_key.get_value("InstallDir").unwrap_or_default();
        if install_dir.is_empty() {
            continue;
        }

        // Try to resolve display name from the Uninstall registry
        let normalized = install_dir.to_lowercase().replace('/', "\\");
        let name = name_map
            .get(&normalized)
            .cloned()
            .unwrap_or_else(|| format!("Ubisoft Game {}", subkey_name));

        games.push(ScannedGame {
            source: GameSource::UbisoftConnect,
            source_id: subkey_name,
            name,
            install_path: Some(install_dir),
            executable_path: None, // Discovered by process monitor
        });
    }

    Ok(games)
}

/// Build a map of normalized install paths → display names from the Windows
/// Uninstall registry, filtered to Ubisoft-published entries.
fn build_ubisoft_name_map() -> HashMap<String, String> {
    let mut map = HashMap::new();

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let uninstall_key = match hklm
        .open_subkey(r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall")
    {
        Ok(k) => k,
        Err(_) => return map,
    };

    for subkey_name in uninstall_key.enum_keys().flatten() {
        let entry = match uninstall_key.open_subkey(&subkey_name) {
            Ok(k) => k,
            Err(_) => continue,
        };

        let publisher: String = entry.get_value("Publisher").unwrap_or_default();
        if !publisher.to_lowercase().contains("ubisoft") {
            continue;
        }

        let name: String = entry.get_value("DisplayName").unwrap_or_default();
        let install_loc: String = entry.get_value("InstallLocation").unwrap_or_default();

        if !name.is_empty() && !install_loc.is_empty() {
            let normalized = install_loc.to_lowercase().replace('/', "\\");
            map.insert(normalized, name);
        }
    }

    map
}
