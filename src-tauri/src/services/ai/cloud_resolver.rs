use std::sync::OnceLock;

use super::cloud_cache::CloudQueryCache;
use super::cloud_config::CloudConfig;
use super::cloud_provider::CloudProviderApi;
use super::context_builder;
use super::gemini_provider::GeminiProvider;
use super::types::QueryContext;
use crate::models::ai::{CloudProvider, IntentAction, ResolutionTier, ResolvedIntent};
use crate::services::credential_store;
use crate::utils::error::AppError;

fn cache() -> &'static CloudQueryCache {
    static CACHE: OnceLock<CloudQueryCache> = OnceLock::new();
    CACHE.get_or_init(CloudQueryCache::new)
}

pub struct CloudResolver;

impl CloudResolver {
    /// Resolve a query via the cloud AI tier. Returns Ok(None) on any
    /// recoverable failure (graceful degradation).
    pub async fn resolve(
        query: &str,
        ctx: &QueryContext,
        library_summary: &str,
        config: &CloudConfig,
    ) -> Result<Option<ResolvedIntent>, AppError> {
        // 1. Check query cache
        if let Some(cached) = cache().get(query) {
            tracing::debug!("Cloud AI cache hit");
            return Ok(Some(cached));
        }

        // 2. Load API key
        let api_key = match credential_store::load_cloud_key(config.provider.as_str())? {
            Some(key) => key,
            None => {
                tracing::debug!("No cloud AI API key configured");
                return Ok(None);
            }
        };

        // 3. Build messages
        let system_prompt = context_builder::build_system_prompt();
        let action_context = context_builder::build_action_context(ctx);

        let user_message = format!("{library_summary}\n\n{action_context}\n\nUser query: {query}");

        // 4. Call provider
        let provider = get_provider(&config.provider);
        tracing::info!(provider = provider.name(), "Sending cloud AI query");

        let raw_response = match provider
            .send_query(system_prompt, &user_message, &api_key)
            .await
        {
            Ok(text) => text,
            Err(e) => {
                tracing::warn!(error = %e, "Cloud AI request failed");
                // Check for rate limiting
                if let AppError::StoreApi(ref msg) = e {
                    if msg.contains("429") {
                        // Caller should set rate_limited_until on the config
                        return Err(e);
                    }
                }
                return Ok(None);
            }
        };

        // 5. Parse JSON response
        let parsed = match parse_cloud_response(&raw_response) {
            Some(intent) => intent,
            None => {
                tracing::warn!("Failed to parse cloud AI response as valid JSON");
                return Ok(None);
            }
        };

        // 6. Validate action IDs — filter out anything unrecognized
        let valid_actions: Vec<IntentAction> = parsed
            .actions
            .into_iter()
            .filter(|a| is_valid_action_id(&a.action_id))
            .collect();

        if valid_actions.is_empty() {
            tracing::debug!("Cloud AI returned no valid action IDs");
            return Ok(Some(ResolvedIntent {
                actions: vec![],
                tier: ResolutionTier::CloudApi,
                confidence: parsed.confidence.clamp(0.0, 1.0),
                summary: parsed.summary,
                original_query: query.to_string(),
            }));
        }

        let result = ResolvedIntent {
            actions: valid_actions,
            tier: ResolutionTier::CloudApi,
            confidence: parsed.confidence.clamp(0.0, 1.0),
            summary: parsed.summary,
            original_query: query.to_string(),
        };

        // 7. Cache result
        cache().put(query, result.clone());

        Ok(Some(result))
    }
}

/// Get the appropriate provider implementation.
fn get_provider(provider: &CloudProvider) -> Box<dyn CloudProviderApi> {
    match provider {
        CloudProvider::Gemini => Box::new(GeminiProvider),
        // OpenAI and Claude will be added in Phase 12d
        CloudProvider::OpenAi | CloudProvider::Claude => Box::new(GeminiProvider),
    }
}

/// Intermediate struct for parsing the cloud response JSON.
struct ParsedResponse {
    actions: Vec<IntentAction>,
    summary: String,
    confidence: f64,
}

