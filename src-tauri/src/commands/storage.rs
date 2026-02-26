use tauri::{AppHandle, State};

use crate::models::storage::StorageScanResult;
use crate::services::cache_db::CacheDbHandle;
use crate::services::storage_service;
use crate::utils::error::AppError;

/// Scan all installed game directories and return storage breakdown.
#[tauri::command]
pub async fn scan_storage(
    app_handle: AppHandle,
    db: State<'_, CacheDbHandle>,
) -> Result<StorageScanResult, AppError> {
    tracing::info!("Starting storage scan");
    let db = db.inner().clone();
    let result =
        tokio::task::spawn_blocking(move || storage_service::scan_storage(&app_handle, &db))
            .await
            .map_err(|e| AppError::Backup(format!("Storage scan task failed: {}", e)))??;
    tracing::info!(
        games = result.scanned_count,
        total_bytes = result.total_game_bytes,
        duration_ms = result.scan_duration_ms,
        "Storage scan complete"
    );
    Ok(result)
}
