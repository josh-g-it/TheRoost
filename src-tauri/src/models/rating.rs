use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameRating {
    pub game_id: String,
    /// Rating stored as integer 1-10 (maps to 0.5 to 5.0 stars)
    pub rating: u8,
    pub review: Option<String>,
    pub updated_at: i64,
}
