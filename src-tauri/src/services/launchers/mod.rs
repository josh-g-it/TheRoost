pub mod battlenet;
pub mod ea;
pub mod epic;
pub mod gog;
pub mod ubisoft;

use winreg::enums::*;
use winreg::RegKey;

use crate::models::game::GameSource;

/// Intermediate type returned by each launcher scanner.
/// Converted to a full Game after DB registration assigns a game_id.
pub struct ScannedGame {
    pub source: GameSource,
    pub source_id: String,
    pub name: String,
    pub install_path: Option<String>,
    pub executable_path: Option<String>,
}

/// A named launcher scanner function.
type LauncherScanner = (&'static str, fn() -> Result<Vec<ScannedGame>, String>);

/// Scan all non-Steam launchers. Returns scanned games + warnings for any
/// launcher that fails (failure is non-fatal — one broken launcher doesn't
/// block the others).
pub fn scan_all_launchers() -> (Vec<ScannedGame>, Vec<String>) {
    let mut all_games = Vec::new();
    let mut warnings = Vec::new();

    let scanners: Vec<LauncherScanner> = vec![
        ("Epic Games Store", epic::scan),
        ("GOG Galaxy", gog::scan),
        ("EA App", ea::scan),
        ("Ubisoft Connect", ubisoft::scan),
        ("Battle.net", battlenet::scan),
    ];

    for (name, scanner) in scanners {
        match scanner() {
            Ok(games) => {
                tracing::info!(
                    launcher = name,
                    found = games.len(),
                    "Launcher scan complete"
                );
                all_games.extend(games);
            }
            Err(e) => {
                tracing::warn!(launcher = name, error = %e, "Launcher scan failed");
                warnings.push(format!("{} scan failed: {}", name, e));
            }
        }
    }

    (all_games, warnings)
}

/// Shared utility: scan the Windows Uninstall registry for entries matching a
/// publisher name. Used by EA App and Battle.net scanners which both filter
/// the same registry location by publisher.
pub fn scan_uninstall_registry(
    publisher_filter: &str,
    source: GameSource,
    non_game_names: &[&str],
) -> Result<Vec<ScannedGame>, String> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let uninstall_key = hklm
        .open_subkey(r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall")
        .map_err(|e| format!("Cannot open Uninstall registry: {}", e))?;

    let filter_lower = publisher_filter.to_lowercase();
    let mut games = Vec::new();

    for subkey_name in uninstall_key.enum_keys().flatten() {
        let entry = match uninstall_key.open_subkey(&subkey_name) {
            Ok(k) => k,
            Err(_) => continue,
        };

        let publisher: String = entry.get_value("Publisher").unwrap_or_default();
        if !publisher.to_lowercase().contains(&filter_lower) {
            continue;
        }

        let name: String = entry.get_value("DisplayName").unwrap_or_default();
        if name.is_empty() {
            continue;
        }

        // Skip launcher/tooling entries that aren't games
        let name_lower = name.to_lowercase();
        if non_game_names
            .iter()
            .any(|skip| name_lower.contains(&skip.to_lowercase()))
        {
            continue;
        }

        let install_loc: String = entry.get_value("InstallLocation").unwrap_or_default();

        games.push(ScannedGame {
            source: source.clone(),
            source_id: subkey_name,
            name,
            install_path: if install_loc.is_empty() {
                None
            } else {
                Some(install_loc)
            },
            executable_path: None, // Discovered later by process monitor
        });
    }

    Ok(games)
}
