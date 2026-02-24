use super::types::QueryContext;
use crate::models::ai::{IntentAction, ResolutionTier, ResolvedIntent};

pub struct PatternMatcher;

impl PatternMatcher {
    /// Attempt to resolve a natural-language query into palette action IDs.
    /// Returns `None` if no patterns match.
    pub fn resolve(query: &str, ctx: &QueryContext) -> Option<ResolvedIntent> {
        let lower = query.trim().to_lowercase();
        if lower.is_empty() {
            return None;
        }

        let tokens: Vec<&str> = lower.split_whitespace().collect();
        let mut actions: Vec<IntentAction> = Vec::new();
        let mut consumed: Vec<bool> = vec![false; tokens.len()];

        // Run extractors in priority order.
        // Game actions run before quick filters because "favorite skyrim"
        // should resolve as game:favorite, not filter:favorites.
        extract_reset(&tokens, &mut actions, &mut consumed);
        extract_navigation(&tokens, &mut actions, &mut consumed);
        extract_sort(&tokens, ctx, &mut actions, &mut consumed);
        extract_theme_options(&tokens, ctx, &mut actions, &mut consumed);
        extract_game_actions(&tokens, ctx, &mut actions, &mut consumed);
        extract_quick_filters(&tokens, &mut actions, &mut consumed);
        extract_source(&tokens, ctx, &mut actions, &mut consumed);
        extract_genre_tag_category(&tokens, ctx, &mut actions, &mut consumed);

        if actions.is_empty() {
            return None;
        }

        let summary = actions
            .iter()
            .map(|a| a.description.as_str())
            .collect::<Vec<_>>()
            .join(" · ");

        let confidence = calculate_confidence(&actions, tokens.len());

        Some(ResolvedIntent {
            actions,
            tier: ResolutionTier::PatternMatcher,
            confidence,
            summary,
            original_query: query.to_string(),
        })
    }
}

/// "clear filters", "reset", "show all", "reset filters"
fn extract_reset(tokens: &[&str], actions: &mut Vec<IntentAction>, consumed: &mut [bool]) {
    let joined = tokens.join(" ");
    let triggers = [
        "clear filters",
        "clear all filters",
        "reset filters",
        "reset all filters",
        "show all",
        "show everything",
    ];
    if triggers.iter().any(|t| joined.contains(t)) {
        actions.push(IntentAction {
            action_id: "action:reset-filters".into(),
            game_id: None,
            description: "Reset all filters".into(),
        });
        consumed.iter_mut().for_each(|c| *c = true);
    } else if tokens.len() == 1 && tokens[0] == "reset" {
        actions.push(IntentAction {
            action_id: "action:reset-filters".into(),
            game_id: None,
            description: "Reset all filters".into(),
        });
        consumed[0] = true;
    }
}

/// "go to library", "open settings", "show profile", "navigate to activity"
fn extract_navigation(tokens: &[&str], actions: &mut Vec<IntentAction>, consumed: &mut [bool]) {
    let nav_triggers = [
        "go to",
        "go",
        "open",
        "show",
        "navigate to",
        "navigate",
        "switch to",
    ];
    let pages = [
        (
            &["library", "games", "collection"][..],
            "nav:library",
            "Go to Library",
        ),
        (
            &["activity", "dashboard"][..],
            "nav:activity",
            "Go to Activity",
        ),
        (
            &["profile", "stats", "statistics"][..],
            "nav:profile",
            "Go to Profile",
        ),
        (&["notes", "journal"][..], "nav:notes", "Go to Notes"),
        (
            &["settings", "preferences", "config"][..],
            "nav:settings",
            "Go to Settings",
        ),
        (
            &["debug", "developer", "dev"][..],
            "nav:debug",
            "Go to Debug",
        ),
    ];

    let joined = tokens.join(" ");

    for trigger in &nav_triggers {
        if let Some(rest) = joined.strip_prefix(trigger) {
            let rest = rest.trim();
            for (aliases, action_id, desc) in &pages {
                if aliases.contains(&rest) {
                    actions.push(IntentAction {
                        action_id: action_id.to_string(),
                        game_id: None,
                        description: desc.to_string(),
                    });
                    consumed.iter_mut().for_each(|c| *c = true);
                    return;
                }
            }
        }
    }
}

