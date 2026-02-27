pub mod gemini;
pub mod gemini_config;

use super::cloud_provider::CloudProviderApi;

/// Provider factory — returns the appropriate provider by name string.
#[allow(dead_code)]
pub fn get_provider(provider_name: &str) -> Box<dyn CloudProviderApi> {
    match provider_name {
        "gemini" => Box::new(gemini::GeminiProvider),
        _ => Box::new(gemini::GeminiProvider), // fallback
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_provider_gemini() {
        let provider = get_provider("gemini");
        assert_eq!(provider.name(), "Gemini 3 Flash");
    }

    #[test]
    fn test_get_provider_unknown_falls_back_to_gemini() {
        let provider = get_provider("unknown_provider");
        assert_eq!(provider.name(), "Gemini 3 Flash");
    }

    #[test]
    fn test_get_provider_empty_string_falls_back() {
        let provider = get_provider("");
        assert_eq!(provider.name(), "Gemini 3 Flash");
    }
}
