use serde::{Deserialize, Serialize};

fn default_grid_size() -> String {
    "medium".to_string()
}
fn default_list_density() -> String {
    "default".to_string()
}
fn default_command_center_shortcut() -> String {
    "Ctrl+Space".to_string()
}
fn default_rail_mode() -> String {
    "dynamic".to_string()
}
fn default_icon_set() -> String {
    "default".to_string()
}
fn default_font_family() -> String {
    "system".to_string()
}
fn default_ui_scale() -> String {
    "comfortable".to_string()
}
fn default_minimize_to_tray() -> bool {
    true
}
fn default_true() -> bool {
    true
}
fn default_media_controls_mode() -> String {
    "dynamic".to_string()
}
fn default_cloud_ai_provider() -> String {
    "gemini".to_string()
}
fn default_cloud_ai_context_scope() -> String {
    "all".to_string()
}
fn default_cloud_ai_daily_limit() -> u32 {
    100
}
fn default_ai_max_tokens_main() -> u32 {
    8192
}
fn default_ai_max_tokens_overlay() -> u32 {
    2048
}
fn default_command_center_slots() -> Vec<String> {
    vec![
        "nav:library".to_string(),
        "nav:activity".to_string(),
        "nav:profile".to_string(),
        "action:theme-picker".to_string(),
        "action:random-game".to_string(),
        "action:quick-stats".to_string(),
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardDisplayOptions {
    pub show_genre_tags: bool,
    pub show_playtime: bool,
    pub show_installed_badge: bool,
    pub show_tags: bool,
    #[serde(default = "default_grid_size")]
    pub grid_size: String,
    #[serde(default = "default_list_density")]
    pub list_density: String,
    #[serde(default)]
    pub list_columns: Vec<serde_json::Value>,
}

impl Default for CardDisplayOptions {
    fn default() -> Self {
        Self {
            show_genre_tags: true,
            show_playtime: true,
            show_installed_badge: true,
            show_tags: true,
            grid_size: default_grid_size(),
            list_density: default_list_density(),
            list_columns: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileChartOptions {
    pub genre_radar_count: u32,
    pub playtime_buckets: String,
    pub leaderboard_top_n: u32,
}

impl Default for ProfileChartOptions {
    fn default() -> Self {
        Self {
            genre_radar_count: 8,
            playtime_buckets: "default".to_string(),
            leaderboard_top_n: 10,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub steam_api_key: Option<String>,
    pub steam_id: Option<String>,
    pub is_first_run: bool,
    pub theme: String,
    #[serde(default = "default_icon_set")]
    pub icon_set: String,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_ui_scale")]
    pub ui_scale: String,
    #[serde(default)]
    pub card_display: CardDisplayOptions,
    #[serde(default)]
    pub profile_chart_options: ProfileChartOptions,
    #[serde(default = "default_command_center_slots")]
    pub command_center_slots: Vec<String>,
    #[serde(default = "default_command_center_shortcut")]
    pub command_center_shortcut: String,
    #[serde(default = "default_rail_mode")]
    pub rail_mode: String,
    #[serde(default)]
    pub shelves: Vec<serde_json::Value>,
    #[serde(default = "default_minimize_to_tray")]
    pub minimize_to_tray: bool,
    #[serde(default)]
    pub dev_settings_enabled: bool,
    #[serde(default)]
    pub activity_layout: Vec<serde_json::Value>,
    #[serde(default)]
    pub has_seen_welcome: bool,
    #[serde(default)]
    pub overlay_panel_positions: serde_json::Value,
    #[serde(default = "default_media_controls_mode")]
    pub media_controls_mode: String,
    #[serde(default)]
    pub cloud_ai_enabled: bool,
    #[serde(default = "default_cloud_ai_provider")]
    pub cloud_ai_provider: String,
    #[serde(default = "default_cloud_ai_daily_limit")]
    pub cloud_ai_daily_limit: u32,
    #[serde(default)]
    pub cloud_ai_privacy_acknowledged: bool,
    #[serde(default = "default_cloud_ai_context_scope")]
    pub cloud_ai_context_scope: String,
    #[serde(default)]
    pub cloud_ai_excluded_games: Vec<String>,
    #[serde(default)]
    pub cloud_ai_included_games: Vec<String>,
    #[serde(default)]
    pub ai_post_session_review_enabled: bool,
    #[serde(default = "default_true")]
    pub ai_conversation_auto_end_enabled: bool,
    #[serde(default = "default_ai_max_tokens_main")]
    pub ai_max_tokens_main: u32,
    #[serde(default = "default_ai_max_tokens_overlay")]
    pub ai_max_tokens_overlay: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            steam_api_key: None,
            steam_id: None,
            is_first_run: true,
            theme: "dark-gaming".to_string(),
            icon_set: default_icon_set(),
            font_family: default_font_family(),
            ui_scale: default_ui_scale(),
            card_display: CardDisplayOptions::default(),
            profile_chart_options: ProfileChartOptions::default(),
            command_center_slots: default_command_center_slots(),
            command_center_shortcut: default_command_center_shortcut(),
            rail_mode: default_rail_mode(),
            shelves: Vec::new(),
            minimize_to_tray: default_minimize_to_tray(),
            dev_settings_enabled: false,
            activity_layout: Vec::new(),
            has_seen_welcome: false,
            overlay_panel_positions: serde_json::Value::default(),
            media_controls_mode: default_media_controls_mode(),
            cloud_ai_enabled: false,
            cloud_ai_provider: default_cloud_ai_provider(),
            cloud_ai_daily_limit: default_cloud_ai_daily_limit(),
            cloud_ai_privacy_acknowledged: false,
            cloud_ai_context_scope: default_cloud_ai_context_scope(),
            cloud_ai_excluded_games: Vec::new(),
            cloud_ai_included_games: Vec::new(),
            ai_post_session_review_enabled: false,
            ai_conversation_auto_end_enabled: true,
            ai_max_tokens_main: default_ai_max_tokens_main(),
            ai_max_tokens_overlay: default_ai_max_tokens_overlay(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ai_conversation_auto_end_enabled_defaults_to_true() {
        // JSON with the field missing should default to true
        let json = r#"{"steamApiKey":null,"steamId":null,"isFirstRun":true,"theme":"dark-gaming"}"#;
        let settings: AppSettings = serde_json::from_str(json).unwrap();
        assert!(settings.ai_conversation_auto_end_enabled);
    }

    #[test]
    fn ai_conversation_auto_end_enabled_deserializes_false() {
        let json = r#"{"steamApiKey":null,"steamId":null,"isFirstRun":true,"theme":"dark-gaming","aiConversationAutoEndEnabled":false}"#;
        let settings: AppSettings = serde_json::from_str(json).unwrap();
        assert!(!settings.ai_conversation_auto_end_enabled);
    }
}
