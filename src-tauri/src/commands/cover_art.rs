use tauri::State;

use crate::services::cache_db::CacheDbHandle;
use crate::services::cover_art::CoverArtService;
use crate::services::credential_store;
use crate::services::steamgriddb::SgdbImageOption;
use crate::utils::error::AppError;

#[tauri::command]
pub async fn get_cover_art_url(
    game_id: String,
    image_type: String,
    db: State<'_, CacheDbHandle>,
) -> Result<Option<String>, AppError> {
    let service = CoverArtService::new(db.inner().clone());
    service.resolve_image(&game_id, &image_type).await
}

#[tauri::command]
pub async fn fetch_cover_art_batch(db: State<'_, CacheDbHandle>) -> Result<usize, AppError> {
    let service = CoverArtService::new(db.inner().clone());
    service.backfill_missing(100).await
}

#[tauri::command]
pub fn store_sgdb_api_key(key: String) -> Result<(), AppError> {
    credential_store::store_sgdb_api_key(&key)
}

#[tauri::command]
pub fn get_sgdb_key_status() -> Result<bool, AppError> {
    Ok(credential_store::load_sgdb_api_key()?.is_some())
}

#[tauri::command]
pub fn delete_sgdb_api_key() -> Result<(), AppError> {
    credential_store::delete_sgdb_api_key()
}

#[tauri::command]
pub async fn get_cover_art_options(
    game_id: String,
    image_type: String,
    search_query: Option<String>,
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<SgdbImageOption>, AppError> {
    let service = CoverArtService::new(db.inner().clone());
    service
        .get_image_options(&game_id, &image_type, 5, search_query.as_deref())
        .await
}

#[tauri::command]
pub async fn set_cover_art(
    game_id: String,
    image_type: String,
    image_url: String,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    let service = CoverArtService::new(db.inner().clone());
    service.set_user_image(&game_id, &image_type, &image_url)
}