/// "sort by playtime", "sorted by name desc", "order by metacritic"
fn extract_sort(
    tokens: &[&str],
    ctx: &QueryContext,
    actions: &mut Vec<IntentAction>,
    consumed: &mut [bool],
) {
    let joined = tokens.join(" ");

    // Look for "sort by X", "sorted by X", "order by X"
    let sort_prefixes = ["sort by ", "sorted by ", "order by "];
    for prefix in &sort_prefixes {
        if let Some(rest) = joined.find(prefix).map(|i| &joined[i + prefix.len()..]) {
            let rest = rest.trim();
            // Check for direction suffix
            let (field_str, _direction) =
                if rest.ends_with(" desc") || rest.ends_with(" descending") {
                    (
                        rest.trim_end_matches(" descending")
                            .trim_end_matches(" desc"),
                        "desc",
                    )
                } else if rest.ends_with(" asc") || rest.ends_with(" ascending") {
                    (
                        rest.trim_end_matches(" ascending").trim_end_matches(" asc"),
                        "asc",
                    )
                } else {
                    (rest, "")
                };

            for (sort_id, aliases) in &ctx.sort_fields {
                if aliases.iter().any(|a| field_str.contains(a)) {
                    actions.push(IntentAction {
                        action_id: format!("sort:{}", sort_id),
                        game_id: None,
                        description: format!("Sort by {}", sort_id),
                    });
                    // Mark sort-related tokens as consumed
                    for (i, t) in tokens.iter().enumerate() {
                        if [
                            "sort",
                            "sorted",
                            "order",
                            "by",
                            "asc",
                            "desc",
                            "ascending",
                            "descending",
                        ]
                        .contains(t)
                            || aliases.iter().any(|a| t.contains(a))
                        {
                            consumed[i] = true;
                        }
                    }
                    return;
                }
            }
        }
    }
}

/// "installed", "favorites", "hidden"
fn extract_quick_filters(tokens: &[&str], actions: &mut Vec<IntentAction>, consumed: &mut [bool]) {
    let filters = [
        (
            &["installed"][..],
            "filter:installed",
            "Filter: installed games",
        ),
        (
            &[
                "favorites",
                "favourite",
                "favourites",
                "favorite",
                "starred",
            ][..],
            "filter:favorites",
            "Filter: favorites",
        ),
        (&["hidden"][..], "action:hidden-games", "Show hidden games"),
    ];

    for (i, token) in tokens.iter().enumerate() {
        if consumed[i] {
            continue;
        }
        for (aliases, action_id, desc) in &filters {
            if aliases.contains(token) {
                // Avoid duplicate actions
                if !actions.iter().any(|a| a.action_id == *action_id) {
                    actions.push(IntentAction {
                        action_id: action_id.to_string(),
                        game_id: None,
                        description: desc.to_string(),
                    });
                }
                consumed[i] = true;
            }
        }
    }

    // Also consume filler words around filters
    let fillers = [
        "show", "me", "my", "all", "the", "only", "just", "games", "game", "with", "that", "are",
        "is",
    ];
    for (i, token) in tokens.iter().enumerate() {
        if fillers.contains(token) {
            consumed[i] = true;
        }
    }
}

