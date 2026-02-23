use serde::{Deserialize, Serialize};

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaytimeSnapshot {
    pub id: i64,
    pub game_id: String,
    pub playtime_minutes: u32,
    pub snapshot_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSession {
    pub id: i64,
    pub game_id: String,
    pub start_time: i64,
    pub end_time: Option<i64>,
    pub duration_minutes: Option<u32>,
}
