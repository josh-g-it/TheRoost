use serde::Serialize;

use super::action_validator::ValidatedAction;

/// A fully resolved action ready for frontend pipeline execution.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedAction {
    /// The resolved action ID (game name replaced with UUID for game-targeting actions).
    pub action_id: String,
    /// The original action ID as the AI generated it (e.g., "favorite:Elden Ring").
    pub original_action_id: String,
    /// Execution tier: 1 = auto-execute, 2 = confirmation required.
    pub tier: u8,
    /// Human-readable description for Tier 2 confirmation cards.
    pub description: Option<String>,
    /// Extra data (review text, star rating, note text, shelf name).
    pub payload: Option<serde_json::Value>,
    /// The resolved display name (e.g., "Elden Ring") for confirmation cards.
    pub resolved_name: Option<String>,
}

/// The result set returned from validation + resolution.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedActionSet {
    pub actions: Vec<ResolvedAction>,
    pub rejected_count: u32,
}

/// Action ID prefixes that target a specific game (require name→UUID resolution).
const GAME_TARGETING_PREFIXES: &[&str] = &[
    "game:",
    "favorite:",
    "rate:",
    "review:",
    "note:",
    "shelf-assign:",
    "hide:",
];

/// Check if an action ID targets a game (needs name resolution).
fn is_game_targeting(action_id: &str) -> bool {
    GAME_TARGETING_PREFIXES
        .iter()
        .any(|prefix| action_id.starts_with(prefix))
}

/// Extract the prefix and game name from a game-targeting action ID.
fn split_action_prefix(action_id: &str) -> Option<(&str, &str)> {
    for prefix in GAME_TARGETING_PREFIXES {
        if let Some(name) = action_id.strip_prefix(prefix) {
            return Some((prefix, name));
        }
    }
    None
}

/// Resolve game-targeting actions by matching game names to UUIDs.
/// Non-game actions pass through unchanged.
pub fn resolve_actions(
    actions: Vec<ValidatedAction>,
    game_library: &[(String, String)], // (game_id, name)
    rejected_count: u32,
) -> ResolvedActionSet {
    let mut resolved = Vec::new();
    let mut total_rejected = rejected_count;

    for action in actions {
        if !is_game_targeting(&action.action_id) {
            // Non-game action — pass through unchanged
            resolved.push(ResolvedAction {
                action_id: action.action_id.clone(),
                original_action_id: action.action_id,
                tier: action.tier,
                description: action.description,
                payload: action.payload,
                resolved_name: None,
            });
            continue;
        }

        // Game-targeting action — resolve name to UUID
        let (prefix, game_name) = match split_action_prefix(&action.action_id) {
            Some(pair) => pair,
            None => {
                total_rejected += 1;
                continue;
            }
        };

        if game_name.is_empty() {
            tracing::warn!(
                action_id = action.action_id.as_str(),
                "Game-targeting action has empty game name"
            );
            total_rejected += 1;
            continue;
        }

        match resolve_game_name(game_name, game_library) {
            Some((game_id, resolved_name)) => {
                resolved.push(ResolvedAction {
                    action_id: format!("{prefix}{game_id}"),
                    original_action_id: action.action_id,
                    tier: action.tier,
                    description: action.description,
                    payload: action.payload,
                    resolved_name: Some(resolved_name),
                });
            }
            None => {
                tracing::warn!(
                    action_id = action.action_id.as_str(),
                    game_name,
                    "Failed to resolve game name to UUID"
                );
                total_rejected += 1;
            }
        }
    }

    ResolvedActionSet {
        actions: resolved,
        rejected_count: total_rejected,
    }
}

/// Resolve a game name to a (game_id, canonical_name) pair.
/// Uses exact match first, then Jaro-Winkler fuzzy match (0.85+ threshold).
/// Rejects ambiguous matches (top two within 0.05 similarity).
fn resolve_game_name(query: &str, library: &[(String, String)]) -> Option<(String, String)> {
    if library.is_empty() {
        return None;
    }

    let query_lower = query.to_lowercase();

    // Exact match first (case-insensitive)
    for (id, name) in library {
        if name.to_lowercase() == query_lower {
            return Some((id.clone(), name.clone()));
        }
    }

    // Fuzzy match with Jaro-Winkler
    let mut best_score = 0.0f64;
    let mut best_match: Option<(&str, &str)> = None;
    let mut second_best_score = 0.0f64;

    for (id, name) in library {
        let score = jaro_winkler_similarity(&query_lower, &name.to_lowercase());
        if score > best_score {
            second_best_score = best_score;
            best_score = score;
            best_match = Some((id.as_str(), name.as_str()));
        } else if score > second_best_score {
            second_best_score = score;
        }
    }

    // Threshold check
    if best_score < 0.85 {
        return None;
    }

    // Ambiguity check — top two within 0.05
    if best_score - second_best_score < 0.05 {
        tracing::warn!(
            query,
            best_score,
            second_best_score,
            "Ambiguous game name match — top two within 0.05"
        );
        return None;
    }

    best_match.map(|(id, name)| (id.to_string(), name.to_string()))
}

