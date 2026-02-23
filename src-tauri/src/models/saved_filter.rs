use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFilterRow {
    pub id: i64,
    pub name: String,
    pub filter_json: String,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
    pub created_at: i64,
}
