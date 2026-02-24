use tauri::State;

use crate::models::metadata::StoreMetadata;
use crate::services::cache_db::CacheDbHandle;
use crate::services::metadata_service::MetadataService;
use crate::utils::error::{AppError, MutexExt};

#[tauri::command]
pub async fn fetch_game_metadata(
    game_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<Option<StoreMetadata>, AppError> {
    let service = MetadataService::new(db.inner().clone());
    service.get_metadata(&game_id).await
}

#[tauri::command]
pub async fn fetch_library_metadata(
    game_ids: Vec<String>,
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<(String, Option<StoreMetadata>)>, AppError> {
    let service = MetadataService::new(db.inner().clone());
    service.fetch_library_metadata(&game_ids).await
}

#[tauri::command]
pub async fn invalidate_metadata_cache(db: State<'_, CacheDbHandle>) -> Result<usize, AppError> {
    let db = db.lock_or_err("DB")?;
    let count = db.invalidate_metadata_cache()?;
    tracing::info!(count, "Metadata cache invalidated");
    Ok(count)
}

#[tauri::command]
pub async fn backfill_steam_tags(db: State<'_, CacheDbHandle>) -> Result<usize, AppError> {
    let service = MetadataService::new(db.inner().clone());
    service.backfill_steam_tags().await
}

#[tauri::command]
pub async fn backfill_store_details(db: State<'_, CacheDbHandle>) -> Result<usize, AppError> {
    let service = MetadataService::new(db.inner().clone());
    service.backfill_store_details().await
}