// ── Jaro-Winkler Implementation ─────────────────────────────────────

/// Compute the Jaro similarity between two strings.
fn jaro_similarity(s1: &str, s2: &str) -> f64 {
    let s1_chars: Vec<char> = s1.chars().collect();
    let s2_chars: Vec<char> = s2.chars().collect();
    let len1 = s1_chars.len();
    let len2 = s2_chars.len();

    if len1 == 0 && len2 == 0 {
        return 1.0;
    }
    if len1 == 0 || len2 == 0 {
        return 0.0;
    }

    let match_distance = (len1.max(len2) / 2).saturating_sub(1);

    let mut s1_matched = vec![false; len1];
    let mut s2_matched = vec![false; len2];
    let mut matches = 0usize;

    // Find matching characters
    for i in 0..len1 {
        let start = i.saturating_sub(match_distance);
        let end = (i + match_distance + 1).min(len2);

        for j in start..end {
            if s2_matched[j] || s1_chars[i] != s2_chars[j] {
                continue;
            }
            s1_matched[i] = true;
            s2_matched[j] = true;
            matches += 1;
            break;
        }
    }

    if matches == 0 {
        return 0.0;
    }

    // Count transpositions
    let mut transpositions = 0usize;
    let mut k = 0;
    for i in 0..len1 {
        if !s1_matched[i] {
            continue;
        }
        while !s2_matched[k] {
            k += 1;
        }
        if s1_chars[i] != s2_chars[k] {
            transpositions += 1;
        }
        k += 1;
    }

    let m = matches as f64;
    let t = transpositions as f64 / 2.0;

    (m / len1 as f64 + m / len2 as f64 + (m - t) / m) / 3.0
}

