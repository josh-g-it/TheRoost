use serde::Serialize;

/// A structured log event sent to the frontend debug panel.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEvent {
    pub id: String,
    pub timestamp: String,
    pub level: String,
    pub source: String,
    pub category: String,
    pub message: String,
    pub origin: String,
    pub metadata: Option<serde_json::Value>,
}

impl LogEvent {
    pub fn new(
        level: &str,
        source: &str,
        category: &str,
        message: &str,
        metadata: Option<serde_json::Value>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            level: level.to_string(),
            source: source.to_string(),
            category: category.to_string(),
            message: message.to_string(),
            origin: "rust".to_string(),
            metadata,
        }
    }
}
