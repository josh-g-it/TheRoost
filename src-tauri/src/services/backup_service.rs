use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use super::cache_db::CacheDbHandle;
use super::credential_store;
use crate::utils::error::AppError;

/// Current schema version the app expects (must match cache_db migrations).
const CURRENT_SCHEMA_VERSION: u32 = 23;

/// Block restore if backup schema is more than this many versions ahead.
const MAX_SCHEMA_FORWARD_COMPAT: u32 = 5;

// ── Public types ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub app_version: String,
    pub schema_version: u32,
    pub created_at: String,
    pub db_size_bytes: u64,
    pub settings_size_bytes: u64,
    pub art_file_count: u32,
    pub art_total_bytes: u64,
    pub credential_hints: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEstimate {
    pub total_size_bytes: u64,
    pub db_size_bytes: u64,
    pub settings_size_bytes: u64,
    pub art_file_count: u32,
    pub art_total_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreValidation {
    pub valid: bool,
    pub manifest: Option<BackupManifest>,
    pub error: Option<String>,
    pub schema_compatible: bool,
    pub schema_warning: Option<String>,
}

// ── Progress events ───────────────────────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupProgress {
    phase: String,
    detail: String,
}

fn emit_progress(app_handle: &AppHandle, phase: &str, detail: &str) {
    let _ = app_handle.emit(
        "backup-progress",
        BackupProgress {
            phase: phase.to_string(),
            detail: detail.to_string(),
        },
    );
}

// ── Helpers ───────────────────────────────────────────────────────

