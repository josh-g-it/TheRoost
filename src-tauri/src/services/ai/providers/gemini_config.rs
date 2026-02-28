/// Gemini-specific configuration constants.
#[allow(dead_code)]
pub struct GeminiConfig {
    pub model: &'static str,
    pub tts_model: &'static str,
    pub endpoint: &'static str,
    pub max_output_tokens_chat: u32,
    pub max_output_tokens_compact: u32,
    pub temperature_chat: f32,
    pub temperature_compact: f32,
    pub thinking_budget_chat: u32,
}

pub const GEMINI_CONFIG: GeminiConfig = GeminiConfig {
    model: "gemini-3-flash-preview",
    tts_model: "gemini-2.5-flash-tts",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    max_output_tokens_chat: 8192,
    max_output_tokens_compact: 1024,
    temperature_chat: 0.7,
    temperature_compact: 0.3,
    thinking_budget_chat: 512,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_values() {
        assert_eq!(GEMINI_CONFIG.model, "gemini-3-flash-preview");
        assert_eq!(GEMINI_CONFIG.max_output_tokens_chat, 8192);
        assert_eq!(GEMINI_CONFIG.max_output_tokens_compact, 1024);
        assert!((GEMINI_CONFIG.temperature_chat - 0.7).abs() < f32::EPSILON);
        assert!((GEMINI_CONFIG.temperature_compact - 0.3).abs() < f32::EPSILON);
        assert_eq!(GEMINI_CONFIG.thinking_budget_chat, 512);
    }

    #[test]
    fn test_config_endpoint_and_tts_model() {
        assert_eq!(
            GEMINI_CONFIG.endpoint,
            "https://generativelanguage.googleapis.com/v1beta"
        );
        assert_eq!(GEMINI_CONFIG.tts_model, "gemini-2.5-flash-tts");
    }
}
