/// Internal context for AI resolvers — NOT serialized across IPC.
/// Built once per resolve call from CacheDb queries.
pub struct QueryContext {
    /// (game_id, name_lowercase)
    pub games: Vec<(String, String)>,
    /// (genre_id, genre_name_lowercase)
    pub genres: Vec<(String, String)>,
    /// (original_name, name_lowercase) — original casing preserved for action IDs
    pub tags: Vec<(String, String)>,
    /// (category_id, description_lowercase, original_description)
    pub categories: Vec<(u32, String, String)>,
    /// (action_id, display_name, aliases)
    pub themes: Vec<(&'static str, &'static str, &'static [&'static str])>,
    /// (action_id, display_name, aliases)
    pub fonts: Vec<(&'static str, &'static str, &'static [&'static str])>,
    /// (action_id, display_name, aliases)
    pub icon_sets: Vec<(&'static str, &'static str, &'static [&'static str])>,
    /// (action_id, display_name, aliases)
    pub scales: Vec<(&'static str, &'static str, &'static [&'static str])>,
    /// (sort_field, aliases)
    pub sort_fields: Vec<(&'static str, &'static [&'static str])>,
    /// (source_id, display_name, aliases)
    pub sources: Vec<(&'static str, &'static str, &'static [&'static str])>,
}
