use tauri::State;

use crate::models::tag::{
    CreateTagRequest, GameTagAssignment, ReorderTagsRequest, Tag, UpdateTagRequest,
};
use crate::services::cache_db::CacheDbHandle;
use crate::utils::error::{AppError, MutexExt};

#[tauri::command]
pub async fn get_all_tags(db: State<'_, CacheDbHandle>) -> Result<Vec<Tag>, AppError> {
    tracing::debug!("Fetching all tags");
    let db = db.lock_or_err("DB")?;
    db.get_all_tags()
}

#[tauri::command]
pub async fn create_tag(
    request: CreateTagRequest,
    db: State<'_, CacheDbHandle>,
) -> Result<Tag, AppError> {
    tracing::info!(name = %request.name, color_index = request.color_index, "Creating tag");
    let db = db.lock_or_err("DB")?;
    db.create_tag(&request.name, request.color_index)
}

#[tauri::command]
pub async fn update_tag(
    request: UpdateTagRequest,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    tracing::info!(id = request.id, name = %request.name, "Updating tag");
    let db = db.lock_or_err("DB")?;
    db.update_tag(request.id, &request.name, request.color_index)
}

#[tauri::command]
pub async fn delete_tag(id: i64, db: State<'_, CacheDbHandle>) -> Result<(), AppError> {
    tracing::info!(id, "Deleting tag");
    let db = db.lock_or_err("DB")?;
    db.delete_tag(id)
}

#[tauri::command]
pub async fn reorder_tags(
    request: ReorderTagsRequest,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    tracing::info!("Reordering tags");
    let db = db.lock_or_err("DB")?;
    db.reorder_tags(&request.tag_ids)
}

#[tauri::command]
pub async fn set_game_tags(
    assignment: GameTagAssignment,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    tracing::info!(game_id = %assignment.game_id, tag_count = assignment.tag_ids.len(), "Setting game tags");
    let db = db.lock_or_err("DB")?;
    db.set_game_tags(&assignment.game_id, &assignment.tag_ids)
}

#[tauri::command]
pub async fn get_game_tag_ids(
    game_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<i64>, AppError> {
    let db = db.lock_or_err("DB")?;
    db.get_game_tag_ids(&game_id)
}

#[tauri::command]
pub async fn get_all_game_tags(
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<(String, i64)>, AppError> {
    let db = db.lock_or_err("DB")?;
    db.get_all_game_tags()
}

#[tauri::command]
pub async fn bulk_add_tag(
    game_ids: Vec<String>,
    tag_ids: Vec<i64>,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    tracing::info!(
        game_count = game_ids.len(),
        tag_count = tag_ids.len(),
        "Bulk adding tags"
    );
    let db = db.lock_or_err("DB")?;
    db.bulk_set_game_tags(&game_ids, &tag_ids)
}
