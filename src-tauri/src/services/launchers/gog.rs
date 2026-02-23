use winreg::enums::*;
use winreg::RegKey;

use crate::models::game::GameSource;

use super::ScannedGame;

/// Registry path where GOG Galaxy stores per-game entries.
const GOG_GAMES_KEY: &str = r"SOFTWARE\WOW6432Node\GOG.com\Games";

/// Scan for installed GOG Galaxy games via Windows registry.
pub fn scan() -> Result<Vec<ScannedGame>, String> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let gog_key = match hklm.open_subkey(GOG_GAMES_KEY) {
        Ok(k) => k,
        Err(_) => {
            tracing::debug!("GOG Galaxy registry key not found, skipping");
            return Ok(Vec::new());
        }
    };

    let mut games = Vec::new();

    for subkey_name in gog_key.enum_keys().flatten() {
        let game_key = match gog_key.open_subkey(&subkey_name) {
            Ok(k) => k,
            Err(_) => continue,
        };

        let name: String = game_key.get_value("gameName").unwrap_or_default();
        let path: String = game_key.get_value("path").unwrap_or_default();
        let exe: String = game_key.get_value("exe").unwrap_or_default();
        let game_id: String = game_key.get_value("gameID").unwrap_or_default();

        if name.is_empty() || game_id.is_empty() {
            continue;
        }

        games.push(ScannedGame {
            source: GameSource::Gog,
            source_id: game_id,
            name,
            install_path: if path.is_empty() { None } else { Some(path) },
            executable_path: if exe.is_empty() { None } else { Some(exe) },
        });
    }

    Ok(games)
}
