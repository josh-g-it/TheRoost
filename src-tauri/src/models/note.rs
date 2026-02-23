use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameNote {
    pub game_id: String,
    pub content: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameNoteWithName {
    pub game_id: String,
    pub content: String,
    pub updated_at: i64,
    pub game_name: Option<String>,
}
