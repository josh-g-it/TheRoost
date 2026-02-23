use serde::Deserialize;

/// Raw response from store.steampowered.com/api/appdetails
/// The API returns `{ "<appid>": { "success": bool, "data": {...} } }`
/// so we parse the outer layer via serde_json::Value in the client.

#[derive(Debug, Deserialize)]
pub struct StoreAppDetailsWrapper {
    pub success: bool,
    pub data: Option<StoreAppData>,
}

#[derive(Debug, Deserialize)]
pub struct StoreAppData {
    pub steam_appid: u32,
    pub name: String,
    pub short_description: Option<String>,
    pub header_image: Option<String>,
    pub developers: Option<Vec<String>>,
    pub publishers: Option<Vec<String>>,
    pub genres: Option<Vec<StoreGenre>>,
    pub categories: Option<Vec<StoreCategory>>,
    pub screenshots: Option<Vec<StoreScreenshot>>,
    pub release_date: Option<StoreReleaseDate>,
    pub metacritic: Option<StoreMetacritic>,
}

#[derive(Debug, Deserialize)]
pub struct StoreGenre {
    pub id: String,
    pub description: String,
}

#[derive(Debug, Deserialize)]
pub struct StoreCategory {
    pub id: u32,
    pub description: String,
}

#[derive(Debug, Deserialize)]
pub struct StoreScreenshot {
    pub id: u32,
    pub path_thumbnail: String,
    pub path_full: String,
}

#[derive(Debug, Deserialize)]
pub struct StoreReleaseDate {
    #[allow(dead_code)]
    pub coming_soon: bool,
    pub date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StoreMetacritic {
    pub score: u32,
    pub url: Option<String>,
}
