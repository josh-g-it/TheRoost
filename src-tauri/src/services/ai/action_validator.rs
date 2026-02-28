use serde::{Deserialize, Serialize};

/// Raw action as received from the AI (via frontend parser).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawAiAction {
    pub action_id: String,
    pub tier: u8,
    pub description: Option<String>,
    pub payload: Option<serde_json::Value>,
}

/// Result of tier validation: the action plus its validated tier.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidatedAction {
    pub action_id: String,
    pub tier: u8,
    pub description: Option<String>,
    pub payload: Option<serde_json::Value>,
}

/// Tier 1 action ID prefixes (auto-execute, read-only or trivially reversible).
const TIER1_PREFIXES: &[&str] = &[
    "nav:",
    "sort:",
    "filter:",
    "genre-filter:",
    "tag-filter:",
    "theme:",
    "font:",
    "icons:",
    "scale:",
    "view:",
    "search:",
    "game:",
];

/// Tier 1 exact action IDs.
const TIER1_EXACT: &[&str] = &["action:reset-filters"];

/// Tier 2 action ID prefixes (confirmation required, data mutations).
const TIER2_PREFIXES: &[&str] = &[
    "favorite:",
    "rate:",
    "review:",
    "note:",
    "shelf-assign:",
    "hide:",
];

/// Tier 2 exact action IDs.
const TIER2_EXACT: &[&str] = &["action:refresh", "action:scan-external"];

/// Tier 3 action ID prefixes (blacklisted — never allowed).
const TIER3_PREFIXES: &[&str] = &[
    "install:",
    "uninstall:",
    "update:",
    "delete:",
    "settings:",
    "dev:",
    "wipe:",
    "export:",
    "filesystem:",
];

/// Classify an action ID into its tier, or None if unknown/blacklisted.
fn classify_action(action_id: &str) -> Option<u8> {
    // Check Tier 3 first (blacklisted — reject immediately)
    for prefix in TIER3_PREFIXES {
        if action_id.starts_with(prefix) {
            return None;
        }
    }

    // Check Tier 1
    for prefix in TIER1_PREFIXES {
        if action_id.starts_with(prefix) {
            return Some(1);
        }
    }
    if TIER1_EXACT.contains(&action_id) {
        return Some(1);
    }

    // Check Tier 2
    for prefix in TIER2_PREFIXES {
        if action_id.starts_with(prefix) {
            return Some(2);
        }
    }
    if TIER2_EXACT.contains(&action_id) {
        return Some(2);
    }

    // Unknown action — reject
    None
}