fn enumerate_art_files(app_data: &Path) -> Result<Vec<PathBuf>, AppError> {
    let art_dir = app_data.join("art");
    if !art_dir.exists() {
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    for entry in fs::read_dir(&art_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() && path.extension().is_some_and(|ext| ext == "png") {
            files.push(path);
        }
    }
    Ok(files)
}

fn file_size(path: &Path) -> u64 {
    fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

fn build_credential_hints() -> Vec<String> {
    let mut hints = Vec::new();
    if credential_store::load_api_key().ok().flatten().is_some() {
        hints.push("steam_api_key".to_string());
    }
    if credential_store::load_sgdb_api_key()
        .ok()
        .flatten()
        .is_some()
    {
        hints.push("steamgriddb_api_key".to_string());
    }
    for provider in &["gemini"] {
        if credential_store::load_cloud_key(provider)
            .ok()
            .flatten()
            .is_some()
        {
            hints.push(format!("cloud_ai_{provider}"));
        }
    }
    hints
}

fn restore_credentials(values: &HashMap<String, String>) -> Result<(), AppError> {
    for (account, key) in values {
        if key.is_empty() {
            continue;
        }
        match account.as_str() {
            "steam_api_key" => credential_store::store_api_key(key)?,
            "steamgriddb_api_key" => credential_store::store_sgdb_api_key(key)?,
            other if other.starts_with("cloud_ai_") => {
                let provider = other.strip_prefix("cloud_ai_").unwrap();
                credential_store::store_cloud_key(provider, key)?;
            }
            _ => tracing::warn!(account, "Unknown credential account in backup, skipping"),
        }
    }
    Ok(())
}

/// Add a file to the ZIP archive, reading its contents from disk.
fn zip_add_file(
    writer: &mut ZipWriter<fs::File>,
    options: SimpleFileOptions,
    archive_name: &str,
    source_path: &Path,
) -> Result<(), AppError> {
    writer.start_file(archive_name, options).map_err(|e| {
        AppError::Backup(format!("Failed to start ZIP entry '{archive_name}': {e}"))
    })?;
    let mut buf = Vec::new();
    fs::File::open(source_path)
        .and_then(|mut f| f.read_to_end(&mut buf))
        .map_err(|e| AppError::Backup(format!("Failed to read '{archive_name}': {e}")))?;
    writer
        .write_all(&buf)
        .map_err(|e| AppError::Backup(format!("Failed to write '{archive_name}': {e}")))?;
    Ok(())
}

// ── Public API ────────────────────────────────────────────────────

/// Estimate backup size without creating the archive.
pub fn estimate_backup_size(
    app_data: &Path,
    db: &CacheDbHandle,
) -> Result<BackupEstimate, AppError> {
    // Checkpoint WAL so the DB file size is accurate
    {
        let db_guard = db
            .lock()
            .map_err(|_| AppError::LockPoisoned("DB lock poisoned during estimate".to_string()))?;
        db_guard.checkpoint_wal()?;
    }

    let db_size = file_size(&app_data.join("theroost.db"));
    let settings_size = file_size(&app_data.join("settings.json"));

    let art_files = enumerate_art_files(app_data)?;
    let art_total: u64 = art_files.iter().map(|p| file_size(p)).sum();

    Ok(BackupEstimate {
        total_size_bytes: db_size + settings_size + art_total,
        db_size_bytes: db_size,
        settings_size_bytes: settings_size,
        art_file_count: art_files.len() as u32,
        art_total_bytes: art_total,
    })
}

/// Create a full backup archive at the given output path.
pub fn create_backup(
    app_handle: &AppHandle,
    app_data: &Path,
    db: &CacheDbHandle,
    output_path: &Path,
) -> Result<BackupManifest, AppError> {
    let app_version = app_handle.package_info().version.to_string();

    // 1. Checkpoint WAL and read schema version under lock
    emit_progress(app_handle, "checkpoint", "Preparing database...");
    let schema_version;
    {
        let db_guard = db
            .lock()
            .map_err(|_| AppError::LockPoisoned("DB lock poisoned during backup".to_string()))?;
        db_guard.checkpoint_wal()?;
        schema_version = db_guard.schema_version()?;
    }

    // 2. Copy DB to temp file (outside lock)
    emit_progress(app_handle, "copying-db", "Copying database...");
    let db_path = app_data.join("theroost.db");
    let temp_db = app_data.join("_backup_temp.db");
    fs::copy(&db_path, &temp_db)?;

    // 3. Read settings
    emit_progress(app_handle, "copying-settings", "Reading settings...");
    let settings_path = app_data.join("settings.json");

    // 4. Enumerate art files
    emit_progress(app_handle, "copying-art", "Scanning custom art...");
    let art_files = enumerate_art_files(app_data)?;

    // 5. Build credential hints
    let credential_hints = build_credential_hints();

    // 6. Compute sizes
    let db_size = file_size(&temp_db);
    let settings_size = file_size(&settings_path);
    let art_total: u64 = art_files.iter().map(|p| file_size(p)).sum();

    // 7. Build manifest
    let manifest = BackupManifest {
        app_version,
        schema_version,
        created_at: chrono::Utc::now().to_rfc3339(),
        db_size_bytes: db_size,
        settings_size_bytes: settings_size,
        art_file_count: art_files.len() as u32,
        art_total_bytes: art_total,
        credential_hints,
    };

    // 8. Write ZIP archive
    emit_progress(app_handle, "writing-archive", "Creating backup archive...");
    let zip_file = fs::File::create(output_path)
        .map_err(|e| AppError::Backup(format!("Failed to create backup file: {e}")))?;
    let mut zip = ZipWriter::new(zip_file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // manifest.json
    zip.start_file("manifest.json", options)
        .map_err(|e| AppError::Backup(format!("Failed to write manifest: {e}")))?;
    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| AppError::Backup(format!("Failed to serialize manifest: {e}")))?;
    zip.write_all(manifest_json.as_bytes())
        .map_err(|e| AppError::Backup(format!("Failed to write manifest: {e}")))?;

    // credentials_hint.json
    zip.start_file("credentials_hint.json", options)
        .map_err(|e| AppError::Backup(format!("Failed to write credentials hint: {e}")))?;
    let hints_json = serde_json::to_string_pretty(&manifest.credential_hints)
        .map_err(|e| AppError::Backup(format!("Failed to serialize credentials hint: {e}")))?;
    zip.write_all(hints_json.as_bytes())
        .map_err(|e| AppError::Backup(format!("Failed to write credentials hint: {e}")))?;

    // theroost.db
    zip_add_file(&mut zip, options, "theroost.db", &temp_db)?;

    // settings.json
    if settings_path.exists() {
        zip_add_file(&mut zip, options, "settings.json", &settings_path)?;
    }

    // art/ files
    for (i, art_path) in art_files.iter().enumerate() {
        if let Some(name) = art_path.file_name().and_then(|n| n.to_str()) {
            emit_progress(
                app_handle,
                "copying-art",
                &format!("Packing art ({}/{})", i + 1, art_files.len()),
            );
            zip_add_file(&mut zip, options, &format!("art/{name}"), art_path)?;
        }
    }

    zip.finish()
        .map_err(|e| AppError::Backup(format!("Failed to finalize archive: {e}")))?;

    // Clean up temp DB copy
    let _ = fs::remove_file(&temp_db);

    emit_progress(app_handle, "complete", "Backup created successfully!");
    tracing::info!(
        path = %output_path.display(),
        size_mb = (db_size + settings_size + art_total) / (1024 * 1024),
        art_count = art_files.len(),
        "Backup created"
    );

    Ok(manifest)
}

/// Validate a `.roost` archive without extracting.
pub fn validate_backup(archive_path: &Path) -> Result<RestoreValidation, AppError> {
    let file = match fs::File::open(archive_path) {
        Ok(f) => f,
        Err(e) => {
            return Ok(RestoreValidation {
                valid: false,
                manifest: None,
                error: Some(format!("Cannot open file: {e}")),
                schema_compatible: false,
                schema_warning: None,
            });
        }
    };

    let mut archive = match zip::ZipArchive::new(file) {
        Ok(a) => a,
        Err(e) => {
            return Ok(RestoreValidation {
                valid: false,
                manifest: None,
                error: Some(format!("Invalid archive format: {e}")),
                schema_compatible: false,
                schema_warning: None,
            });
        }
    };

    // Check required files
    for required in &["manifest.json", "theroost.db"] {
        if archive.by_name(required).is_err() {
            return Ok(RestoreValidation {
                valid: false,
                manifest: None,
                error: Some(format!("Missing required file: {required}")),
                schema_compatible: false,
                schema_warning: None,
            });
        }
    }

    // Parse manifest
    let manifest: BackupManifest = {
        let mut entry = archive
            .by_name("manifest.json")
            .map_err(|e| AppError::Backup(format!("Failed to read manifest from archive: {e}")))?;
        let mut buf = String::new();
        entry.read_to_string(&mut buf)?;
        serde_json::from_str(&buf)
            .map_err(|e| AppError::Backup(format!("Invalid manifest JSON: {e}")))?
    };

    // Schema compatibility check
    let schema_compatible;
    let schema_warning;
    if manifest.schema_version > CURRENT_SCHEMA_VERSION + MAX_SCHEMA_FORWARD_COMPAT {
        schema_compatible = false;
        schema_warning = Some(format!(
            "Backup is from a much newer version (schema v{}, current v{}). Cannot restore.",
            manifest.schema_version, CURRENT_SCHEMA_VERSION
        ));
    } else if manifest.schema_version > CURRENT_SCHEMA_VERSION {
        schema_compatible = true;
        schema_warning = Some(format!(
            "Backup is from a newer version (schema v{}, current v{}). Some data may not be recognized.",
            manifest.schema_version, CURRENT_SCHEMA_VERSION
        ));
    } else {
        schema_compatible = true;
        schema_warning = None;
    }

    Ok(RestoreValidation {
        valid: schema_compatible,
        manifest: Some(manifest),
        error: None,
        schema_compatible,
        schema_warning,
    })
}

/// Create a safety backup at `app_data/_safety_backup.roost`.
pub fn create_safety_backup(
    app_handle: &AppHandle,
    app_data: &Path,
    db: &CacheDbHandle,
) -> Result<PathBuf, AppError> {
    let safety_path = app_data.join("_safety_backup.roost");
    emit_progress(
        app_handle,
        "safety-backup",
        "Creating safety backup of current data...",
    );
    create_backup(app_handle, app_data, db, &safety_path)?;
    tracing::info!("Safety backup created at {}", safety_path.display());
    Ok(safety_path)
}

/// Restore from a validated `.roost` archive.
pub fn restore_from_backup(
    app_handle: &AppHandle,
    app_data: &Path,
    db: &CacheDbHandle,
    archive_path: &Path,
    credential_values: &HashMap<String, String>,
) -> Result<(), AppError> {
    let file = fs::File::open(archive_path)
        .map_err(|e| AppError::Backup(format!("Cannot open archive: {e}")))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Backup(format!("Invalid archive: {e}")))?;

    // 1. Extract DB to temp file and validate
    emit_progress(app_handle, "extracting-db", "Extracting database...");
    let temp_db_path = app_data.join("_restore_temp.db");
    {
        let mut entry = archive
            .by_name("theroost.db")
            .map_err(|e| AppError::Backup(format!("Missing database in archive: {e}")))?;
        let mut out = fs::File::create(&temp_db_path)?;
        std::io::copy(&mut entry, &mut out)?;
    }

    // Validate the extracted DB opens correctly
    {
        let test_conn = rusqlite::Connection::open(&temp_db_path)
            .map_err(|e| AppError::Backup(format!("Restored database is corrupt: {e}")))?;
        let _version: u32 = test_conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .map_err(|e| AppError::Backup(format!("Restored database has invalid schema: {e}")))?;
    }

    // 2. Swap database under lock
    emit_progress(app_handle, "restoring-db", "Replacing database...");
    {
        let mut db_guard = db
            .lock()
            .map_err(|_| AppError::LockPoisoned("DB lock poisoned during restore".to_string()))?;
        let live_db_path = app_data.join("theroost.db");
        db_guard.swap_database(&temp_db_path, &live_db_path)?;
    }
    // Clean up temp file
    let _ = fs::remove_file(&temp_db_path);

    // Remove stale WAL artifacts
    let _ = fs::remove_file(app_data.join("theroost.db-wal"));
    let _ = fs::remove_file(app_data.join("theroost.db-shm"));

    // 3. Restore settings.json
    emit_progress(app_handle, "extracting-settings", "Restoring settings...");
    if let Ok(mut entry) = archive.by_name("settings.json") {
        let settings_path = app_data.join("settings.json");
        let tmp_path = app_data.join("settings.json.tmp");
        {
            let mut out = fs::File::create(&tmp_path)?;
            std::io::copy(&mut entry, &mut out)?;
        }
        fs::rename(&tmp_path, &settings_path)?;
    }

    // 4. Restore art directory
    emit_progress(app_handle, "extracting-art", "Restoring custom art...");
    let art_dir = app_data.join("art");
    // Clear existing art
    if art_dir.exists() {
        let _ = fs::remove_dir_all(&art_dir);
    }
    fs::create_dir_all(&art_dir)?;

    let file_count = archive.len();
    for i in 0..file_count {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| AppError::Backup(format!("Failed to read archive entry: {e}")))?;
        let entry_name = entry.name().to_string();
        if entry_name.starts_with("art/") && entry_name.len() > 4 {
            let filename = &entry_name[4..]; // strip "art/"
            let dest = art_dir.join(filename);
            let mut out = fs::File::create(&dest)?;
            std::io::copy(&mut entry, &mut out)?;
        }
    }

    // 5. Restore credentials
    emit_progress(app_handle, "restoring-credentials", "Saving API keys...");
    restore_credentials(credential_values)?;

    emit_progress(app_handle, "complete", "Restore complete!");
    tracing::info!(
        archive = %archive_path.display(),
        "Backup restored successfully"
    );

    Ok(())
}

