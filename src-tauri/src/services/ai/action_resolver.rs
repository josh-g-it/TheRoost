//! Action resolver — pure function module for fuzzy-matching game names to UUIDs.
//!
//! # Lock-free contract
//!
//! This module intentionally has **no database dependency**. All game data must
//! be pre-loaded into a `Vec<(String, String)>` by the caller *before* invoking
//! any function here. This ensures fuzzy matching (Jaro-Winkler over the full
//! library) runs entirely outside any Mutex lock scope, preventing lock
//! contention, poisoning, or deadlock under concurrent AI requests.
//!
//! Callers must follow this pattern:
//! 1. Acquire the DB lock
//! 2. Load game names into a local `Vec<(String, String)>`
//! 3. Release the DB lock
//! 4. Call `resolve_actions()` with the pre-loaded data
//!
//! See `commands::ai::validate_and_resolve_ai_actions` for the canonical example.

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
///
/// # Lock-free design
///
/// `game_library` must be a pre-loaded snapshot of `(game_id, name)` pairs,
/// fetched from the database and released before calling this function.
/// All fuzzy matching (Jaro-Winkler) runs on this local snapshot with no
/// lock held, so it is safe to call from concurrent tasks without risk of
/// lock contention or poisoning.
pub fn resolve_actions(
    actions: Vec<ValidatedAction>,
    game_library: &[(String, String)], // (game_id, name) — pre-loaded, no lock held
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
/// Strategy: exact match → prefix match → substring containment → Jaro-Winkler fuzzy (0.82+).
/// Rejects ambiguous matches (top two within 0.05 similarity).
fn resolve_game_name(query: &str, library: &[(String, String)]) -> Option<(String, String)> {
    if library.is_empty() {
        return None;
    }

    let query_lower = query.to_lowercase();

    // 1. Exact match (case-insensitive)
    for (id, name) in library {
        if name.to_lowercase() == query_lower {
            return Some((id.clone(), name.clone()));
        }
    }

    // 2. Prefix match — handles series names like "Dark Souls" → "Dark Souls III"
    //    If query is a prefix of exactly one game name (and covers most of the name),
    //    accept it. Requires the query to be at least 60% of the full name length.
    let prefix_matches: Vec<_> = library
        .iter()
        .filter(|(_, name)| {
            let name_lower = name.to_lowercase();
            name_lower.starts_with(&query_lower) && query_lower.len() >= (name_lower.len() * 3 / 5)
        })
        .collect();
    if prefix_matches.len() == 1 {
        return Some((prefix_matches[0].0.clone(), prefix_matches[0].1.clone()));
    }

    // 3. Substring containment — handles abbreviated names like "Skyrim" →
    //    "The Elder Scrolls V: Skyrim". Mirrors the pattern_matcher's find_game()
    //    strategy. Requires ≥4 chars to avoid overly broad matches.
    if query_lower.len() >= 4 {
        let substring_matches: Vec<_> = library
            .iter()
            .filter(|(_, name)| name.to_lowercase().contains(&query_lower))
            .collect();
        if substring_matches.len() == 1 {
            return Some((
                substring_matches[0].0.clone(),
                substring_matches[0].1.clone(),
            ));
        }
        if substring_matches.len() > 1 {
            // Multiple matches — prefer the shortest name (most specific).
            // e.g., "Skyrim" matches 3 variants; shortest is the base game.
            let shortest = substring_matches
                .iter()
                .min_by_key(|(_, name)| name.len());
            if let Some((id, name)) = shortest {
                return Some((id.to_string(), name.to_string()));
            }
        }
    }

    // 4. Fuzzy match with Jaro-Winkler
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

    // Lower threshold from 0.85 to 0.82 — covers more natural abbreviations
    // while still rejecting clearly different game names
    if best_score < 0.82 {
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
    fn prefix_match_resolves_series_name() {
        let library = vec![
            ("uuid-1".to_string(), "Dark Souls III".to_string()),
            ("uuid-2".to_string(), "Celeste".to_string()),
        ];
        // "Dark Souls" is a prefix of "Dark Souls III" and covers >60% of the length
        let result = resolve_game_name("Dark Souls", &library);
        assert!(result.is_some());
        let (id, _) = result.unwrap();
        assert_eq!(id, "uuid-1");
    }

    #[test]
    fn prefix_match_rejects_too_short_prefix() {
        let library = vec![(
            "uuid-1".to_string(),
            "The Elder Scrolls V: Skyrim".to_string(),
        )];
        // "The" is way too short a prefix
        let result = resolve_game_name("The", &library);
        assert!(result.is_none());
    }

    #[test]
    fn prefix_match_rejects_ambiguous_series() {
        let library = vec![
            ("uuid-1".to_string(), "Dark Souls".to_string()),
            ("uuid-2".to_string(), "Dark Souls II".to_string()),
            ("uuid-3".to_string(), "Dark Souls III".to_string()),
        ];
        // "Dark Souls" matches exactly, so exact match should win
        let result = resolve_game_name("Dark Souls", &library);
        assert!(result.is_some());
        assert_eq!(result.unwrap().0, "uuid-1");
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

    // ── Empty game name ─────────────────────────────────────────────

    #[test]
    fn test_empty_game_name_rejected() {
        let library = make_library();
        let actions = vec![make_validated("favorite:", 2)];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 0);
        assert_eq!(result.rejected_count, 1);
    }

    // ── Special characters in game names ────────────────────────────

    #[test]
    fn test_special_chars_in_game_name() {
        let library = vec![
            (
                "uuid-tc".to_string(),
                "Tom Clancy's Rainbow Six: Siege".to_string(),
            ),
            ("uuid-doom".to_string(), "DOOM (2016)".to_string()),
        ];
        // Exact match with apostrophe, colon, parentheses
        let actions = vec![
            make_validated("game:Tom Clancy's Rainbow Six: Siege", 1),
            make_validated("favorite:DOOM (2016)", 2),
        ];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 2);
        assert_eq!(result.rejected_count, 0);
        assert_eq!(result.actions[0].action_id, "game:uuid-tc");
        assert_eq!(
            result.actions[0].resolved_name.as_deref(),
            Some("Tom Clancy's Rainbow Six: Siege")
        );
        assert_eq!(result.actions[1].action_id, "favorite:uuid-doom");
        assert_eq!(
            result.actions[1].resolved_name.as_deref(),
            Some("DOOM (2016)")
        );
    }

    #[test]
    fn test_unicode_game_name() {
        let library = vec![(
            "uuid-nier".to_string(),
            "Nier: Automata\u{2122}".to_string(), // ™ symbol
        )];
        let actions = vec![make_validated("game:Nier: Automata\u{2122}", 1)];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 1);
        assert_eq!(result.rejected_count, 0);
        assert_eq!(result.actions[0].action_id, "game:uuid-nier");
        assert_eq!(
            result.actions[0].resolved_name.as_deref(),
            Some("Nier: Automata\u{2122}")
        );
    }

    // ── Threshold boundary tests (0.82) ─────────────────────────────

    #[test]
    fn test_fuzzy_match_at_threshold_boundary() {
        // "ori" vs "ore" scores ~0.822 JW — just barely above 0.82 threshold
        let library = vec![("uuid-ore".to_string(), "Ore".to_string())];
        let actions = vec![make_validated("game:Ori", 1)];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(
            result.actions.len(),
            1,
            "Score just above 0.82 should resolve"
        );
        assert_eq!(result.actions[0].action_id, "game:uuid-ore");

        // Verify the raw JW score is indeed just above 0.82
        let score = jaro_winkler_similarity("ori", "ore");
        assert!(
            score >= 0.82 && score < 0.83,
            "Expected score near 0.82 boundary, got {score}"
        );
    }

    #[test]
    fn test_fuzzy_match_slightly_below_threshold() {
        // "celeste" vs "calesto" scores ~0.769 JW — below 0.82 threshold
        let library = vec![("uuid-x".to_string(), "Calesto".to_string())];
        let actions = vec![make_validated("game:Celeste", 1)];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(
            result.actions.len(),
            0,
            "Score below 0.82 should be rejected"
        );
        assert_eq!(result.rejected_count, 1);

        // Verify the raw JW score is indeed below 0.82
        let score = jaro_winkler_similarity("celeste", "calesto");
        assert!(score < 0.82, "Expected score below 0.82, got {score}");
    }

    // ── No-match fallback ───────────────────────────────────────────

    #[test]
    fn test_no_match_returns_none_for_completely_unrelated() {
        let library = make_library();
        // "Minecraft" has no close match in the default library
        let actions = vec![make_validated("game:Minecraft", 1)];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 0);
        assert_eq!(result.rejected_count, 1);
    }

    #[test]
    fn test_all_game_prefixes_resolve() {
        let library = make_library();
        let prefixes = [
            "game:",
            "favorite:",
            "rate:",
            "review:",
            "note:",
            "shelf-assign:",
            "hide:",
        ];
        let actions: Vec<ValidatedAction> = prefixes
            .iter()
            .map(|prefix| make_validated(&format!("{prefix}Elden Ring"), 2))
            .collect();
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(
            result.actions.len(),
            prefixes.len(),
            "All game-targeting prefixes should resolve"
        );
        assert_eq!(result.rejected_count, 0);
        for (i, action) in result.actions.iter().enumerate() {
            assert_eq!(
                action.action_id,
                format!("{}uuid-1", prefixes[i]),
                "Prefix '{}' should resolve to uuid-1",
                prefixes[i]
            );
            assert_eq!(action.resolved_name.as_deref(), Some("Elden Ring"));
        }
    }

    // ── Prefix match edge cases ─────────────────────────────────────

    #[test]
    fn test_prefix_ambiguous_falls_through_to_substring() {
        // Library with "Dark Souls II" and "Dark Souls III" but no exact "Dark Souls"
        let library = vec![
            ("uuid-ds2".to_string(), "Dark Souls II".to_string()),
            ("uuid-ds3".to_string(), "Dark Souls III".to_string()),
        ];
        // "Dark Souls" is a prefix of both → prefix match skipped (ambiguous).
        // Substring match finds both → picks shortest ("Dark Souls II").
        let actions = vec![make_validated("game:Dark Souls", 1)];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 1, "Substring should pick shortest");
        assert_eq!(result.actions[0].action_id, "game:uuid-ds2");
        assert_eq!(
            result.actions[0].resolved_name.as_deref(),
            Some("Dark Souls II")
        );
    }

    #[test]
    fn test_substring_match_partial_word_in_long_title() {
        let library = vec![(
            "uuid-skyrim".to_string(),
            "The Elder Scrolls V: Skyrim".to_string(),
        )];
        // "Elder" (5 chars, ≥4 min) is a substring of the title → matches via substring tier.
        let actions = vec![make_validated("game:Elder", 1)];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 1, "Substring should match");
        assert_eq!(result.actions[0].action_id, "game:uuid-skyrim");
    }

    // ── Substring containment tier tests ──────────────────────────

    #[test]
    fn test_substring_match_skyrim_base_game() {
        // "Skyrim" appears in all 3 variants; shortest name (base game) wins
        let library = vec![
            (
                "uuid-skyrim".to_string(),
                "The Elder Scrolls V: Skyrim".to_string(),
            ),
            (
                "uuid-skyrim-se".to_string(),
                "The Elder Scrolls V: Skyrim Special Edition".to_string(),
            ),
            (
                "uuid-skyrim-vr".to_string(),
                "The Elder Scrolls V: Skyrim VR".to_string(),
            ),
        ];
        let result = resolve_game_name("Skyrim", &library);
        assert!(result.is_some(), "Substring match should find Skyrim");
        let (id, name) = result.unwrap();
        assert_eq!(id, "uuid-skyrim");
        assert_eq!(name, "The Elder Scrolls V: Skyrim");
    }

    #[test]
    fn test_substring_match_specific_variant() {
        let library = vec![
            (
                "uuid-skyrim".to_string(),
                "The Elder Scrolls V: Skyrim".to_string(),
            ),
            (
                "uuid-skyrim-se".to_string(),
                "The Elder Scrolls V: Skyrim Special Edition".to_string(),
            ),
            (
                "uuid-skyrim-vr".to_string(),
                "The Elder Scrolls V: Skyrim VR".to_string(),
            ),
        ];
        // "Skyrim VR" only matches the VR variant
        let result = resolve_game_name("Skyrim VR", &library);
        assert!(result.is_some());
        let (id, _) = result.unwrap();
        assert_eq!(id, "uuid-skyrim-vr");

        // "Skyrim Special Edition" only matches the SE variant
        let result = resolve_game_name("Skyrim Special Edition", &library);
        assert!(result.is_some());
        let (id, _) = result.unwrap();
        assert_eq!(id, "uuid-skyrim-se");
    }

    #[test]
    fn test_substring_match_single_result() {
        let library = vec![
            ("uuid-1".to_string(), "Hollow Knight".to_string()),
            ("uuid-2".to_string(), "Celeste".to_string()),
        ];
        // "Hollow" is a substring of only "Hollow Knight"
        let result = resolve_game_name("Hollow", &library);
        assert!(result.is_some());
        let (id, name) = result.unwrap();
        assert_eq!(id, "uuid-1");
        assert_eq!(name, "Hollow Knight");
    }

    #[test]
    fn test_substring_match_too_short_query() {
        let library = vec![(
            "uuid-skyrim".to_string(),
            "The Elder Scrolls V: Skyrim".to_string(),
        )];
        // "Sky" is only 3 chars — below the 4-char minimum for substring matching.
        // Prefix match also fails. JW score too low. Should be rejected.
        let result = resolve_game_name("Sky", &library);
        assert!(result.is_none(), "3-char query should not substring-match");
    }

    #[test]
    fn test_substring_match_game_action_resolves() {
        let library = vec![
            (
                "uuid-skyrim".to_string(),
                "The Elder Scrolls V: Skyrim".to_string(),
            ),
            (
                "uuid-skyrim-se".to_string(),
                "The Elder Scrolls V: Skyrim Special Edition".to_string(),
            ),
        ];
        // Full action resolution: "favorite:Skyrim" should resolve via substring
        let actions = vec![make_validated("favorite:Skyrim", 2)];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 1);
        assert_eq!(result.actions[0].action_id, "favorite:uuid-skyrim");
        assert_eq!(
            result.actions[0].resolved_name.as_deref(),
            Some("The Elder Scrolls V: Skyrim")
        );
    }

    // ── Multiple resolution behaviors ───────────────────────────────

    #[test]
    fn test_shelf_assign_prefix_resolves() {
        let library = make_library();
        let actions = vec![make_validated("shelf-assign:Hades", 2)];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 1);
        assert_eq!(result.actions[0].action_id, "shelf-assign:uuid-2");
        assert_eq!(result.actions[0].resolved_name.as_deref(), Some("Hades"));
    }

    #[test]
    fn test_hide_prefix_resolves() {
        let library = make_library();
        let actions = vec![make_validated("hide:Celeste", 2)];
        let result = resolve_actions(actions, &library, 0);
        assert_eq!(result.actions.len(), 1);
        assert_eq!(result.actions[0].action_id, "hide:uuid-3");
        assert_eq!(result.actions[0].resolved_name.as_deref(), Some("Celeste"));
    }
}