/// "theme arctic frost", "change theme to ember forge", "font inter", "icons classic"
fn extract_theme_options(
    tokens: &[&str],
    ctx: &QueryContext,
    actions: &mut Vec<IntentAction>,
    consumed: &mut [bool],
) {
    let joined = tokens.join(" ");

    // Theme matching
    let theme_prefixes = [
        "change theme to ",
        "switch theme to ",
        "set theme to ",
        "theme ",
        "change to ",
    ];
    for prefix in &theme_prefixes {
        if let Some(rest) = joined
            .strip_prefix(prefix)
            .or_else(|| joined.find(prefix).map(|i| &joined[i + prefix.len()..]))
        {
            let rest = rest.trim();
            for (action_id, display_name, aliases) in &ctx.themes {
                if rest == display_name.to_lowercase()
                    || aliases.iter().any(|a| rest.contains(&a.to_lowercase()))
                {
                    actions.push(IntentAction {
                        action_id: action_id.to_string(),
                        game_id: None,
                        description: format!("Switch to {} theme", display_name),
                    });
                    consumed.iter_mut().for_each(|c| *c = true);
                    return;
                }
            }
        }
    }

    // Font matching
    let font_prefixes = [
        "change font to ",
        "switch font to ",
        "set font to ",
        "font ",
    ];
    for prefix in &font_prefixes {
        if let Some(rest) = joined
            .strip_prefix(prefix)
            .or_else(|| joined.find(prefix).map(|i| &joined[i + prefix.len()..]))
        {
            let rest = rest.trim();
            for (action_id, display_name, aliases) in &ctx.fonts {
                if rest == display_name.to_lowercase()
                    || aliases.iter().any(|a| rest.contains(&a.to_lowercase()))
                {
                    actions.push(IntentAction {
                        action_id: action_id.to_string(),
                        game_id: None,
                        description: format!("Switch font to {}", display_name),
                    });
                    consumed.iter_mut().for_each(|c| *c = true);
                    return;
                }
            }
        }
    }

    // Icon set matching
    let icon_prefixes = [
        "change icons to ",
        "switch icons to ",
        "set icons to ",
        "icons ",
    ];
    for prefix in &icon_prefixes {
        if let Some(rest) = joined
            .strip_prefix(prefix)
            .or_else(|| joined.find(prefix).map(|i| &joined[i + prefix.len()..]))
        {
            let rest = rest.trim();
            for (action_id, display_name, aliases) in &ctx.icon_sets {
                if rest == display_name.to_lowercase()
                    || aliases.iter().any(|a| rest.contains(&a.to_lowercase()))
                {
                    actions.push(IntentAction {
                        action_id: action_id.to_string(),
                        game_id: None,
                        description: format!("Switch icons to {}", display_name),
                    });
                    consumed.iter_mut().for_each(|c| *c = true);
                    return;
                }
            }
        }
    }

    // UI scale matching
    let scale_prefixes = ["set scale to ", "scale ", "ui scale "];
    for prefix in &scale_prefixes {
        if let Some(rest) = joined
            .strip_prefix(prefix)
            .or_else(|| joined.find(prefix).map(|i| &joined[i + prefix.len()..]))
        {
            let rest = rest.trim();
            for (action_id, display_name, aliases) in &ctx.scales {
                if rest == display_name.to_lowercase()
                    || aliases.iter().any(|a| rest.contains(&a.to_lowercase()))
                {
                    actions.push(IntentAction {
                        action_id: action_id.to_string(),
                        game_id: None,
                        description: format!("Set UI scale to {}", display_name),
                    });
                    consumed.iter_mut().for_each(|c| *c = true);
                    return;
                }
            }
        }
    }
}

/// "favorite skyrim", "notes cyberpunk"
fn extract_game_actions(
    tokens: &[&str],
    ctx: &QueryContext,
    actions: &mut Vec<IntentAction>,
    consumed: &mut [bool],
) {
    let game_action_prefixes = [
        (
            &["favorite", "fav", "unfavorite", "unfav"][..],
            "game:favorite",
            "Toggle favorite",
        ),
        (&["notes", "note"][..], "game:notes", "Open notes for"),
    ];

    for (prefixes, action_base, desc_prefix) in &game_action_prefixes {
        if let Some(prefix_idx) = tokens.iter().position(|t| prefixes.contains(t)) {
            if consumed[prefix_idx] {
                continue;
            }
            // Everything after the prefix is the game name search
            let name_tokens: Vec<&str> = tokens[prefix_idx + 1..]
                .iter()
                .enumerate()
                .filter(|(i, _)| !consumed[prefix_idx + 1 + i])
                .map(|(_, t)| *t)
                .collect();

            if !name_tokens.is_empty() {
                let search = name_tokens.join(" ");
                if let Some((game_id, game_name)) = find_game(&search, &ctx.games) {
                    actions.push(IntentAction {
                        action_id: format!("{}:{}", action_base, game_id),
                        game_id: Some(game_id.clone()),
                        description: format!("{} {}", desc_prefix, game_name),
                    });
                    // Mark all tokens as consumed
                    consumed[prefix_idx] = true;
                    for flag in consumed.iter_mut().skip(prefix_idx + 1) {
                        *flag = true;
                    }
                    return;
                }
            }
        }
    }
}

