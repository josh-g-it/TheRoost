use super::types::QueryContext;
use crate::models::metadata::{GenreInfo, SteamTagInfo};
use crate::services::cache_db::{CacheDb, GameGenreTagRow};
use crate::utils::error::AppError;

/// Static system prompt for cloud AI providers. Explains The Roost,
/// available action types, and expected JSON response format.
pub fn build_system_prompt() -> &'static str {
    r#"You are an assistant for The Roost, a PC game launcher app that manages games from Steam, Epic, GOG, EA, Ubisoft, and Battle.net.

Your job is to help the user manage their game library by returning structured actions. You have full context about their library — use it to make smart, personalized suggestions.

Available action types:
- Navigation: nav:library, nav:activity, nav:profile, nav:notes, nav:settings
- Sort: sort:name, sort:playtime, sort:lastPlayed, sort:metacritic, sort:personalRating, sort:size, sort:recentlyAdded, sort:source
- Quick filters: filter:installed, filter:favorites, filter:hidden, filter:rated, filter:unrated
- Source filters: filter:source:steam, filter:source:epic, filter:source:gog, filter:source:ea_app, filter:source:ubisoft, filter:source:battlenet, filter:source:manual
- Genre filters: genre-filter:{id} (use the genre name-to-ID mapping provided)
- Tag filters: tag-filter:{exactTagName} (use exact tag names as shown per-game)
- Themes: theme:dark-gaming, theme:fae, theme:midnight-purple, theme:cyber-neon, theme:arctic-frost, theme:ember-forge, theme:ocean-depths, theme:sakura, theme:verdant
- Reset: action:reset-filters

You can combine multiple actions to precisely answer the user's query. For example, "show me installed RPG games sorted by playtime" would combine filter:installed + genre-filter:{rpg_id} + sort:playtime.

When the user asks for recommendations or opinions (e.g., "what should I play?"), use their playtime data, favorites, and genre preferences to give thoughtful suggestions. You can reference specific games from their library.

Response format (JSON):
{
  "actions": [{"actionId": "string", "gameId": "string or null", "description": "string"}],
  "summary": "your response to the user — can be conversational and helpful",
  "confidence": 0.0 to 1.0
}

If you cannot map the query to any actions, you can still be helpful — set actions to [] and use the summary to answer the user's question conversationally.
Only use action IDs from the types listed above. Use exact tag names and genre IDs from the provided context."#
}

