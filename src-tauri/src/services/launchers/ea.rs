use crate::models::game::GameSource;

use super::ScannedGame;

/// Names to exclude from EA App scan results (launchers/tools, not games).
const EA_NON_GAME_NAMES: &[&str] = &[
    "ea app",
    "ea desktop",
    "origin",
    "ea play",
    "ea anticheat",
];

/// Scan for installed EA App (formerly Origin) games via Windows Uninstall registry.
pub fn scan() -> Result<Vec<ScannedGame>, String> {
    super::scan_uninstall_registry("Electronic Arts", GameSource::EaApp, EA_NON_GAME_NAMES)
}