/// "steam games", "show epic games", "gog only", "ea games"
fn extract_source(
    tokens: &[&str],
    ctx: &QueryContext,
    actions: &mut Vec<IntentAction>,
    consumed: &mut [bool],
) {
    let joined = tokens.join(" ");

    // Check multi-word source aliases first (e.g., "epic games", "ea app", "battle.net")
    for (source_id, display_name, aliases) in &ctx.sources {
        for alias in *aliases {
            if alias.contains(' ') && joined.contains(alias) {
                let aid = format!("filter:source:{}", source_id);
                if !actions.iter().any(|a| a.action_id == aid) {
                    actions.push(IntentAction {
                        action_id: aid,
                        game_id: None,
                        description: format!("Launcher: {}", display_name),
                    });
                    // Mark consumed tokens that are part of this multi-word alias
                    let alias_words: Vec<&str> = alias.split_whitespace().collect();
                    for (i, t) in tokens.iter().enumerate() {
                        if !consumed[i] && alias_words.contains(t) {
                            consumed[i] = true;
                        }
                    }
                }
            }
        }
    }

    // Then single-token source matches
    for (i, token) in tokens.iter().enumerate() {
        if consumed[i] {
            continue;
        }
        for (source_id, display_name, aliases) in &ctx.sources {
            if aliases.iter().any(|a| !a.contains(' ') && a == token) {
                let aid = format!("filter:source:{}", source_id);
                if !actions.iter().any(|a| a.action_id == aid) {
                    actions.push(IntentAction {
                        action_id: aid,
                        game_id: None,
                        description: format!("Launcher: {}", display_name),
                    });
                }
                consumed[i] = true;
                break;
            }
        }
    }
}

/// Normalize a string for fuzzy tag matching: strip all separators (hyphens, spaces, underscores).
/// "Single-player" → "singleplayer", "Co-op" → "coop", "Open World" → "openworld"
fn normalize_tag(s: &str) -> String {
    s.chars()
        .filter(|c| !matches!(c, '-' | '_' | ' '))
        .collect()
}

