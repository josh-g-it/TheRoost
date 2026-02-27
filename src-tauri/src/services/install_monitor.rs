use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::AppHandle;
use tauri::Emitter;

use crate::models::install::InstallProgress;
use crate::services::cache_db::CacheDb;
use crate::services::{registry, vdf_parser};
use crate::utils::error::MutexExt;

type CacheDbHandle = Arc<Mutex<CacheDb>>;

const POLL_INTERVAL: Duration = Duration::from_secs(3);

/// Fully installed state flag.
const STATE_FULLY_INSTALLED: u32 = 4;

/// Derive a human-readable status string from Steam's StateFlags bitmask.
pub fn derive_status(state_flags: u32) -> &'static str {
    if state_flags == STATE_FULLY_INSTALLED {
        "installed"
    } else if state_flags & 1024 != 0 {
        // Bit 10: downloading content
        "downloading"
    } else if state_flags & 16 != 0 {
        // Bit 4: staging (writing to disk after download)
        "staging"
    } else if state_flags & 2 != 0 {
        // Bit 1: update required
        "update_required"
    } else {
        "pending"
    }
}

/// Compute download progress as a fraction 0.0–1.0.
pub fn compute_progress(info: &vdf_parser::ManifestProgressInfo) -> f64 {
    // Prefer download progress; fall back to staging progress
    if info.bytes_to_download > 0 {
        info.bytes_downloaded as f64 / info.bytes_to_download as f64
    } else if info.bytes_to_stage > 0 {
        info.bytes_staged as f64 / info.bytes_to_stage as f64
    } else {
        0.0
    }
}

/// Background task that polls Steam appmanifest files for install progress.
pub async fn run(app_handle: AppHandle, db: CacheDbHandle) {
    tracing::info!("Install monitor started");

    let mut interval = tokio::time::interval(POLL_INTERVAL);
    let mut prev_states: HashMap<u32, u32> = HashMap::new();

    loop {
        interval.tick().await;
        scan_once(&app_handle, &db, &mut prev_states);
    }
}

fn scan_once(app_handle: &AppHandle, db: &CacheDbHandle, prev_states: &mut HashMap<u32, u32>) {
    // Get Steam path — silently return if Steam isn't installed
    let steam_path = match registry::get_steam_install_path() {
        Ok(p) => p,
        Err(_) => return,
    };

    let folders = match vdf_parser::parse_library_folders(&steam_path) {
        Ok(f) => f,
        Err(_) => return,
    };

    let mut active: Vec<InstallProgress> = Vec::new();
    let mut completed: Vec<InstallProgress> = Vec::new();
    let mut current_appids: HashMap<u32, u32> = HashMap::new();

    // Scan all manifest files across all library folders
    for folder in &folders {
        let steamapps = format!("{}\\steamapps", folder.path);
        let steamapps_path = Path::new(&steamapps);

        if !steamapps_path.is_dir() {
            continue;
        }

        let entries = match std::fs::read_dir(steamapps_path) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let file_name = entry.file_name();
            let name_str = file_name.to_string_lossy();

            if !name_str.starts_with("appmanifest_") || !name_str.ends_with(".acf") {
                continue;
            }

            let info = match vdf_parser::parse_app_manifest_progress(&entry.path()) {
                Ok(i) => i,
                Err(_) => continue, // Skip locked/corrupted files
            };

            current_appids.insert(info.appid, info.state_flags);

            let prev_flags = prev_states.get(&info.appid).copied();

            if info.state_flags != STATE_FULLY_INSTALLED {
                // Active download/update — resolve game_id from DB
                let game_id = resolve_game_id(db, info.appid);
                let progress = compute_progress(&info);

                active.push(InstallProgress {
                    source_id: info.appid.to_string(),
                    game_id,
                    name: info.name,
                    state_flags: info.state_flags,
                    bytes_downloaded: info.bytes_downloaded,
                    bytes_to_download: info.bytes_to_download,
                    bytes_staged: info.bytes_staged,
                    bytes_to_stage: info.bytes_to_stage,
                    progress,
                    status: derive_status(info.state_flags).to_string(),
                });
            } else if let Some(prev) = prev_flags {
                if prev != STATE_FULLY_INSTALLED {
                    // Just completed — transitioned to installed
                    let game_id = resolve_game_id(db, info.appid);
                    completed.push(InstallProgress {
                        source_id: info.appid.to_string(),
                        game_id,
                        name: info.name,
                        state_flags: info.state_flags,
                        bytes_downloaded: info.bytes_downloaded,
                        bytes_to_download: info.bytes_to_download,
                        bytes_staged: info.bytes_staged,
                        bytes_to_stage: info.bytes_to_stage,
                        progress: 1.0,
                        status: "installed".to_string(),
                    });
                }
            }
        }
    }

    // Update tracked state for next tick
    *prev_states = current_appids;

    // Emit events AFTER all scanning is complete (no locks held)
    if !active.is_empty() {
        let _ = app_handle.emit("install-progress", &active);
    }

    for item in &completed {
        tracing::info!(
            source_id = %item.source_id,
            name = %item.name,
            "Steam install completed"
        );
        let _ = app_handle.emit("install-complete", item);
    }
}

/// Resolve a Steam appid to a game_id via the database. Returns None if not found.
fn resolve_game_id(db: &CacheDbHandle, appid: u32) -> Option<String> {
    let db = db.lock_or_err("DB").ok()?;
    db.get_game_id("steam", &appid.to_string()).ok().flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_status_installed() {
        assert_eq!(derive_status(4), "installed");
    }

    #[test]
    fn test_derive_status_downloading() {
        assert_eq!(derive_status(1026), "downloading"); // 1024 + 2
        assert_eq!(derive_status(1028), "downloading"); // 1024 + 4
    }

    #[test]
    fn test_derive_status_staging() {
        assert_eq!(derive_status(16), "staging");
        assert_eq!(derive_status(20), "staging"); // 16 + 4
    }

    #[test]
    fn test_derive_status_update_required() {
        assert_eq!(derive_status(2), "update_required");
        assert_eq!(derive_status(6), "update_required"); // 4 + 2 — update beats installed
    }

    #[test]
    fn test_derive_status_pending() {
        assert_eq!(derive_status(0), "pending");
        assert_eq!(derive_status(512), "pending"); // unknown flag
    }

    #[test]
    fn test_compute_progress_downloading() {
        let info = vdf_parser::ManifestProgressInfo {
            appid: 440,
            name: "TF2".to_string(),
            state_flags: 1026,
            bytes_downloaded: 5_000_000_000,
            bytes_to_download: 10_000_000_000,
            bytes_staged: 0,
            bytes_to_stage: 0,
        };
        let p = compute_progress(&info);
        assert!((p - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn test_compute_progress_staging_fallback() {
        let info = vdf_parser::ManifestProgressInfo {
            appid: 440,
            name: "TF2".to_string(),
            state_flags: 16,
            bytes_downloaded: 0,
            bytes_to_download: 0,
            bytes_staged: 3_000_000_000,
            bytes_to_stage: 10_000_000_000,
        };
        let p = compute_progress(&info);
        assert!((p - 0.3).abs() < f64::EPSILON);
    }

    #[test]
    fn test_compute_progress_zero_total() {
        let info = vdf_parser::ManifestProgressInfo {
            appid: 440,
            name: "TF2".to_string(),
            state_flags: 0,
            bytes_downloaded: 0,
            bytes_to_download: 0,
            bytes_staged: 0,
            bytes_to_stage: 0,
        };
        assert_eq!(compute_progress(&info), 0.0);
    }
}
