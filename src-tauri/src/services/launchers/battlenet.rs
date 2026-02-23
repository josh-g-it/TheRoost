use crate::models::game::GameSource;

use super::ScannedGame;

/// Names to exclude from Battle.net scan results (launchers/tools, not games).
const BNET_NON_GAME_NAMES: &[&str] = &[
    "battle.net",
    "blizzard battle.net",
    "blizzard app",
];

/// Scan for installed Battle.net (Blizzard) games via Windows Uninstall registry.
pub fn scan() -> Result<Vec<ScannedGame>, String> {
    super::scan_uninstall_registry(
        "Blizzard Entertainment",
        GameSource::BattleNet,
        BNET_NON_GAME_NAMES,
    )
}
