use serde::{Deserialize, Serialize};

// ── GetNewsForApp/v2 response ──────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct NewsResponse {
    pub appnews: NewsData,
}

#[derive(Debug, Deserialize)]
pub struct NewsData {
    pub newsitems: Vec<ApiNewsItem>,
}

#[derive(Debug, Deserialize)]
pub struct ApiNewsItem {
    pub gid: String,
    pub title: String,
    pub url: String,
    pub author: String,
    pub contents: String,
    pub date: u64,
    pub feedlabel: String,
}

// ── Output struct (sent to frontend) ───────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameNewsItem {
    pub news_id: String,
    pub game_id: String,
    pub title: String,
    pub url: String,
    pub author: String,
    pub contents: String,
    pub date: u64,
    pub feed_label: String,
}

// ── GetGamesFollowed/v1 response ───────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct FollowedGamesResponse {
    pub response: FollowedGamesData,
}

#[derive(Debug, Deserialize)]
pub struct FollowedGamesData {
    pub games: Option<Vec<FollowedGame>>,
}

#[derive(Debug, Deserialize)]
pub struct FollowedGame {
    pub appid: u32,
}