/// Validate a list of raw actions against the tier whitelist.
/// Returns the validated actions (preserving order) and a count of rejected actions.
pub fn validate_actions(actions: Vec<RawAiAction>) -> (Vec<ValidatedAction>, u32) {
    let mut validated = Vec::new();
    let mut rejected_count = 0u32;

    for action in actions {
        match classify_action(&action.action_id) {
            Some(tier) => {
                validated.push(ValidatedAction {
                    action_id: action.action_id,
                    tier,
                    description: action.description,
                    payload: action.payload,
                });
            }
            None => {
                tracing::warn!(
                    action_id = action.action_id.as_str(),
                    "AI action rejected by validator (blacklisted or unknown)"
                );
                rejected_count += 1;
            }
        }
    }

    (validated, rejected_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_all_tier1_prefix_actions() {
        let prefixes = vec![
            "nav:library",
            "nav:settings",
            "sort:name",
            "sort:playtime",
            "filter:installed",
            "filter:favorites",
            "filter:source:steam",
            "genre-filter:1",
            "tag-filter:RPG",
            "theme:dark-gaming",
            "font:monospace",
            "icons:minimal",
            "scale:compact",
        ];
        for id in prefixes {
            let (valid, rejected) = validate_actions(vec![RawAiAction {
                action_id: id.to_string(),
                tier: 1,
                description: None,
                payload: None,
            }]);
            assert_eq!(valid.len(), 1, "Expected {id} to be valid");
            assert_eq!(valid[0].tier, 1, "Expected {id} to be Tier 1");
            assert_eq!(rejected, 0);
        }
    }

    #[test]
    fn allows_tier1_exact_actions() {
        let (valid, rejected) = validate_actions(vec![RawAiAction {
            action_id: "action:reset-filters".to_string(),
            tier: 1,
            description: None,
            payload: None,
        }]);
        assert_eq!(valid.len(), 1);
        assert_eq!(valid[0].tier, 1);
        assert_eq!(rejected, 0);
    }

    #[test]
    fn allows_new_tier1_actions() {
        let ids = vec!["search:dark souls", "view:grid", "view:list"];
        for id in ids {
            let (valid, rejected) = validate_actions(vec![RawAiAction {
                action_id: id.to_string(),
                tier: 1,
                description: None,
                payload: None,
            }]);
            assert_eq!(valid.len(), 1, "Expected {id} to be valid");
            assert_eq!(valid[0].tier, 1);
            assert_eq!(rejected, 0);
        }
    }

    #[test]
    fn allows_all_tier2_prefix_actions() {
        let prefixes = vec![
            "favorite:Elden Ring",
            "rate:Hades",
            "review:Celeste",
            "note:Dark Souls",
            "shelf-assign:Hollow Knight",
            "hide:Bad Game",
        ];
        for id in prefixes {
            let (valid, rejected) = validate_actions(vec![RawAiAction {
                action_id: id.to_string(),
                tier: 2,
                description: Some("Test".to_string()),
                payload: None,
            }]);
            assert_eq!(valid.len(), 1, "Expected {id} to be valid");
            assert_eq!(valid[0].tier, 2, "Expected {id} to be Tier 2");
            assert_eq!(rejected, 0);
        }
    }

    #[test]
    fn allows_tier2_exact_actions() {
        let ids = vec!["action:refresh", "action:scan-external"];
        for id in ids {
            let (valid, rejected) = validate_actions(vec![RawAiAction {
                action_id: id.to_string(),
                tier: 2,
                description: None,
                payload: None,
            }]);
            assert_eq!(valid.len(), 1, "Expected {id} to be valid");
            assert_eq!(valid[0].tier, 2);
            assert_eq!(rejected, 0);
        }
    }

    #[test]
    fn rejects_all_tier3_prefix_actions() {
        let blocked = vec![
            "install:SomeGame",
            "uninstall:SomeGame",
            "update:SomeGame",
            "delete:SomeGame",
            "settings:apiKey",
            "dev:debug",
            "wipe:all",
            "export:data",
            "filesystem:read",
        ];
        for id in blocked {
            let (valid, rejected) = validate_actions(vec![RawAiAction {
                action_id: id.to_string(),
                tier: 1,
                description: None,
                payload: None,
            }]);
            assert_eq!(valid.len(), 0, "Expected {id} to be rejected");
            assert_eq!(rejected, 1, "Expected {id} to increment rejected count");
        }
    }

    #[test]
    fn rejects_unknown_action_ids() {
        let unknown = vec!["foo:bar", "xyz", "action:unknown", "custom:thing"];
        for id in unknown {
            let (valid, rejected) = validate_actions(vec![RawAiAction {
                action_id: id.to_string(),
                tier: 1,
                description: None,
                payload: None,
            }]);
            assert_eq!(valid.len(), 0, "Expected {id} to be rejected");
            assert_eq!(rejected, 1);
        }
    }

    #[test]
    fn returns_correct_rejected_count() {
        let actions = vec![
            RawAiAction {
                action_id: "nav:library".to_string(),
                tier: 1,
                description: None,
                payload: None,
            },
            RawAiAction {
                action_id: "install:game".to_string(),
                tier: 1,
                description: None,
                payload: None,
            },
            RawAiAction {
                action_id: "sort:name".to_string(),
                tier: 1,
                description: None,
                payload: None,
            },
            RawAiAction {
                action_id: "unknown:action".to_string(),
                tier: 1,
                description: None,
                payload: None,
            },
        ];
        let (valid, rejected) = validate_actions(actions);
        assert_eq!(valid.len(), 2);
        assert_eq!(rejected, 2);
    }

    #[test]
    fn handles_empty_input() {
        let (valid, rejected) = validate_actions(vec![]);
        assert_eq!(valid.len(), 0);
        assert_eq!(rejected, 0);
    }

    #[test]
    fn mixed_valid_invalid_preserves_order() {
        let actions = vec![
            RawAiAction {
                action_id: "nav:library".to_string(),
                tier: 1,
                description: None,
                payload: None,
            },
            RawAiAction {
                action_id: "install:game".to_string(),
                tier: 1,
                description: None,
                payload: None,
            },
            RawAiAction {
                action_id: "favorite:Hades".to_string(),
                tier: 2,
                description: Some("Fav Hades".to_string()),
                payload: None,
            },
            RawAiAction {
                action_id: "delete:all".to_string(),
                tier: 1,
                description: None,
                payload: None,
            },
            RawAiAction {
                action_id: "sort:playtime".to_string(),
                tier: 1,
                description: None,
                payload: None,
            },
        ];
        let (valid, rejected) = validate_actions(actions);
        assert_eq!(valid.len(), 3);
        assert_eq!(rejected, 2);
        // Order preserved
        assert_eq!(valid[0].action_id, "nav:library");
        assert_eq!(valid[1].action_id, "favorite:Hades");
        assert_eq!(valid[2].action_id, "sort:playtime");
    }

    #[test]
    fn validator_overrides_ai_tier_with_whitelist_tier() {
        // AI says tier 1, but favorite: is tier 2 in our whitelist
        let (valid, _) = validate_actions(vec![RawAiAction {
            action_id: "favorite:Hades".to_string(),
            tier: 1, // AI incorrectly says tier 1
            description: None,
            payload: None,
        }]);
        assert_eq!(valid.len(), 1);
        assert_eq!(valid[0].tier, 2); // Validator enforces tier 2
    }

    #[test]
    fn preserves_description_and_payload() {
        let payload = serde_json::json!({"stars": 5, "text": "Amazing"});
        let (valid, _) = validate_actions(vec![RawAiAction {
            action_id: "review:Elden Ring".to_string(),
            tier: 2,
            description: Some("Save your review".to_string()),
            payload: Some(payload.clone()),
        }]);
        assert_eq!(valid.len(), 1);
        assert_eq!(valid[0].description.as_deref(), Some("Save your review"));
        assert_eq!(valid[0].payload, Some(payload));
    }
}
