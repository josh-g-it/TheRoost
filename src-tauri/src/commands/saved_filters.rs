use tauri::State;

use crate::models::saved_filter::SavedFilterRow;
use crate::services::cache_db::CacheDbHandle;
use crate::utils::error::{AppError, MutexExt};

#[tauri::command]
pub async fn save_filter(
    name: String,
    filter_json: String,
    sort_by: Option<String>,
    sort_order: Option<String>,
    db: State<'_, CacheDbHandle>,
) -> Result<SavedFilterRow, AppError> {
    if name.chars().count() > 100 {
        return Err(AppError::Validation(
            "Filter name exceeds maximum length of 100 characters".into(),
        ));
    }
    tracing::info!(name = %name, "Saving filter preset");
    let db = db.lock_or_err("DB")?;
    db.save_filter(
        &name,
        &filter_json,
        sort_by.as_deref(),
        sort_order.as_deref(),
    )
}

#[tauri::command]
pub async fn get_all_saved_filters(
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<SavedFilterRow>, AppError> {
    tracing::debug!("Fetching all saved filters");
    let db = db.lock_or_err("DB")?;
    db.get_all_saved_filters()
}

#[tauri::command]
pub async fn delete_saved_filter(id: i64, db: State<'_, CacheDbHandle>) -> Result<(), AppError> {
    tracing::info!(id, "Deleting saved filter");
    let db = db.lock_or_err("DB")?;
    db.delete_saved_filter(id)
}
