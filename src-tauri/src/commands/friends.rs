use crate::models::friend::{FriendInfo, FriendLibrary};
use crate::services::credential_store;
use crate::services::friends_service;
use crate::utils::error::AppError;

/// Load the Steam API key from the OS credential manager.
fn load_steam_api_key() -> Result<String, AppError> {
    credential_store::load_api_key()?.ok_or_else(|| {
        AppError::Credential(
            "Steam API key not configured. Add it in Settings > Connections.".into(),
        )
    })
}

#[tauri::command]
pub async fn fetch_friends_list(steam_id: String) -> Result<Vec<FriendInfo>, AppError> {
    let api_key = load_steam_api_key()?;
    friends_service::fetch_friends(&api_key, &steam_id).await
}

#[tauri::command]
pub async fn fetch_friend_library(friend_steam_id: String) -> Result<FriendLibrary, AppError> {
    let api_key = load_steam_api_key()?;
    friends_service::fetch_friend_library(&api_key, &friend_steam_id).await
}
