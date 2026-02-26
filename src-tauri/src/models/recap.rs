use serde::{Deserialize, Serialize};

/// Full recap data for a monthly or yearly period.
/// Serialized as JSON and stored in the `recaps` SQLite table.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecapData {
    pub version: u32,
    pub period_type: String,
    pub period_key: String,
    pub generated_at: i64,

    // Core stats
    pub total_minutes: u32,
    pub total_sessions: u32,
    pub unique_games_played: u32,
    pub avg_session_minutes: u32,
    pub longest_session_minutes: u32,
    pub longest_session_game_id: String,
    pub longest_session_game_name: String,
    pub longest_streak_days: u32,

    // Game of the Month/Year
    pub top_game: RecapTopGame,

    // Top 5 games
    pub top_games: Vec<RecapTopGame>,

    // Genre breakdown
    pub genre_breakdown: Vec<RecapGenreEntry>,

    // Day of week
    pub busiest_day: RecapBusiestDay,

    // Trends (vs previous period)
    pub prev_period_minutes: u32,

    // New discoveries
    pub new_discoveries: Vec<RecapDiscovery>,

    // Achievement highlights
    pub achievements_unlocked: u32,
    pub notable_achievements: Vec<RecapAchievement>,

    // Fun comparisons (pre-computed)
    pub fun_comparisons: Vec<RecapComparison>,

    // Yearly-only: month-by-month playtime (12 entries, Jan-Dec)
    pub monthly_playtime: Option<Vec<u32>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecapTopGame {
    pub game_id: String,
    pub name: String,
    pub minutes: u32,
    pub sessions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecapGenreEntry {
    pub genre: String,
    pub minutes: u32,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecapBusiestDay {
    pub day: String,
    pub minutes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecapDiscovery {
    pub game_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecapAchievement {
    pub game_name: String,
    pub achievement_name: String,
    pub rarity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecapComparison {
    pub activity: String,
    pub count: f64,
    pub emoji: String,
}

/// Lightweight summary for listing all recaps without full data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecapSummary {
    pub period_key: String,
    pub period_type: String,
    pub generated_at: i64,
    pub total_minutes: u32,
    pub top_game_name: String,
}
