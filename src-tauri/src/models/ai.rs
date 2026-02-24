use serde::{Deserialize, Serialize};

/// Which AI tier resolved the intent.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResolutionTier {
    PatternMatcher,
    CloudApi,
}

/// Supported cloud AI providers.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum CloudProvider {
    #[default]
    Gemini,
    OpenAi,
    Claude,
}

impl CloudProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            CloudProvider::Gemini => "gemini",
            CloudProvider::OpenAi => "openai",
            CloudProvider::Claude => "claude",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "gemini" => Some(CloudProvider::Gemini),
            "openai" => Some(CloudProvider::OpenAi),
            "claude" => Some(CloudProvider::Claude),
            _ => None,
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            CloudProvider::Gemini => "Gemini Flash",
            CloudProvider::OpenAi => "OpenAI",
            CloudProvider::Claude => "Claude",
        }
    }
}

/// A single resolved action the frontend can execute via `executeActionById`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentAction {
    pub action_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_id: Option<String>,
    pub description: String,
}

/// The full result of AI intent resolution, sent to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedIntent {
    pub actions: Vec<IntentAction>,
    pub tier: ResolutionTier,
    pub confidence: f64,
    pub summary: String,
    pub original_query: String,
}

/// Cloud AI usage stats, sent to the frontend for display in Settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudAiUsage {
    pub requests_today: u32,
    pub daily_limit: u32,
    pub provider: String,
    pub last_reset_date: String,
}