/// Rollback to a safety backup (used on restore failure).
pub fn rollback_to_safety(
    app_handle: &AppHandle,
    app_data: &Path,
    db: &CacheDbHandle,
    safety_path: &Path,
) -> Result<(), AppError> {
    tracing::warn!("Rolling back to safety backup");
    emit_progress(
        app_handle,
        "rollback",
        "Restoring previous data from safety backup...",
    );
    // Restore with empty credentials (don't overwrite any keys during rollback)
    restore_from_backup(app_handle, app_data, db, safety_path, &HashMap::new())?;
    // Clean up safety backup file
    let _ = fs::remove_file(safety_path);
    Ok(())
}

/// Read the credential hints from a `.roost` archive.
pub fn get_credential_hints(archive_path: &Path) -> Result<Vec<String>, AppError> {
    let file = fs::File::open(archive_path)
        .map_err(|e| AppError::Backup(format!("Cannot open archive: {e}")))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Backup(format!("Invalid archive: {e}")))?;

    let result = match archive.by_name("credentials_hint.json") {
        Ok(mut entry) => {
            let mut buf = String::new();
            entry.read_to_string(&mut buf)?;
            let hints: Vec<String> = serde_json::from_str(&buf)
                .map_err(|e| AppError::Backup(format!("Invalid credentials hint: {e}")))?;
            Ok(hints)
        }
        Err(_) => Ok(Vec::new()),
    };
    result
}

// ── Tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::cache_db::CacheDb;
    use std::sync::{Arc, Mutex};
    use tempfile::TempDir;

    /// Create a minimal CacheDb in a temp directory for testing.
    fn setup_test_env() -> (TempDir, CacheDbHandle) {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("theroost.db");
        let db = CacheDb::new(&db_path).unwrap();
        let handle = Arc::new(Mutex::new(db));
        (dir, handle)
    }

    /// Write a minimal settings.json in the test directory.
    fn write_test_settings(dir: &Path) {
        fs::write(
            dir.join("settings.json"),
            r#"{"theme":"dark-gaming","isFirstRun":false}"#,
        )
        .unwrap();
    }

    /// Create a sample art file in the test directory.
    fn write_test_art(dir: &Path, name: &str) {
        let art_dir = dir.join("art");
        fs::create_dir_all(&art_dir).unwrap();
        // Write a minimal valid PNG (1x1 pixel)
        let png_bytes: &[u8] = &[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
            0x77, 0x53, 0xDE,
        ];
        fs::write(art_dir.join(name), png_bytes).unwrap();
    }

    #[test]
    fn test_estimate_backup_size() {
        let (dir, db) = setup_test_env();
        write_test_settings(dir.path());

        let est = estimate_backup_size(dir.path(), &db).unwrap();
        assert!(est.db_size_bytes > 0, "DB should have nonzero size");
        assert!(
            est.settings_size_bytes > 0,
            "Settings should have nonzero size"
        );
        assert_eq!(est.art_file_count, 0);
        assert_eq!(est.art_total_bytes, 0);
        assert_eq!(
            est.total_size_bytes,
            est.db_size_bytes + est.settings_size_bytes
        );
    }

    #[test]
    fn test_estimate_with_art() {
        let (dir, db) = setup_test_env();
        write_test_settings(dir.path());
        write_test_art(dir.path(), "test_grid.png");
        write_test_art(dir.path(), "test_hero.png");

        let est = estimate_backup_size(dir.path(), &db).unwrap();
        assert_eq!(est.art_file_count, 2);
        assert!(est.art_total_bytes > 0);
    }

    #[test]
    fn test_validate_invalid_file() {
        let dir = TempDir::new().unwrap();
        let bad_file = dir.path().join("bad.roost");
        fs::write(&bad_file, b"this is not a zip").unwrap();

        let result = validate_backup(&bad_file).unwrap();
        assert!(!result.valid);
        assert!(result.error.unwrap().contains("Invalid archive"));
    }

    #[test]
    fn test_validate_missing_manifest() {
        let dir = TempDir::new().unwrap();
        let zip_path = dir.path().join("no_manifest.roost");
        let file = fs::File::create(&zip_path).unwrap();
        let mut zip = ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("theroost.db", options).unwrap();
        zip.write_all(b"fake db").unwrap();
        zip.finish().unwrap();

        let result = validate_backup(&zip_path).unwrap();
        assert!(!result.valid);
        assert!(result.error.unwrap().contains("manifest.json"));
    }

    #[test]
    fn test_validate_missing_db() {
        let dir = TempDir::new().unwrap();
        let zip_path = dir.path().join("no_db.roost");
        let file = fs::File::create(&zip_path).unwrap();
        let mut zip = ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(b"{}").unwrap();
        zip.finish().unwrap();

        let result = validate_backup(&zip_path).unwrap();
        assert!(!result.valid);
        assert!(result.error.unwrap().contains("theroost.db"));
    }

    #[test]
    fn test_validate_nonexistent_file() {
        let result = validate_backup(Path::new("/nonexistent/backup.roost")).unwrap();
        assert!(!result.valid);
        assert!(result.error.unwrap().contains("Cannot open"));
    }

    #[test]
    fn test_schema_compatibility_same_version() {
        let dir = TempDir::new().unwrap();
        let zip_path = dir.path().join("compat.roost");

        let manifest = BackupManifest {
            app_version: "1.8.0".to_string(),
            schema_version: CURRENT_SCHEMA_VERSION,
            created_at: "2026-02-26T00:00:00Z".to_string(),
            db_size_bytes: 100,
            settings_size_bytes: 50,
            art_file_count: 0,
            art_total_bytes: 0,
            credential_hints: vec![],
        };

        // Create a valid ZIP with manifest + dummy DB
        let file = fs::File::create(&zip_path).unwrap();
        let mut zip = ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(serde_json::to_string(&manifest).unwrap().as_bytes())
            .unwrap();

        zip.start_file("theroost.db", options).unwrap();
        zip.write_all(b"fake db").unwrap();

        zip.finish().unwrap();

        let result = validate_backup(&zip_path).unwrap();
        assert!(result.valid);
        assert!(result.schema_compatible);
        assert!(result.schema_warning.is_none());
    }

    #[test]
    fn test_schema_compatibility_newer_version_warning() {
        let dir = TempDir::new().unwrap();
        let zip_path = dir.path().join("newer.roost");

        let manifest = BackupManifest {
            app_version: "2.0.0".to_string(),
            schema_version: CURRENT_SCHEMA_VERSION + 2,
            created_at: "2026-02-26T00:00:00Z".to_string(),
            db_size_bytes: 100,
            settings_size_bytes: 50,
            art_file_count: 0,
            art_total_bytes: 0,
            credential_hints: vec![],
        };

        let file = fs::File::create(&zip_path).unwrap();
        let mut zip = ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(serde_json::to_string(&manifest).unwrap().as_bytes())
            .unwrap();
        zip.start_file("theroost.db", options).unwrap();
        zip.write_all(b"fake").unwrap();
        zip.finish().unwrap();

        let result = validate_backup(&zip_path).unwrap();
        assert!(result.valid);
        assert!(result.schema_compatible);
        assert!(result.schema_warning.is_some());
        assert!(result.schema_warning.unwrap().contains("newer version"));
    }

    #[test]
    fn test_schema_compatibility_too_new_blocked() {
        let dir = TempDir::new().unwrap();
        let zip_path = dir.path().join("too_new.roost");

        let manifest = BackupManifest {
            app_version: "3.0.0".to_string(),
            schema_version: CURRENT_SCHEMA_VERSION + MAX_SCHEMA_FORWARD_COMPAT + 1,
            created_at: "2026-02-26T00:00:00Z".to_string(),
            db_size_bytes: 100,
            settings_size_bytes: 50,
            art_file_count: 0,
            art_total_bytes: 0,
            credential_hints: vec![],
        };

        let file = fs::File::create(&zip_path).unwrap();
        let mut zip = ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(serde_json::to_string(&manifest).unwrap().as_bytes())
            .unwrap();
        zip.start_file("theroost.db", options).unwrap();
        zip.write_all(b"fake").unwrap();
        zip.finish().unwrap();

        let result = validate_backup(&zip_path).unwrap();
        assert!(!result.valid);
        assert!(!result.schema_compatible);
        assert!(result.schema_warning.unwrap().contains("Cannot restore"));
    }

    #[test]
    fn test_checkpoint_wal() {
        let (dir, db) = setup_test_env();
        let _ = dir; // keep alive
        let guard = db.lock().unwrap();
        assert!(guard.checkpoint_wal().is_ok());
    }

    #[test]
    fn test_schema_version() {
        let (dir, db) = setup_test_env();
        let _ = dir;
        let guard = db.lock().unwrap();
        let version = guard.schema_version().unwrap();
        assert_eq!(version, CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn test_swap_database() {
        let dir = TempDir::new().unwrap();

        // Create original DB
        let live_path = dir.path().join("live.db");
        let mut db = CacheDb::new(&live_path).unwrap();

        // Create a different DB to swap in
        let other_path = dir.path().join("other.db");
        let other_db = CacheDb::new(&other_path).unwrap();
        other_db
            .register_game("Steam", "999", "SwappedGame")
            .unwrap();
        drop(other_db);

        // Swap
        db.swap_database(&other_path, &live_path).unwrap();

        // Verify the swapped data is now accessible
        let name = db
            .get_game_name(&db.get_game_id("Steam", "999").unwrap().unwrap())
            .unwrap();
        assert_eq!(name.unwrap(), "SwappedGame");
    }

    #[test]
    fn test_enumerate_art_files_empty() {
        let dir = TempDir::new().unwrap();
        let files = enumerate_art_files(dir.path()).unwrap();
        assert!(files.is_empty());
    }

    #[test]
    fn test_enumerate_art_files_with_pngs() {
        let dir = TempDir::new().unwrap();
        write_test_art(dir.path(), "abc_grid.png");
        write_test_art(dir.path(), "def_hero.png");
        // Non-PNG should be ignored
        fs::write(dir.path().join("art").join("readme.txt"), "ignore me").unwrap();

        let files = enumerate_art_files(dir.path()).unwrap();
        assert_eq!(files.len(), 2);
        assert!(files.iter().all(|f| f.extension().unwrap() == "png"));
    }

    #[test]
    fn test_credential_hints_json_roundtrip() {
        let hints = vec!["steam_api_key".to_string(), "cloud_ai_gemini".to_string()];
        let json = serde_json::to_string(&hints).unwrap();
        let parsed: Vec<String> = serde_json::from_str(&json).unwrap();
        assert_eq!(hints, parsed);
    }
}
