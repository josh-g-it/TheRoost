use base64::Engine;
use tauri::{Manager, State};

use crate::services::cache_db::CacheDbHandle;
use crate::services::cover_art::CoverArtService;
use crate::services::credential_store;
use crate::services::image_processing::{self, CropArea};
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
    page: Option<u32>,
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<SgdbImageOption>, AppError> {
    let service = CoverArtService::new(db.inner().clone());
    service
        .get_image_options(
            &game_id,
            &image_type,
            20,
            page.unwrap_or(0),
            search_query.as_deref(),
        )
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

/// Upload a custom image file, crop it, and save as custom art.
#[tauri::command]
pub async fn upload_custom_art(
    game_id: String,
    image_type: String,
    file_path: String,
    crop: CropArea,
    app_handle: tauri::AppHandle,
    db: State<'_, CacheDbHandle>,
) -> Result<String, AppError> {
    let path = std::path::Path::new(&file_path);
    image_processing::validate_upload(path)?;
    let img = image_processing::read_local_image(path)?;

    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| AppError::Io(std::io::Error::other(e.to_string())))?;
    let art_dir = image_processing::ensure_art_dir(&app_data)?;

    let output_path =
        image_processing::crop_and_save(&img, &crop, &image_type, &game_id, &art_dir)?;
    let local_path_str = output_path.to_string_lossy().to_string();

    let service = CoverArtService::new(db.inner().clone());
    service.set_user_local_image(&game_id, &image_type, &local_path_str)?;

    Ok(format!("local:{}", local_path_str))
}

/// Crop a SteamGridDB (remote) image — downloads server-side, crops, and saves locally.
#[tauri::command]
pub async fn crop_remote_art(
    game_id: String,
    image_type: String,
    image_url: String,
    crop: CropArea,
    app_handle: tauri::AppHandle,
    db: State<'_, CacheDbHandle>,
) -> Result<String, AppError> {
    let img = image_processing::download_image(&image_url).await?;

    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| AppError::Io(std::io::Error::other(e.to_string())))?;
    let art_dir = image_processing::ensure_art_dir(&app_data)?;

    let output_path =
        image_processing::crop_and_save(&img, &crop, &image_type, &game_id, &art_dir)?;
    let local_path_str = output_path.to_string_lossy().to_string();

    let service = CoverArtService::new(db.inner().clone());
    service.set_user_local_image(&game_id, &image_type, &local_path_str)?;

    Ok(format!("local:{}", local_path_str))
}

/// Remove custom art for a game+type. Deletes the file and DB row, reverting to default.
#[tauri::command]
pub fn remove_custom_art(
    game_id: String,
    image_type: String,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    let service = CoverArtService::new(db.inner().clone());
    if let Some(local_path) = service.remove_custom_image(&game_id, &image_type)? {
        let path = std::path::Path::new(&local_path);
        image_processing::delete_art_file(path)?;
    }
    Ok(())
}

/// Get art info for all 3 types for the Art Management Menu.
#[tauri::command]
pub fn get_game_art_info(
    game_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<GameArtInfo>, AppError> {
    let service = CoverArtService::new(db.inner().clone());
    let raw = service.get_game_art_info(&game_id)?;
    Ok(raw
        .into_iter()
        .map(|(image_type, url, local_path, user_selected)| GameArtInfo {
            image_type,
            url: if url.is_empty() { None } else { Some(url) },
            local_path,
            user_selected,
        })
        .collect())
}

/// Read a local image file and return it as a data URL (data:image/png;base64,...).
/// Used to display custom art without relying on the asset protocol.
#[tauri::command]
pub fn read_image_base64(file_path: String) -> Result<String, AppError> {
    let path = std::path::Path::new(&file_path);

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => "image/png", // saved art is always PNG
    };

    let bytes = std::fs::read(path)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameArtInfo {
    pub image_type: String,
    pub url: Option<String>,
    pub local_path: Option<String>,
    pub user_selected: bool,
}
