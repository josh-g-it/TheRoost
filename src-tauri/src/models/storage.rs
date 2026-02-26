use serde::Serialize;

/// Per-drive storage information.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    pub drive_letter: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub game_bytes: u64,
    pub game_count: u32,
}

/// One game's storage footprint.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStorageEntry {
    pub game_id: String,
    pub name: String,
    pub source: String,
    pub install_path: String,
    pub size_bytes: u64,
    pub drive_letter: String,
}

/// Full result returned by scan_storage.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageScanResult {
    pub drives: Vec<DriveInfo>,
    pub games: Vec<GameStorageEntry>,
    pub total_game_bytes: u64,
    pub scanned_count: u32,
    pub scan_duration_ms: u64,
}