/// Compute the Jaro-Winkler similarity between two strings.
/// Returns a value between 0.0 (no similarity) and 1.0 (identical).
fn jaro_winkler_similarity(s1: &str, s2: &str) -> f64 {
    let jaro = jaro_similarity(s1, s2);

    // Common prefix length (max 4 chars)
    let prefix_len = s1
        .chars()
        .zip(s2.chars())
        .take(4)
        .take_while(|(a, b)| a == b)
        .count();

    let p = 0.1; // Winkler scaling factor
    jaro + prefix_len as f64 * p * (1.0 - jaro)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_library() -> Vec<(String, String)> {
        vec![
            ("uuid-1".to_string(), "Elden Ring".to_string()),
            ("uuid-2".to_string(), "Hades".to_string()),
            ("uuid-3".to_string(), "Celeste".to_string()),
            ("uuid-4".to_string(), "Dark Souls III".to_string()),
            ("uuid-5".to_string(), "Hollow Knight".to_string()),
        ]
    }

    fn make_validated(action_id: &str, tier: u8) -> ValidatedAction {
        ValidatedAction {
            action_id: action_id.to_string(),
            tier,
            description: None,
            payload: None,
        }
    }

    // ── Jaro-Winkler unit tests ──────────────────────────────────────

    #[test]
    fn jw_identical_strings() {
        let score = jaro_winkler_similarity("elden ring", "elden ring");
        assert!((score - 1.0).abs() < 0.001);
    }

    #[test]
    fn jw_completely_different() {
        let score = jaro_winkler_similarity("abcdef", "zyxwvu");
        assert!(score < 0.5);
    }

    #[test]
    fn jw_empty_strings() {
        assert!((jaro_winkler_similarity("", "") - 1.0).abs() < 0.001);
        assert!(jaro_winkler_similarity("abc", "").abs() < 0.001);
        assert!(jaro_winkler_similarity("", "abc").abs() < 0.001);
    }

    #[test]
    fn jw_similar_strings_above_threshold() {
        // "elden ring" vs "elden rings" — very similar
        let score = jaro_winkler_similarity("elden ring", "elden rings");
        assert!(score >= 0.85, "score was {score}");
    }

    #[test]
    fn jw_dissimilar_strings_below_threshold() {
        let score = jaro_winkler_similarity("elden ring", "celeste");
        assert!(score < 0.85, "score was {score}");
    }

    // ── Resolver tests ───────────────────────────────────────────────

    #[test]
    fn exact_match_resolves_to_correct_uuid_case_insensitive() {
        let library = make_library();
        let result = resolve_game_name("elden ring", &library);
        assert!(result.is_some());
        let (id, name) = result.unwrap();
        assert_eq!(id, "uuid-1");
        assert_eq!(name, "Elden Ring");
    }

    #[test]
    fn exact_match_mixed_case() {
        let library = make_library();
        let result = resolve_game_name("HADES", &library);
        assert!(result.is_some());
        let (id, name) = result.unwrap();
        assert_eq!(id, "uuid-2");
        assert_eq!(name, "Hades");
    }

    #[test]
    fn fuzzy_match_resolves_above_threshold() {
        let library = make_library();
        // "Elden Rings" is close to "Elden Ring"
        let result = resolve_game_name("Elden Rings", &library);
        assert!(result.is_some());
        let (id, _) = result.unwrap();
        assert_eq!(id, "uuid-1");
    }

    #[test]
    fn fuzzy_match_rejects_below_threshold() {
        let library = make_library();
        let result = resolve_game_name("Totally Different Game", &library);
        assert!(result.is_none());
    }

    #[test]
    fn ambiguous_match_rejected() {
        // Create a library with two very similar names
        let library = vec![
            ("uuid-a".to_string(), "Dark Souls".to_string()),
            ("uuid-b".to_string(), "Dark Soul".to_string()),
        ];
        // "Dark Soull" is ambiguous between "Dark Souls" and "Dark Soul"
        let result = resolve_game_name("Dark Soull", &library);
        assert!(result.is_none(), "Ambiguous match should be rejected");
    }

    #[test]
    fn non_game_actions_pass_through_unchanged() {
        let library = make_library();
        let actions = vec![
            make_validated("nav:library", 1),
            make_validated("sort:playtime", 1),
            make_validated("filter:installed", 1),
            make_validated("theme:dark-gaming", 1),
            make_validated("action:reset-filters", 1),
        ];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 5);
        assert_eq!(result.rejected_count, 0);
        for action in &result.actions {
            assert_eq!(action.action_id, action.original_action_id);
            assert!(action.resolved_name.is_none());
        }
    }

    #[test]
    fn game_targeting_actions_get_uuid_and_resolved_name() {
        let library = make_library();
        let actions = vec![ValidatedAction {
            action_id: "favorite:Elden Ring".to_string(),
            tier: 2,
            description: Some("Add to favorites".to_string()),
            payload: None,
        }];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 1);
        assert_eq!(result.actions[0].action_id, "favorite:uuid-1");
        assert_eq!(result.actions[0].original_action_id, "favorite:Elden Ring");
        assert_eq!(
            result.actions[0].resolved_name.as_deref(),
            Some("Elden Ring")
        );
    }

    #[test]
    fn game_targeting_actions_with_unknown_names_are_rejected() {
        let library = make_library();
        let actions = vec![make_validated("favorite:Nonexistent Game XYZ", 2)];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 0);
        assert_eq!(result.rejected_count, 1);
    }

    #[test]
    fn preserves_payload_field_through_resolution() {
        let library = make_library();
        let payload = serde_json::json!({"stars": 5, "text": "Masterpiece"});
        let actions = vec![ValidatedAction {
            action_id: "review:Elden Ring".to_string(),
            tier: 2,
            description: Some("Save review".to_string()),
            payload: Some(payload.clone()),
        }];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 1);
        assert_eq!(result.actions[0].payload, Some(payload));
    }

    #[test]
    fn preserves_description_field_through_resolution() {
        let library = make_library();
        let actions = vec![ValidatedAction {
            action_id: "favorite:Hades".to_string(),
            tier: 2,
            description: Some("Toggle favorite for Hades".to_string()),
            payload: None,
        }];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 1);
        assert_eq!(
            result.actions[0].description.as_deref(),
            Some("Toggle favorite for Hades")
        );
    }

    #[test]
    fn handles_empty_library() {
        let library: Vec<(String, String)> = vec![];
        let actions = vec![
            make_validated("favorite:Elden Ring", 2),
            make_validated("game:Hades", 1),
        ];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 0);
        assert_eq!(result.rejected_count, 2);
    }

    #[test]
    fn accumulates_rejected_count_from_validator() {
        let library = make_library();
        // Start with 2 rejected from validator, add 1 more from failed resolution
        let actions = vec![make_validated("favorite:Nonexistent Game", 2)];
        let result = resolve_actions(actions, &library, 2);
        assert_eq!(result.actions.len(), 0);
        assert_eq!(result.rejected_count, 3); // 2 from validator + 1 from failed resolution
    }

    #[test]
    fn game_prefix_action_resolves() {
        let library = make_library();
        let actions = vec![make_validated("game:Celeste", 1)];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 1);
        assert_eq!(result.actions[0].action_id, "game:uuid-3");
        assert_eq!(result.actions[0].resolved_name.as_deref(), Some("Celeste"));
    }

    #[test]
    fn mixed_game_and_non_game_actions() {
        let library = make_library();
        let actions = vec![
            make_validated("nav:library", 1),
            make_validated("favorite:Hades", 2),
            make_validated("sort:playtime", 1),
            make_validated("game:Celeste", 1),
        ];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 4);
        assert_eq!(result.rejected_count, 0);
        // Non-game actions pass through
        assert_eq!(result.actions[0].action_id, "nav:library");
        assert!(result.actions[0].resolved_name.is_none());
        // Game-targeting actions resolved
        assert_eq!(result.actions[1].action_id, "favorite:uuid-2");
        assert_eq!(result.actions[1].resolved_name.as_deref(), Some("Hades"));
        assert_eq!(result.actions[2].action_id, "sort:playtime");
        assert_eq!(result.actions[3].action_id, "game:uuid-3");
    }
}