/// Parse the raw JSON text from the cloud provider into actions.
fn parse_cloud_response(text: &str) -> Option<ParsedResponse> {
    let json: serde_json::Value = serde_json::from_str(text).ok()?;

    let actions_arr = json.get("actions")?.as_array()?;
    let mut actions = Vec::new();

    for action_val in actions_arr {
        let action_id = action_val.get("actionId")?.as_str()?;
        let description = action_val
            .get("description")
            .and_then(|d| d.as_str())
            .unwrap_or("")
            .to_string();
        let game_id = action_val
            .get("gameId")
            .and_then(|g| g.as_str())
            .map(|s| s.to_string());

        actions.push(IntentAction {
            action_id: action_id.to_string(),
            game_id,
            description,
        });
    }

    let summary = json
        .get("summary")
        .and_then(|s| s.as_str())
        .unwrap_or("Cloud AI suggestion")
        .to_string();

    let confidence = json
        .get("confidence")
        .and_then(|c| c.as_f64())
        .unwrap_or(0.7);

    Some(ParsedResponse {
        actions,
        summary,
        confidence,
    })
}

/// Validate that an action ID matches a known pattern.
fn is_valid_action_id(id: &str) -> bool {
    id.starts_with("nav:")
        || id.starts_with("sort:")
        || id.starts_with("filter:")
        || id.starts_with("tag-filter:")
        || id.starts_with("theme:")
        || id.starts_with("font:")
        || id.starts_with("icons:")
        || id.starts_with("scale:")
        || id.starts_with("game:")
        || id == "action:reset-filters"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_response() {
        let json = r#"{
            "actions": [
                {"actionId": "sort:playtime", "description": "Sort by playtime"},
                {"actionId": "filter:installed", "description": "Show installed"}
            ],
            "summary": "Sort installed games by playtime",
            "confidence": 0.85
        }"#;
        let parsed = parse_cloud_response(json).unwrap();
        assert_eq!(parsed.actions.len(), 2);
        assert_eq!(parsed.actions[0].action_id, "sort:playtime");
        assert_eq!(parsed.summary, "Sort installed games by playtime");
        assert!((parsed.confidence - 0.85).abs() < f64::EPSILON);
    }

    #[test]
    fn test_parse_empty_actions() {
        let json = r#"{"actions": [], "summary": "No results", "confidence": 0.0}"#;
        let parsed = parse_cloud_response(json).unwrap();
        assert!(parsed.actions.is_empty());
    }

    #[test]
    fn test_parse_invalid_json() {
        assert!(parse_cloud_response("not json").is_none());
    }

    #[test]
    fn test_parse_missing_fields() {
        assert!(parse_cloud_response(r#"{"foo": "bar"}"#).is_none());
    }

    #[test]
    fn test_valid_action_ids() {
        assert!(is_valid_action_id("nav:library"));
        assert!(is_valid_action_id("sort:playtime"));
        assert!(is_valid_action_id("filter:installed"));
        assert!(is_valid_action_id("filter:source:steam"));
        assert!(is_valid_action_id("tag-filter:Single-player"));
        assert!(is_valid_action_id("tag-filter:RPG"));
        assert!(is_valid_action_id("theme:arctic-frost"));
        assert!(is_valid_action_id("font:inter"));
        assert!(is_valid_action_id("icons:minimal"));
        assert!(is_valid_action_id("scale:large"));
        assert!(is_valid_action_id("game:favorite:abc-123"));
        assert!(is_valid_action_id("action:reset-filters"));
    }

    #[test]
    fn test_invalid_action_ids() {
        assert!(!is_valid_action_id("unknown:thing"));
        assert!(!is_valid_action_id(""));
        assert!(!is_valid_action_id("random text"));
        assert!(!is_valid_action_id("action:something-else"));
    }

    #[test]
    fn test_parse_with_game_id() {
        let json = r#"{
            "actions": [{"actionId": "game:launch", "gameId": "abc-123", "description": "Launch game"}],
            "summary": "Launch game",
            "confidence": 0.9
        }"#;
        let parsed = parse_cloud_response(json).unwrap();
        assert_eq!(parsed.actions[0].game_id.as_deref(), Some("abc-123"));
    }
}