/// Match remaining unconsumed tokens against genres, tags, and categories from DB.
fn extract_genre_tag_category(
    tokens: &[&str],
    ctx: &QueryContext,
    actions: &mut Vec<IntentAction>,
    consumed: &mut [bool],
) {
    // Collect unconsumed tokens for multi-word matching
    let remaining: String = tokens
        .iter()
        .enumerate()
        .filter(|(i, _)| !consumed[*i])
        .map(|(_, t)| *t)
        .collect::<Vec<_>>()
        .join(" ");

    if remaining.is_empty() {
        return;
    }

    // Try multi-word genre matches first (e.g., "role playing" for RPG)
    for (genre_id, genre_name) in &ctx.genres {
        if remaining.contains(genre_name.as_str())
            && !actions
                .iter()
                .any(|a| a.action_id == format!("genre-filter:{}", genre_id))
        {
            actions.push(IntentAction {
                action_id: format!("genre-filter:{}", genre_id),
                game_id: None,
                description: format!("Genre: {}", genre_name),
            });
            // Mark consumed tokens
            for (i, t) in tokens.iter().enumerate() {
                if !consumed[i] && genre_name.contains(t) {
                    consumed[i] = true;
                }
            }
        }
    }

    // Try individual token matches for genres
    for (i, token) in tokens.iter().enumerate() {
        if consumed[i] {
            continue;
        }
        for (genre_id, genre_name) in &ctx.genres {
            if genre_name == token || (token.len() >= 3 && genre_name.starts_with(token)) {
                let aid = format!("genre-filter:{}", genre_id);
                if !actions.iter().any(|a| a.action_id == aid) {
                    actions.push(IntentAction {
                        action_id: aid,
                        game_id: None,
                        description: format!("Genre: {}", genre_name),
                    });
                }
                consumed[i] = true;
                break;
            }
        }
    }

    // Try tag matches — uses original casing for action IDs, fuzzy matching for lookup.
    // Tags are stored as (original_name, lowercase_name).
    let remaining_after_genres: String = tokens
        .iter()
        .enumerate()
        .filter(|(i, _)| !consumed[*i])
        .map(|(_, t)| *t)
        .collect::<Vec<_>>()
        .join(" ");

    let remaining_normalized = normalize_tag(&remaining_after_genres);

    // Multi-word tag matches (exact lowercase and fuzzy/normalized)
    for (original, lower) in &ctx.tags {
        let lower_normalized = normalize_tag(lower);
        if remaining_after_genres.contains(lower.as_str())
            || remaining_normalized.contains(lower_normalized.as_str())
        {
            let aid = format!("tag-filter:{}", original);
            if !actions.iter().any(|a| a.action_id == aid) {
                actions.push(IntentAction {
                    action_id: aid,
                    game_id: None,
                    description: format!("Tag: {}", original),
                });
                // Mark consumed tokens that overlap with the tag
                let tag_words: Vec<&str> = lower_normalized.split_whitespace().collect();
                for (i, t) in tokens.iter().enumerate() {
                    if !consumed[i] && (lower.contains(t) || tag_words.iter().any(|tw| tw == t)) {
                        consumed[i] = true;
                    }
                }
            }
        }
    }

    // Single-token tag matches (exact and fuzzy)
    for (i, token) in tokens.iter().enumerate() {
        if consumed[i] {
            continue;
        }
        let token_normalized = normalize_tag(token);
        for (original, lower) in &ctx.tags {
            let lower_normalized = normalize_tag(lower);
            if lower == token
                || lower_normalized == token_normalized
                || (token.len() >= 4 && lower_normalized.starts_with(&token_normalized))
            {
                let aid = format!("tag-filter:{}", original);
                if !actions.iter().any(|a| a.action_id == aid) {
                    actions.push(IntentAction {
                        action_id: aid,
                        game_id: None,
                        description: format!("Tag: {}", original),
                    });
                }
                consumed[i] = true;
                break;
            }
        }
    }

    // Category/feature matches
    let remaining_after_tags: String = tokens
        .iter()
        .enumerate()
        .filter(|(i, _)| !consumed[*i])
        .map(|(_, t)| *t)
        .collect::<Vec<_>>()
        .join(" ");

    if remaining_after_tags.is_empty() {
        return;
    }

    // Multi-word category matches
    for (cat_id, lower_desc, original_desc) in &ctx.categories {
        if remaining_after_tags.contains(lower_desc.as_str()) {
            let aid = format!("category-filter:{}", cat_id);
            if !actions.iter().any(|a| a.action_id == aid) {
                actions.push(IntentAction {
                    action_id: aid,
                    game_id: None,
                    description: format!("Feature: {}", original_desc),
                });
                for (i, t) in tokens.iter().enumerate() {
                    if !consumed[i] && lower_desc.contains(t) {
                        consumed[i] = true;
                    }
                }
            }
        }
    }

    // Single-token category matches
    for (i, token) in tokens.iter().enumerate() {
        if consumed[i] {
            continue;
        }
        for (cat_id, lower_desc, original_desc) in &ctx.categories {
            if lower_desc == token || (token.len() >= 4 && lower_desc.contains(token)) {
                let aid = format!("category-filter:{}", cat_id);
                if !actions.iter().any(|a| a.action_id == aid) {
                    actions.push(IntentAction {
                        action_id: aid,
                        game_id: None,
                        description: format!("Feature: {}", original_desc),
                    });
                }
                consumed[i] = true;
                break;
            }
        }
    }
}

/// Find a game by substring match. Prefers exact match, then shortest containing match.
fn find_game<'a>(search: &str, games: &'a [(String, String)]) -> Option<(&'a String, &'a String)> {
    let search_lower = search.to_lowercase();

    // Exact match first
    if let Some((id, name)) = games.iter().find(|(_, name)| *name == search_lower) {
        return Some((id, name));
    }

    // Substring match — prefer shortest name (most specific)
    let mut best: Option<(&String, &String)> = None;
    for (id, name) in games {
        if name.contains(&search_lower) {
            match &best {
                None => best = Some((id, name)),
                Some((_, prev_name)) => {
                    if name.len() < prev_name.len() {
                        best = Some((id, name));
                    }
                }
            }
        }
    }
    best
}

