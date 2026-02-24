use super::types::QueryContext;
use crate::services::cache_db::CacheDb;
use crate::utils::error::AppError;

pub struct AiOrchestrator;

impl AiOrchestrator {
    /// Build the query context from DB data + static config tables.
    /// Public so the command handler can build context once, then pass
    /// to both the pattern matcher and cloud resolver.
    pub fn build_context(db: &CacheDb) -> Result<QueryContext, AppError> {
        let games: Vec<(String, String)> = db
            .get_all_game_names()?
            .into_iter()
            .map(|(id, name)| (id, name.to_lowercase()))
            .collect();

        let genres: Vec<(String, String)> = db
            .get_distinct_genres()?
            .into_iter()
            .map(|(id, desc)| (id, desc.to_lowercase()))
            .collect();

        // Preserve original casing for tag action IDs (frontend expects exact case)
        let tags: Vec<(String, String)> = db
            .get_distinct_steam_tags()?
            .into_iter()
            .map(|t| {
                let lower = t.to_lowercase();
                (t, lower)
            })
            .collect();

        // Preserve original description for category action descriptions
        let categories: Vec<(u32, String, String)> = db
            .get_distinct_categories()?
            .into_iter()
            .map(|(id, desc)| {
                let lower = desc.to_lowercase();
                (id, lower, desc)
            })
            .collect();

        Ok(QueryContext {
            games,
            genres,
            tags,
            categories,
            themes: vec![
                (
                    "theme:dark-gaming",
                    "Dark Gaming",
                    &["dark", "gaming"] as &[&str],
                ),
                ("theme:fae", "Fae", &["fae", "wood", "cottage"]),
                (
                    "theme:midnight-purple",
                    "Midnight Purple",
                    &["midnight", "purple", "amethyst"],
                ),
                (
                    "theme:cyber-neon",
                    "Cyber Neon",
                    &["cyber", "neon", "cyberpunk"],
                ),
                (
                    "theme:arctic-frost",
                    "Arctic Frost",
                    &["arctic", "frost", "ice"],
                ),
                (
                    "theme:ember-forge",
                    "Ember Forge",
                    &["ember", "forge", "volcanic"],
                ),
                (
                    "theme:ocean-depths",
                    "Ocean Depths",
                    &["ocean", "marine", "aqua"],
                ),
                (
                    "theme:sakura",
                    "Sakura",
                    &["sakura", "cherry", "blossom", "pink"],
                ),
                (
                    "theme:verdant",
                    "Verdant",
                    &["verdant", "forest", "emerald", "green"],
                ),
            ],
            fonts: vec![
                (
                    "font:system",
                    "System Default",
                    &["system", "default"] as &[&str],
                ),
                ("font:inter", "Inter", &["inter"]),
                ("font:space-grotesk", "Space Grotesk", &["space", "grotesk"]),
                ("font:exo2", "Exo 2", &["exo"]),
                (
                    "font:jetbrains-mono",
                    "JetBrains Mono",
                    &["jetbrains", "mono", "monospace"],
                ),
            ],
            icon_sets: vec![
                ("icons:default", "Modern", &["modern", "remix"] as &[&str]),
                ("icons:minimal", "Minimal", &["minimal", "thin", "lucide"]),
                ("icons:heroic", "Heroic", &["heroic", "hero"]),
                (
                    "icons:playful",
                    "Playful",
                    &["playful", "rounded", "friendly"],
                ),
                (
                    "icons:classic",
                    "Classic",
                    &["classic", "fa", "font awesome"],
                ),
                ("icons:fantasy", "Fantasy", &["fantasy", "game"]),
            ],
            scales: vec![
                (
                    "scale:minimal",
                    "Minimal",
                    &["minimal", "small", "compact", "tight"] as &[&str],
                ),
                (
                    "scale:comfortable",
                    "Comfortable",
                    &["comfortable", "default", "normal", "balanced"],
                ),
                (
                    "scale:expanded",
                    "Expanded",
                    &["expanded", "spacious", "roomy"],
                ),
                ("scale:large", "Large", &["large", "big", "maximum"]),
            ],
            sort_fields: vec![
                ("name", &["name", "alphabetical", "a-z"] as &[&str]),
                ("playtime", &["playtime", "hours", "most played", "time"]),
                ("lastPlayed", &["last played", "recent", "recently"]),
                ("recentlyAdded", &["recently added", "newest", "new"]),
                ("size", &["size", "disk", "storage"]),
                ("metacritic", &["metacritic", "rating", "score", "review"]),
                ("source", &["source", "launcher", "platform"]),
            ],
            sources: vec![
                ("steam", "Steam", &["steam"] as &[&str]),
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
        })
    }
}
