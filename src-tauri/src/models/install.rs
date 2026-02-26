use serde::Serialize;

/// Info about a Steam library folder for the install dialog.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamLibraryFolderInfo {
    pub path: String,
    pub drive_letter: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub game_count: u32,
}

/// Progress info for an active Steam install/update.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub source_id: String,
    pub game_id: Option<String>,
    pub name: String,
    pub state_flags: u32,
    pub bytes_downloaded: u64,
    pub bytes_to_download: u64,
    pub bytes_staged: u64,
    pub bytes_to_stage: u64,
    pub progress: f64,
    pub status: String,
}
