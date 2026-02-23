use crate::models::friend::{FriendInfo, FriendLibrary};
use crate::services::friends_service;
use crate::utils::error::AppError;

#[tauri::command]
pub async fn fetch_friends_list(
    api_key: String,
    steam_id: String,
) -> Result<Vec<FriendInfo>, AppError> {
    friends_service::fetch_friends(&api_key, &steam_id).await
}

#[tauri::command]
pub async fn fetch_friend_library(
    api_key: String,
    friend_steam_id: String,
) -> Result<FriendLibrary, AppError> {
    friends_service::fetch_friend_library(&api_key, &friend_steam_id).await
}