/// Confidence heuristic: how well did the pattern matcher consume the query.
/// Coverage = actions found / total tokens. A 2-word query with 2 matches is high
/// confidence, while a 5-word query with 1 match is low (likely a false positive).
fn calculate_confidence(actions: &[IntentAction], total_tokens: usize) -> f64 {
    if total_tokens == 0 {
        return 0.0;
    }
    let coverage = actions.len() as f64 / total_tokens as f64;
    coverage.min(1.0)
}

// ── Tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn test_context() -> QueryContext {
        QueryContext {
            games: vec![
                ("g1".into(), "the elder scrolls v: skyrim".into()),
                ("g2".into(), "cyberpunk 2077".into()),
                ("g3".into(), "half-life 2".into()),
                ("g4".into(), "stardew valley".into()),
            ],
            genres: vec![
                ("1".into(), "action".into()),
                ("4".into(), "rpg".into()),
                ("25".into(), "adventure".into()),
                ("3".into(), "strategy".into()),
                ("28".into(), "simulation".into()),
            ],
            tags: vec![
                ("Single-player".into(), "single-player".into()),
                ("Multi-player".into(), "multi-player".into()),
                ("Open World".into(), "open world".into()),
                ("Atmospheric".into(), "atmospheric".into()),
                ("Story Rich".into(), "story rich".into()),
                ("Co-op".into(), "co-op".into()),
            ],
            categories: vec![
                (2, "single-player".into(), "Single-player".into()),
                (1, "multi-player".into(), "Multi-player".into()),
                (22, "steam achievements".into(), "Steam Achievements".into()),
                (
                    29,
                    "steam trading cards".into(),
                    "Steam Trading Cards".into(),
                ),
                (23, "steam cloud".into(), "Steam Cloud".into()),
                (
                    28,
                    "full controller support".into(),
                    "Full controller support".into(),
                ),
            ],
            themes: vec![
                ("theme:dark-gaming", "Dark Gaming", &["dark", "gaming"]),
                ("theme:arctic-frost", "Arctic Frost", &["arctic", "frost"]),
                ("theme:ember-forge", "Ember Forge", &["ember", "forge"]),
                (
                    "theme:midnight-purple",
                    "Midnight Purple",
                    &["midnight", "purple"],
                ),
                ("theme:sakura", "Sakura", &["sakura", "cherry", "blossom"]),
            ],
            fonts: vec![
                ("font:system", "System Default", &["system", "default"]),
                ("font:inter", "Inter", &["inter"]),
                (
                    "font:jetbrains-mono",
                    "JetBrains Mono",
                    &["jetbrains", "mono", "monospace"],
                ),
            ],
            icon_sets: vec![
                ("icons:classic", "Classic", &["classic"]),
                ("icons:minimal", "Minimal", &["minimal", "thin"]),
                ("icons:fantasy", "Fantasy", &["fantasy"]),
            ],
            scales: vec![
                ("scale:minimal", "Minimal", &["minimal", "small", "compact"]),
                (
                    "scale:comfortable",
                    "Comfortable",
                    &["comfortable", "default", "normal"],
                ),
                ("scale:expanded", "Expanded", &["expanded", "spacious"]),
                ("scale:large", "Large", &["large", "big"]),
            ],
            sort_fields: vec![
                ("name", &["name", "alphabetical", "a-z"]),
                ("playtime", &["playtime", "hours", "most played", "time"]),
                ("lastPlayed", &["last played", "recent", "recently"]),
                ("recentlyAdded", &["recently added", "newest", "new"]),
                ("size", &["size", "disk", "storage"]),
                ("metacritic", &["metacritic", "rating", "score", "review"]),
                ("source", &["source", "launcher", "platform"]),
            ],
            sources: vec![
                ("steam", "Steam", &["steam"]),
                ("epic", "Epic Games", &["epic", "epic games"]),
                ("gog", "GOG", &["gog"]),
                ("ea_app", "EA App", &["ea", "ea app", "origin"]),
                (
                    "ubisoft",
                    "Ubisoft Connect",
                    &["ubisoft", "ubisoft connect", "uplay"],
                ),
                (
                    "battlenet",
                    "Battle.net",
                    &["battlenet", "battle.net", "blizzard"],
                ),
                ("manual", "Manual", &["manual", "custom"]),
            ],
        }
    }

    #[test]
    fn test_clear_filters() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("clear all filters", &ctx).unwrap();
        assert_eq!(result.actions.len(), 1);
        assert_eq!(result.actions[0].action_id, "action:reset-filters");
    }

    #[test]
    fn test_reset_single_word() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("reset", &ctx).unwrap();
        assert_eq!(result.actions[0].action_id, "action:reset-filters");
    }

    #[test]
    fn test_navigate_settings() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("go to settings", &ctx).unwrap();
        assert_eq!(result.actions.len(), 1);
        assert_eq!(result.actions[0].action_id, "nav:settings");
    }

    #[test]
    fn test_navigate_library() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("open library", &ctx).unwrap();
        assert_eq!(result.actions[0].action_id, "nav:library");
    }

    #[test]
    fn test_sort_by_playtime() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("sort by playtime", &ctx).unwrap();
        assert_eq!(result.actions.len(), 1);
        assert_eq!(result.actions[0].action_id, "sort:playtime");
    }

    #[test]
    fn test_sort_descending() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("sort by name desc", &ctx).unwrap();
        assert_eq!(result.actions[0].action_id, "sort:name");
    }

    #[test]
    fn test_sort_by_metacritic() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("order by rating", &ctx).unwrap();
        assert_eq!(result.actions[0].action_id, "sort:metacritic");
    }

    #[test]
    fn test_show_favorites() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("show my favorites", &ctx).unwrap();
        assert!(result
            .actions
            .iter()
            .any(|a| a.action_id == "filter:favorites"));
    }

    #[test]
    fn test_installed_rpg_games() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("show me installed rpg games", &ctx).unwrap();
        let ids: Vec<&str> = result
            .actions
            .iter()
            .map(|a| a.action_id.as_str())
            .collect();
        assert!(ids.contains(&"filter:installed"));
        assert!(ids.contains(&"genre-filter:4"));
    }

    #[test]
    fn test_compound_three_step() {
        let ctx = test_context();
        let result =
            PatternMatcher::resolve("installed singleplayer games sorted by playtime", &ctx)
                .unwrap();
        let ids: Vec<&str> = result
            .actions
            .iter()
            .map(|a| a.action_id.as_str())
            .collect();
        assert!(ids.contains(&"filter:installed"));
        assert!(ids.contains(&"tag-filter:Single-player"));
        assert!(ids.contains(&"sort:playtime"));
    }

    #[test]
    fn test_change_theme() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("change theme to arctic frost", &ctx).unwrap();
        assert_eq!(result.actions[0].action_id, "theme:arctic-frost");
    }

    #[test]
    fn test_theme_shorthand() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("theme sakura", &ctx).unwrap();
        assert_eq!(result.actions[0].action_id, "theme:sakura");
    }

    #[test]
    fn test_change_font() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("font inter", &ctx).unwrap();
        assert_eq!(result.actions[0].action_id, "font:inter");
    }

    #[test]
    fn test_favorite_game() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("favorite skyrim", &ctx).unwrap();
        assert_eq!(result.actions.len(), 1);
        assert_eq!(result.actions[0].action_id, "game:favorite:g1");
        assert_eq!(result.actions[0].game_id, Some("g1".to_string()));
    }

    #[test]
    fn test_game_fuzzy_match() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("favorite cyberpunk", &ctx).unwrap();
        assert_eq!(result.actions[0].game_id, Some("g2".to_string()));
    }

    #[test]
    fn test_genre_by_name() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("show me action games", &ctx).unwrap();
        assert!(result
            .actions
            .iter()
            .any(|a| a.action_id == "genre-filter:1"));
    }

    #[test]
    fn test_tag_by_name() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("show open world games", &ctx).unwrap();
        assert!(result
            .actions
            .iter()
            .any(|a| a.action_id == "tag-filter:Open World"));
    }

    #[test]
    fn test_no_match_returns_none() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("asdfghjkl", &ctx);
        assert!(result.is_none());
    }

    #[test]
    fn test_empty_query_returns_none() {
        let ctx = test_context();
        assert!(PatternMatcher::resolve("", &ctx).is_none());
        assert!(PatternMatcher::resolve("  ", &ctx).is_none());
    }

    #[test]
    fn test_resolution_tier() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("sort by name", &ctx).unwrap();
        assert_eq!(result.tier, ResolutionTier::PatternMatcher);
    }

    #[test]
    fn test_original_query_preserved() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("Sort By Playtime", &ctx).unwrap();
        assert_eq!(result.original_query, "Sort By Playtime");
    }

    // ── Tag casing tests ──

    #[test]
    fn test_tag_preserves_original_casing() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("show atmospheric games", &ctx).unwrap();
        assert!(result
            .actions
            .iter()
            .any(|a| a.action_id == "tag-filter:Atmospheric"));
    }

    #[test]
    fn test_tag_fuzzy_hyphen_match() {
        // User types "singleplayer" but tag is "Single-player"
        let ctx = test_context();
        let result = PatternMatcher::resolve("show singleplayer games", &ctx).unwrap();
        assert!(result
            .actions
            .iter()
            .any(|a| a.action_id == "tag-filter:Single-player"));
    }

    #[test]
    fn test_tag_fuzzy_coop() {
        // User types "coop" but tag is "Co-op"
        let ctx = test_context();
        let result = PatternMatcher::resolve("show coop games", &ctx).unwrap();
        assert!(result
            .actions
            .iter()
            .any(|a| a.action_id == "tag-filter:Co-op"));
    }

    #[test]
    fn test_tag_multi_word_story_rich() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("show story rich games", &ctx).unwrap();
        assert!(result
            .actions
            .iter()
            .any(|a| a.action_id == "tag-filter:Story Rich"));
    }

    // ── Category/feature tests ──

    #[test]
    fn test_category_controller_support() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("show games with controller support", &ctx).unwrap();
        assert!(result
            .actions
            .iter()
            .any(|a| a.action_id == "category-filter:28"));
    }

    #[test]
    fn test_category_achievements() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("games with steam achievements", &ctx).unwrap();
        assert!(result
            .actions
            .iter()
            .any(|a| a.action_id == "category-filter:22"));
    }

    #[test]
    fn test_category_trading_cards() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("games with trading cards", &ctx).unwrap();
        assert!(result
            .actions
            .iter()
            .any(|a| a.action_id == "category-filter:29"));
    }

    // ── Source/launcher tests ──

    #[test]
    fn test_source_steam() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("show steam games", &ctx).unwrap();
        assert!(result
            .actions
            .iter()
            .any(|a| a.action_id == "filter:source:steam"));
    }

    #[test]
    fn test_source_epic() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("show epic games", &ctx).unwrap();
        assert!(result
            .actions
            .iter()
            .any(|a| a.action_id == "filter:source:epic"));
    }

    #[test]
    fn test_source_gog() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("show gog games", &ctx).unwrap();
        assert!(result
            .actions
            .iter()
            .any(|a| a.action_id == "filter:source:gog"));
    }

    #[test]
    fn test_source_ea_by_origin() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("show origin games", &ctx).unwrap();
        assert!(result
            .actions
            .iter()
            .any(|a| a.action_id == "filter:source:ea_app"));
    }

    #[test]
    fn test_source_battlenet() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("show blizzard games", &ctx).unwrap();
        assert!(result
            .actions
            .iter()
            .any(|a| a.action_id == "filter:source:battlenet"));
    }

    #[test]
    fn test_source_compound_with_genre() {
        let ctx = test_context();
        let result = PatternMatcher::resolve("show epic rpg games", &ctx).unwrap();
        let ids: Vec<&str> = result
            .actions
            .iter()
            .map(|a| a.action_id.as_str())
            .collect();
        assert!(ids.contains(&"filter:source:epic"));
        assert!(ids.contains(&"genre-filter:4"));
    }
}
