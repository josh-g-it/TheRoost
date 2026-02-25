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
/// Includes playtime, last-played date, and user rating when available:
/// "Name (42h, last played Jan 2026, rated 4.5/5) - Genre1, Genre2 - Tag1, Tag2"
/// Limits tags to top 3 to keep context concise.
fn format_game_line(
    name: &str,
    genres_json: &Option<String>,
    tags_json: &Option<String>,
    hours: f64,
    last_played: Option<i64>,
    user_rating: Option<u8>,
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

    // All games with genres, tags, playtime, and user ratings
    let all_games = db.get_games_with_genre_tags()?;
    let ratings_map: std::collections::HashMap<String, u8> = db
        .get_all_ratings()?
        .into_iter()
        .map(|r| (r.game_id.clone(), r.rating))
        .collect();
    if !all_games.is_empty() {
        let lines: Vec<String> = all_games
            .iter()
            .map(|(id, name, genres, tags, hours, lp)| {
                format_game_line(name, genres, tags, *hours, *lp, ratings_map.get(id).copied())
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

    // Filtered games with genres, tags, playtime, and user ratings
    let all_games = db.get_games_with_genre_tags()?;
    let ratings_map: std::collections::HashMap<String, u8> = db
        .get_all_ratings()?
        .into_iter()
        .map(|r| (r.game_id.clone(), r.rating))
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
                format_game_line(name, genres, tags, *hours, *lp, ratings_map.get(id).copied())
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
