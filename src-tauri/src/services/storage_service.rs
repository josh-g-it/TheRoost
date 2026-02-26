use std::collections::HashMap;
use std::path::Path;
use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use crate::models::storage::{DriveInfo, GameStorageEntry, StorageScanResult};
use crate::services::cache_db::CacheDbHandle;
use crate::utils::error::{AppError, MutexExt};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgress {
    scanned: u32,
    total: u32,
    current_game: String,
}

/// Measure total file size of a directory (recursive).
pub fn measure_directory_size(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

/// Query Windows for drive total/free bytes via GetDiskFreeSpaceExW.
pub fn get_drive_stats(drive_letter: &str) -> Option<(u64, u64)> {
    use windows::core::HSTRING;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let root = format!("{}\\", drive_letter); // e.g. "D:\\"
    let root_w = HSTRING::from(&root);

    let mut free_bytes_available = 0u64;
    let mut total_bytes = 0u64;
    let mut _total_free_bytes = 0u64;

    let ok = unsafe {
        GetDiskFreeSpaceExW(
            &root_w,
            Some(&mut free_bytes_available),
            Some(&mut total_bytes),
            Some(&mut _total_free_bytes),
        )
    };

    if ok.is_ok() {
        Some((total_bytes, free_bytes_available))
    } else {
        tracing::warn!(drive = %drive_letter, "Failed to query drive stats");
        None
    }
}

/// Extract drive letter (e.g. "D:") from an install path.
pub fn extract_drive_letter(path: &str) -> String {
    if path.len() >= 2 && path.as_bytes()[1] == b':' {
        path[..2].to_uppercase()
    } else {
        "?:".to_string()
    }
}

/// Run the full storage scan: drive stats + per-game directory sizes.
pub fn scan_storage(
    app_handle: &AppHandle,
    db: &CacheDbHandle,
) -> Result<StorageScanResult, AppError> {
    let start = Instant::now();

    // Load game install paths from DB (lock released immediately)
    let games_raw = {
        let guard = db.lock_or_err("storage_scan")?;
        guard.get_installed_games_for_storage()?
    };

    let total = games_raw.len() as u32;
    if total == 0 {
        return Ok(StorageScanResult {
            drives: Vec::new(),
            games: Vec::new(),
            total_game_bytes: 0,
            scanned_count: 0,
            scan_duration_ms: start.elapsed().as_millis() as u64,
        });
    }

    // Measure each game directory and build entries
    let mut entries: Vec<GameStorageEntry> = Vec::with_capacity(games_raw.len());
    let mut drive_game_bytes: HashMap<String, u64> = HashMap::new();
    let mut drive_game_count: HashMap<String, u32> = HashMap::new();

    for (i, (game_id, name, source, source_id, install_path)) in games_raw.iter().enumerate() {
        // Emit progress
        let _ = app_handle.emit(
            "storage-scan-progress",
            ScanProgress {
                scanned: i as u32,
                total,
                current_game: name.clone(),
            },
        );

        let drive = extract_drive_letter(install_path);
        let size = measure_directory_size(Path::new(install_path));

        *drive_game_bytes.entry(drive.clone()).or_insert(0) += size;
        *drive_game_count.entry(drive.clone()).or_insert(0) += 1;

        entries.push(GameStorageEntry {
            game_id: game_id.clone(),
            name: name.clone(),
            source: source.clone(),
            source_id: source_id.clone(),
            install_path: install_path.clone(),
            size_bytes: size,
            drive_letter: drive,
        });
    }

    // Build drive info for each unique drive
    let mut drives: Vec<DriveInfo> = Vec::new();
    let mut drive_letters: Vec<String> = drive_game_bytes.keys().cloned().collect();
    drive_letters.sort();

    for letter in &drive_letters {
        let (total_bytes, free_bytes) = get_drive_stats(letter).unwrap_or((0, 0));
        drives.push(DriveInfo {
            drive_letter: letter.clone(),
            total_bytes,
            free_bytes,
            game_bytes: *drive_game_bytes.get(letter).unwrap_or(&0),
            game_count: *drive_game_count.get(letter).unwrap_or(&0),
        });
    }

    let total_game_bytes: u64 = entries.iter().map(|e| e.size_bytes).sum();

    // Emit final progress
    let _ = app_handle.emit(
        "storage-scan-progress",
        ScanProgress {
            scanned: total,
            total,
            current_game: String::new(),
        },
    );

    Ok(StorageScanResult {
        drives,
        games: entries,
        total_game_bytes,
        scanned_count: total,
        scan_duration_ms: start.elapsed().as_millis() as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_measure_directory_size() {
        let dir = tempfile::tempdir().unwrap();
        // Create a few files with known sizes
        fs::write(dir.path().join("a.txt"), vec![0u8; 1000]).unwrap();
        fs::write(dir.path().join("b.bin"), vec![0u8; 2500]).unwrap();
        fs::create_dir(dir.path().join("sub")).unwrap();
        fs::write(dir.path().join("sub").join("c.dat"), vec![0u8; 500]).unwrap();

        let size = measure_directory_size(dir.path());
        assert_eq!(size, 4000);
    }

    #[test]
    fn test_measure_empty_directory() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(measure_directory_size(dir.path()), 0);
    }

    #[test]
    fn test_measure_nonexistent_directory() {
        let path = Path::new("Z:\\nonexistent\\path\\abc123");
        assert_eq!(measure_directory_size(path), 0);
    }

    #[test]
    fn test_extract_drive_letter() {
        assert_eq!(extract_drive_letter("D:\\Games\\Portal 2"), "D:");
        assert_eq!(extract_drive_letter("c:\\program files"), "C:");
        assert_eq!(extract_drive_letter("/unix/path"), "?:");
    }
}
