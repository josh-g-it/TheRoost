use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaBookmark {
    pub id: i64,
    pub title: String,
    pub url: String,
    pub icon: Option<String>,
    pub sort_order: i64,
    pub added_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMediaBookmarkRequest {
    pub title: String,
    pub url: String,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMediaBookmarkRequest {
    pub id: i64,
    pub title: String,
    pub url: String,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderMediaBookmarksRequest {
    pub bookmark_ids: Vec<i64>,
}