/// Format a single game line for AI context.
/// Includes playtime, last-played date, user rating, and review excerpt when available:
/// "Name (42h, last played Jan 2026, rated 4.5/5, review: '...') - Genre1, Genre2 - Tag1, Tag2"
/// Limits tags to top 3 and review text to ~100 chars to keep context concise.
fn format_game_line(
    name: &str,
    genres_json: &Option<String>,
    tags_json: &Option<String>,
    hours: f64,
    last_played: Option<i64>,
    user_rating: Option<u8>,
    review_text: Option<&str>,
) -> String {
    let genres = genres_json
        .as_deref()
        .and_then(|j| serde_json::from_str::<Vec<GenreInfo>>(j).ok())
        .map(|gs| {
            gs.iter()
                .map(|g| g.description.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();

    let tags = tags_json
        .as_deref()
        .and_then(|j| serde_json::from_str::<Vec<SteamTagInfo>>(j).ok())
        .map(|ts| {
            ts.iter()
                .take(3)
                .map(|t| t.name.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();

    // Name with optional playtime, last-played date, and user rating
    let lp_str = last_played.filter(|&ts| ts > 0).and_then(|ts| {
        chrono::DateTime::from_timestamp(ts, 0).map(|dt| dt.format("%b %Y").to_string())
    });
    let rating_str = user_rating.map(|r| format!("rated {:.1}/5", f64::from(r) / 2.0));

    let mut parts = Vec::new();
    if hours >= 1.0 {
        parts.push(format!("{hours:.0}h"));
    }
    if let Some(lp) = lp_str {
        parts.push(format!("last played {lp}"));
    }
    if let Some(r) = rating_str {
        parts.push(r);
    }
    let review_str = review_text.filter(|t| !t.is_empty()).map(|t| {
        let char_count = t.chars().count();
        if char_count > 100 {
            let truncated: String = t.chars().take(100).collect();
            format!("review: '{truncated}...'")
        } else {
            format!("review: '{t}'")
        }
    });
    if let Some(rv) = review_str {
        parts.push(rv);
    }

    let label = if parts.is_empty() {
        name.to_string()
    } else {
        format!("{name} ({})", parts.join(", "))
    };

    if !genres.is_empty() && !tags.is_empty() {
        format!("{label} - {genres} - {tags}")
    } else if !genres.is_empty() {
        format!("{label} - {genres}")
    } else if !tags.is_empty() {
        format!("{label} - {tags}")
    } else {
        label
    }
}

/// Build a rich library summary from the database for cloud AI context.
/// Each game is listed with its genres, tags, and playtime.
#[allow(dead_code)]
pub fn build_library_summary(db: &CacheDb) -> Result<String, AppError> {
    let mut parts = Vec::new();

    // Game count by source
    let source_counts = db.get_game_count_by_source()?;
    if !source_counts.is_empty() {
        let counts: Vec<String> = source_counts
            .iter()
            .map(|(source, count)| format!("{source}: {count}"))
            .collect();
        parts.push(format!("Library: {}", counts.join(", ")));
    }

    // Top games by playtime (top 15 for richer context)
    let top_games = db.get_top_games_by_playtime(15)?;
    if !top_games.is_empty() {
        let game_list: Vec<String> = top_games
            .iter()
            .map(|(_, name, hours)| format!("{name} ({hours:.0}h)"))
            .collect();
        parts.push(format!("Most played: {}", game_list.join(", ")));
    }

    // Recently played (last 10)
    let recent = db.get_recently_played_game_names(10)?;
    if !recent.is_empty() {
        let names: Vec<&str> = recent.iter().map(|(_, name)| name.as_str()).collect();
        parts.push(format!("Recently played: {}", names.join(", ")));
    }

    // Favorites
    let favorites = db.get_favorite_game_names(20)?;
    if !favorites.is_empty() {
        let names: Vec<&str> = favorites.iter().map(|(_, name)| name.as_str()).collect();
        parts.push(format!("Favorites: {}", names.join(", ")));
    }

    // All games with genres, tags, playtime, and user ratings/reviews
    let all_games = db.get_games_with_genre_tags()?;
    let ratings_map: std::collections::HashMap<String, (u8, Option<String>)> = db
        .get_all_ratings()?
        .into_iter()
        .map(|r| (r.game_id.clone(), (r.rating, r.review.clone())))
        .collect();
    if !all_games.is_empty() {
        let lines: Vec<String> = all_games
            .iter()
            .map(|(id, name, genres, tags, hours, lp)| {
                format_game_line(
                    name,
                    genres,
                    tags,
                    *hours,
                    *lp,
                    ratings_map.get(id).map(|(r, _)| *r),
                    ratings_map.get(id).and_then(|(_, t)| t.as_deref()),
                )
            })
            .collect();
        parts.push(format!("All games:\n{}", lines.join("\n")));
    }

    Ok(parts.join("\n\n"))
}

/// Build a filtered library summary that respects the user's context scope settings.
/// Excluded games are filtered from all sections (most played, recent, favorites, game list).
/// Each game is listed with its genres, tags, and playtime.
pub fn build_filtered_library_summary(
    db: &CacheDb,
    scope: &str,
    excluded_ids: &[String],
    included_ids: &[String],
) -> Result<String, AppError> {
    use std::collections::HashSet;

    let excluded: HashSet<&String> = excluded_ids.iter().collect();
    let included: HashSet<&String> = included_ids.iter().collect();

    let mut parts = Vec::new();

    // Game count by source (always unfiltered — it's cheap summary info)
    let source_counts = db.get_game_count_by_source()?;
    if !source_counts.is_empty() {
        let counts: Vec<String> = source_counts
            .iter()
            .map(|(source, count)| format!("{source}: {count}"))
            .collect();
        parts.push(format!("Library: {}", counts.join(", ")));
    }

    // Top games by playtime — filter out excluded games
    let top_games = db.get_top_games_by_playtime(15)?;
    let top_filtered: Vec<_> = top_games
        .iter()
        .filter(|(id, _, _)| !excluded.contains(id))
        .collect();
    if !top_filtered.is_empty() {
        let game_list: Vec<String> = top_filtered
            .iter()
            .map(|(_, name, hours)| format!("{name} ({hours:.0}h)"))
            .collect();
        parts.push(format!("Most played: {}", game_list.join(", ")));
    }

    // Recently played — filter out excluded games
    let recent = db.get_recently_played_game_names(10)?;
    let recent_filtered: Vec<_> = recent
        .iter()
        .filter(|(id, _)| !excluded.contains(id))
        .collect();
    if !recent_filtered.is_empty() {
        let names: Vec<&str> = recent_filtered
            .iter()
            .map(|(_, name)| name.as_str())
            .collect();
        parts.push(format!("Recently played: {}", names.join(", ")));
    }

    // Favorites — filter out excluded games
    let favorites = db.get_favorite_game_names(20)?;
    let fav_filtered: Vec<_> = favorites
        .iter()
        .filter(|(id, _)| !excluded.contains(id))
        .collect();
    if !fav_filtered.is_empty() {
        let names: Vec<&str> = fav_filtered.iter().map(|(_, name)| name.as_str()).collect();
        parts.push(format!("Favorites: {}", names.join(", ")));
    }

    // Filtered games with genres, tags, playtime, and user ratings/reviews
    let all_games = db.get_games_with_genre_tags()?;
    let ratings_map: std::collections::HashMap<String, (u8, Option<String>)> = db
        .get_all_ratings()?
        .into_iter()
        .map(|r| (r.game_id.clone(), (r.rating, r.review.clone())))
        .collect();

    // Determine which IDs are in scope
    let scope_ids: HashSet<String> = match scope {
        "installed" => db.get_installed_game_ids()?.into_iter().collect(),
        "recent" => db.get_recently_played_game_ids(365)?.into_iter().collect(),
        _ => all_games.iter().map(|(id, ..)| id.clone()).collect(), // "all"
    };

    let filtered: Vec<&GameGenreTagRow> = all_games
        .iter()
        .filter(|(id, ..)| {
            if included.contains(id) {
                return true;
            }
            if excluded.contains(id) {
                return false;
            }
            scope_ids.contains(id)
        })
        .collect();

    if !filtered.is_empty() {
        let lines: Vec<String> = filtered
            .iter()
            .map(|(id, name, genres, tags, hours, lp)| {
                format_game_line(
                    name,
                    genres,
                    tags,
                    *hours,
                    *lp,
                    ratings_map.get(id).map(|(r, _)| *r),
                    ratings_map.get(id).and_then(|(_, t)| t.as_deref()),
                )
            })
            .collect();
        parts.push(format!(
            "Games in scope ({}):\n{}",
            filtered.len(),
            lines.join("\n")
        ));
    }

    Ok(parts.join("\n\n"))
}

/// Static action instructions block for the conversation system prompt.
/// Instructs the AI on the delimiter protocol, available actions, tiers, and rules.
/// Total cost: ~400 tokens.
pub fn build_actions_system_prompt() -> &'static str {
    r#"## Actions

You can execute actions in the app by appending structured data after your conversational response.
Actions let you navigate, sort, filter, change themes, and modify the user's library.

FORMAT — Place your conversational text first, complete and natural. Then, ONLY if actions are
needed, add the delimiter and action array on their own lines at the very end:

---ACTIONS---
[{"actionId": "...", "tier": 1}, ...]

CRITICAL RULES:
1. The delimiter ---ACTIONS--- must appear on its own line. Never include it in conversational text.
2. Your conversational text must stand alone — never reference the actions, the delimiter, or JSON.
3. If no actions are needed, do NOT include the delimiter. Just respond with text.
4. Actions execute sequentially in array order. Tier 1 actions execute automatically. Tier 2
   actions pause for user confirmation — if denied, all remaining actions are canceled.
5. Order actions by dependency: if you favorite a game then filter to favorites, the favorite
   action must come first in the array.
6. Use EXACT game names as they appear in the library context. Do not abbreviate or guess.
7. Only use action IDs from the list below. Unknown actions are silently rejected.
8. ONLY include actions when the user explicitly asks you to DO something (navigate, sort, filter,
   favorite, review, etc.). Never generate actions unprompted or just because you think they would
   be helpful. Casual conversation about games does NOT warrant action generation.
9. ALWAYS include action:reset-filters as the first action before any filter, genre-filter,
   tag-filter, or sort actions. Filters are additive — without clearing first, old filters
   will stack with new ones and produce unexpected results.

AVAILABLE ACTIONS:

Tier 1 (auto-execute):
  nav:{page} — Navigate (library, activity, profile, notes, news, storage, settings, assistant)
  sort:{field} — Sort library (name, playtime, lastPlayed, recentlyAdded, size, metacritic, personalRating, source)
  filter:installed | filter:favorites | filter:rated | filter:unrated | filter:update-pending — Toggle a library filter
  filter:source:{source} — Filter by launcher (steam, epic, gog, ea_app, ubisoft, battlenet, manual)
  genre-filter:{genreId} — Filter by genre (use genre IDs from the provided context)
  tag-filter:{tagName} — Filter by Steam tag (use exact tag names from the provided context)
  theme:{id} — Switch theme (dark-gaming, fae, midnight-purple, cyber-neon, arctic-frost, ember-forge, ocean-depths, sakura, verdant)
  font:{id} — Switch font family
  icons:{id} — Switch icon set
  scale:{id} — Switch UI scale
  view:grid | view:list — Switch library view mode
  action:reset-filters — Clear all library filters and search
  search:{query} — Set the library search text and navigate to library
  game:{exactGameName} — Open a game's detail panel

Tier 2 (user must confirm — include a "description" field for the confirmation prompt):
  favorite:{exactGameName} — Toggle favorite status
  rate:{exactGameName} — Set star rating; include payload: {"stars": 1-5}
  review:{exactGameName} — Save a review; include payload: {"stars": 1-5, "text": "review text"}
  note:{exactGameName} — Create/edit a game note; include payload: {"text": "note content"}
  shelf-assign:{exactGameName} — Add game to a shelf; include payload: {"shelf": "shelf name"}
  hide:{exactGameName} — Hide a game from the library
  action:refresh — Refresh game library from Steam (external API call)
  action:scan-external — Scan external launchers for new games (external API call)

NEVER generate actions for: installing, uninstalling, updating, deleting games, changing app settings, or filesystem operations. These are permanently blocked.

EXAMPLES:

User: "Show me my RPGs sorted by playtime"
Response: "Here are your RPGs sorted by most played!"
---ACTIONS---
[{"actionId": "genre-filter:1", "tier": 1}, {"actionId": "sort:playtime", "tier": 1}]

User: "Hades is easily one of the best games I've ever played"
Response: "Hades really is something special — the way it weaves narrative into the roguelike loop is unlike anything else. What is it about the game that clicked for you the most?"
(no delimiter — the user expressed an opinion but did not ask for any action)

User: "Add Celeste to my favorites and then show me all my favorites"
Response: "Great pick! Let me add Celeste to your favorites and pull up the full list."
---ACTIONS---
[{"actionId": "favorite:Celeste", "tier": 2, "description": "Add Celeste to favorites"}, {"actionId": "filter:favorites", "tier": 1}]

User: "What's been my most played genre this year?"
Response: "Looking at your playtime this year, RPGs dominate with over 300 hours across 8 titles. Action games come in second at around 150 hours."
(no delimiter — pure conversational response, no actions needed)"#
}

/// Build the genre ID mapping for the cloud API.
/// The model needs genre name→ID to construct valid `genre-filter:{id}` actions.
/// Tags and categories are omitted — tags are visible per-game, categories are not used.
pub fn build_action_context(ctx: &QueryContext) -> String {
    if ctx.genres.is_empty() {
        return String::new();
    }

    let genre_list: Vec<String> = ctx
        .genres
        .iter()
        .map(|(id, name)| format!("{name}={id}"))
        .collect();
    format!("Genre IDs: {}", genre_list.join(", "))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_game_line_includes_review_text() {
        let line = format_game_line(
            "Elden Ring",
            &None,
            &None,
            200.0,
            None,
            Some(9), // 4.5/5
            Some("Masterpiece of open-world design"),
        );
        assert!(line.contains("rated 4.5/5"));
        assert!(line.contains("review: 'Masterpiece of open-world design'"));
    }

    #[test]
    fn format_game_line_truncates_long_review() {
        let long_review = "A".repeat(150);
        let line = format_game_line(
            "Game",
            &None,
            &None,
            10.0,
            None,
            Some(8),
            Some(&long_review),
        );
        assert!(line.contains("..."));
        // Should contain the 100-char truncated prefix
        assert!(line.contains(&"A".repeat(100)));
    }

    #[test]
    fn format_game_line_omits_review_when_none() {
        let line = format_game_line("Game", &None, &None, 10.0, None, Some(8), None);
        assert!(line.contains("rated 4.0/5"));
        assert!(!line.contains("review:"));
    }

    #[test]
    fn format_game_line_omits_review_when_empty() {
        let line = format_game_line("Game", &None, &None, 10.0, None, Some(8), Some(""));
        assert!(!line.contains("review:"));
    }

    #[test]
    fn format_game_line_includes_both_rating_and_review() {
        let line = format_game_line(
            "Hades",
            &None,
            &None,
            50.0,
            None,
            Some(10), // 5.0/5
            Some("Perfect roguelike"),
        );
        assert!(line.contains("rated 5.0/5"));
        assert!(line.contains("review: 'Perfect roguelike'"));
    }

    #[test]
    fn format_game_line_no_rating_no_review() {
        let line = format_game_line("Game", &None, &None, 5.0, None, None, None);
        assert!(!line.contains("rated"));
        assert!(!line.contains("review:"));
        assert!(line.contains("Game (5h)"));
    }
}
