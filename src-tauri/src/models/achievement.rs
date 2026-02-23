use serde::{Deserialize, Serialize};

// ── GetPlayerAchievements/v1 response ──────────────────────────────

#[derive(Debug, Deserialize)]
pub struct AchievementsResponse {
    pub playerstats: AchievementsData,
}

#[derive(Debug, Deserialize)]
pub struct AchievementsData {
    pub success: Option<bool>,
    pub achievements: Option<Vec<ApiAchievement>>,
}

#[derive(Debug, Deserialize)]
pub struct ApiAchievement {
    pub apiname: String,
    pub achieved: u32,
    pub unlocktime: Option<u64>,
}

// ── GetSchemaForGame/v2 response ───────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct SchemaResponse {
    pub game: SchemaData,
}

#[derive(Debug, Deserialize)]
pub struct SchemaData {
    #[serde(rename = "availableGameStats")]
    pub available_game_stats: Option<SchemaStats>,
}

#[derive(Debug, Deserialize)]
pub struct SchemaStats {
    pub achievements: Option<Vec<SchemaAchievement>>,
}

#[derive(Debug, Deserialize)]
pub struct SchemaAchievement {
    pub name: String,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub icongray: Option<String>,
    pub hidden: Option<u32>,
}

// ── GetGlobalAchievementPercentagesForApp/v2 response ──────────────

#[derive(Debug, Deserialize)]
pub struct GlobalPercentResponse {
    pub achievementpercentages: GlobalPercentData,
}

#[derive(Debug, Deserialize)]
pub struct GlobalPercentData {
    pub achievements: Vec<GlobalPercent>,
}

#[derive(Debug, Deserialize)]
pub struct GlobalPercent {
    pub name: String,
    pub percent: f64,
}

// ── Merged output (sent to frontend) ───────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAchievement {
    pub api_name: String,
    pub display_name: String,
    pub description: Option<String>,
    pub icon_url: Option<String>,
    pub icon_gray_url: Option<String>,
    pub hidden: bool,
    pub achieved: bool,
    pub unlock_time: Option<u64>,
    pub global_percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAchievementSummary {
    pub game_id: String,
    pub total: u32,
    pub unlocked: u32,
    pub achievements: Vec<GameAchievement>,
}
