use serde::{Deserialize, Serialize};

/// Our cached game metadata model, converted from the Store API response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreMetadata {
    pub game_id: String,
    pub name: String,
    pub short_description: Option<String>,
    pub header_image_url: Option<String>,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    pub genres: Vec<GenreInfo>,
    pub categories: Vec<CategoryInfo>,
    pub screenshots: Vec<ScreenshotInfo>,
    pub release_date: Option<String>,
    pub metacritic_score: Option<u32>,
    pub metacritic_url: Option<String>,
    pub steam_tags: Vec<SteamTagInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenreInfo {
    pub id: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryInfo {
    pub id: u32,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotInfo {
    pub id: u32,
    pub thumbnail_url: String,
    pub full_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamTagInfo {
    pub name: String,
    pub votes: u32,
}
