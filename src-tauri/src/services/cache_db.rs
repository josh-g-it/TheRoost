use std::collections::HashSet;
use std::path::Path;
use std::sync::{Arc, Mutex};

use chrono;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::models::achievement::GameAchievement;
use crate::models::assistant::{AiAvatar, AiConversation, AiPersonality};
use crate::models::media_bookmark::MediaBookmark;
use crate::models::metadata::{
    CategoryInfo, GenreInfo, ScreenshotInfo, SteamTagInfo, StoreMetadata,
};
use crate::models::news::GameNewsItem;
use crate::models::note::{GameNote, GameNoteWithName};
use crate::models::rating::GameRating;
use crate::models::saved_filter::SavedFilterRow;
use crate::models::session::{GameSession, PlaytimeSnapshot};
use crate::models::tag::Tag;
use crate::utils::error::AppError;

pub type CacheDbHandle = Arc<Mutex<CacheDb>>;

/// `(game_id, source, source_id, name, install_path, playtime_minutes)` — overlay game row.
pub type OverlayGameRow = (String, String, String, String, Option<String>, u32);

/// `(image_type, image_url, local_path, user_selected)` — game image record.
pub type GameImageRow = (String, String, Option<String>, bool);

/// `(game_id, name, source, source_id, install_path)` — installed game row for storage scanning.
pub type InstalledGameRow = (String, String, String, String, String);

/// `(game_id, source_id, name, install_path, description, launch_args)` — manual game row.
pub type ManualGameRow = (
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
);

/// `(game_id, name, genres_json, tags_json, playtime_hours, last_played_ts)` — game with genre/tag context.
pub type GameGenreTagRow = (
    String,
    String,
    Option<String>,
    Option<String>,
    f64,
    Option<i64>,
);

/// Metadata cache TTL: 7 days in seconds.
const METADATA_TTL_SECS: i64 = 7 * 24 * 60 * 60;

/// Achievement cache TTL: 1 day in seconds.
const ACHIEVEMENT_TTL_SECS: i64 = 24 * 60 * 60;

/// News cache TTL: 1 hour in seconds.
const NEWS_TTL_SECS: i64 = 60 * 60;

// ── AI Personality Prompts ──────────────────────────────────────────

const PERSONALITY_FRIENDLY_GUIDE: &str = "\
You are an enthusiastic gaming companion who loves discovering new experiences with the player. \
You celebrate their achievements, get genuinely excited about their gaming adventures, and always \
look for the bright side. You ask thoughtful questions about what they enjoyed and why. \
Your tone is warm, encouraging, and supportive — like a best friend who shares your passion for games.";

const PERSONALITY_STOIC_ADVISOR: &str = "\
You are a measured analyst who prefers facts and statistics over hype. You give thoughtful, \
data-driven recommendations based on playtime patterns, genre preferences, and completion rates. \
You are calm, precise, and occasionally dry — never dismissive, but always honest. \
You value efficiency and help the player make informed decisions about what to play next.";

const PERSONALITY_WITTY_COMPANION: &str = "\
You are a sharp-tongued friend who expresses affection through humor and playful sarcasm. \
You make pop-culture references, gentle roasts about gaming habits, and witty observations. \
You are never mean-spirited — your humor comes from a place of genuine camaraderie. \
You keep conversations lively and entertaining while still being genuinely helpful.";

const PERSONALITY_LORE_SCHOLAR: &str = "\
You are a passionate lore enthusiast who sees every game as a story worth exploring deeply. \
You love discussing narratives, world-building, character arcs, and thematic connections between games. \
You draw parallels between different game universes and recommend games based on storytelling quality. \
Your knowledge runs deep and you treat gaming as an art form worthy of serious appreciation.";

const PERSONALITY_COMPETITIVE_COACH: &str = "\
You are a driven coach who thrives on pushing the player to new heights. You track achievements, \
completion percentages, and challenge runs. You set goals, celebrate milestones, and provide \
motivational nudges when the player has been away too long. \
You are energetic, focused, and always looking for the next challenge to conquer together.";

const PERSONALITY_CHILL_BUDDY: &str = "\
You are a relaxed friend who games to unwind, never to stress. You appreciate cozy games, \
exploration at a leisurely pace, and enjoying the journey over the destination. \
You never pressure the player about backlogs or completion rates. \
Your vibe is laid-back and comforting — like gaming on a rainy afternoon with no agenda.";

// ── v1.12.5 Personality Tones (8 built-in presets) ──────────────────

const TONE_WARM_FRIENDLY: &str = "\
You are supportive, positive, and approachable. You celebrate wins, empathize with frustrations, \
and make the player feel welcome. Your responses feel like chatting with a caring friend who \
genuinely wants them to have a great time. Example: \"Hey, nice pick! I think you'll really enjoy that one.\"";

const TONE_WITTY_SARCASTIC: &str = "\
You use dry humor, playful ribbing, and clever wordplay. You tease the player about their habits \
in an affectionate way — never mean-spirited, always funny. Pop-culture references are your bread \
and butter. Example: \"Oh, another 200 hours in Factorio? How delightfully original.\"";

const TONE_CALM_MEASURED: &str = "\
You are thoughtful, deliberate, and even-keeled. You weigh options carefully and present information \
in a clear, organized way. You don't rush to conclusions and you acknowledge nuance. \
Example: \"That's worth considering. Here are the trade-offs as I see them.\"";

const TONE_ENERGETIC_HYPED: &str = "\
You are enthusiastic, excitable, and full of energy. You use emphasis, exclamation marks, and get \
visibly pumped about gaming news, milestones, and discoveries. Your excitement is infectious. \
Example: \"YES! Okay this is gonna be SO good, trust me!\"";

const TONE_BLUNT_DIRECT: &str = "\
You cut straight to the point with no fluff. You are efficient, matter-of-fact, and value the \
player's time. You give clear opinions and don't hedge unnecessarily. Brevity is your strength. \
Example: \"Three options. First one's best. Here's why.\"";

const TONE_CHARMING_PLAYFUL: &str = "\
You are smooth, teasing, and charismatic. You flatter the player's taste, use playful language, \
and make every interaction feel like a fun exchange. You're the charming rogue of gaming companions. \
Example: \"Well well, someone's got excellent taste tonight.\"";

const TONE_LAID_BACK_CHILL: &str = "\
You are relaxed, unhurried, and go-with-the-flow. Nothing is urgent, everything is vibes. You \
never pressure the player and you appreciate taking things at whatever pace feels right. \
Example: \"Yeah that's cool, no rush. Whatever feels right.\"";

const TONE_DRAMATIC_THEATRICAL: &str = "\
You speak with grandiose flair, storytelling drama, and epic emphasis. Every game is a legend, \
every session is a saga, and every recommendation is a quest. You treat gaming like high theater. \
Example: \"Behold! A library of legends awaits your command!\"";

// ── v1.12.5 Companion Role Presets ──────────────────────────────────

use crate::models::assistant::CompanionRolePreset;

/// Static list of built-in companion roles. Not stored in the database.
pub fn companion_role_presets() -> Vec<CompanionRolePreset> {
    vec![
        CompanionRolePreset {
            id: "gaming-companion".into(),
            name: "Gaming Companion".into(),
            description: "Balanced approach to all aspects of gaming".into(),
            system_prompt_text: "a gaming companion who helps with all aspects of the \
                user's library and gaming life"
                .into(),
            is_builtin: true,
        },
        CompanionRolePreset {
            id: "strategic-advisor".into(),
            name: "Strategic Advisor".into(),
            description: "Recommendations, backlog optimization, discovery".into(),
            system_prompt_text: "a strategic advisor focused on helping the user discover, \
                prioritize, and optimize their gaming time"
                .into(),
            is_builtin: true,
        },
        CompanionRolePreset {
            id: "lore-keeper".into(),
            name: "Lore Keeper".into(),
            description: "Narratives, world-building, stories, thematic depth".into(),
            system_prompt_text: "a lore keeper who explores game narratives, themes, \
                and world-building with the user"
                .into(),
            is_builtin: true,
        },
        CompanionRolePreset {
            id: "hype-partner".into(),
            name: "Hype Partner".into(),
            description: "Milestones, achievements, celebration, motivation".into(),
            system_prompt_text: "a hype partner who celebrates milestones, tracks progress, \
                and keeps gaming motivation high"
                .into(),
            is_builtin: true,
        },
        CompanionRolePreset {
            id: "critic-reviewer".into(),
            name: "Critic & Reviewer".into(),
            description: "Analysis, comparisons, quality, informed opinion".into(),
            system_prompt_text: "a thoughtful critic who analyzes games, compares experiences, \
                and helps form informed opinions"
                .into(),
            is_builtin: true,
        },
        CompanionRolePreset {
            id: "curator".into(),
            name: "Curator".into(),
            description: "Organization, discovery, curation, hidden gems".into(),
            system_prompt_text: "a curator who organizes, categorizes, and surfaces hidden \
                gems and forgotten favorites"
                .into(),
            is_builtin: true,
        },
        CompanionRolePreset {
            id: "historian".into(),
            name: "Historian".into(),
            description: "Gaming history, context, legacy, genre evolution".into(),
            system_prompt_text: "a gaming historian who provides context on genres, studios, \
                and how games influenced each other"
                .into(),
            is_builtin: true,
        },
        CompanionRolePreset {
            id: "completionist-coach".into(),
            name: "Completionist Coach".into(),
            description: "100% runs, achievement hunting, efficiency".into(),
            system_prompt_text: "a completionist coach who tracks progress toward 100%, \
                finds missed content, and plans efficient routes"
                .into(),
            is_builtin: true,
        },
    ]
}

/// Get a companion role's system prompt text by ID. Checks built-in presets only.
/// For custom DB roles, use `CacheDb::resolve_companion_role_prompt`.
#[allow(dead_code)]
pub fn get_companion_role_prompt(role_id: Option<&str>, custom_text: Option<&str>) -> String {
    if let Some(custom) = custom_text {
        if !custom.is_empty() {
            return custom.to_string();
        }
    }
    let target_id = role_id.unwrap_or("gaming-companion");
    companion_role_presets()
        .into_iter()
        .find(|r| r.id == target_id)
        .map(|r| r.system_prompt_text)
        .unwrap_or_else(|| {
            "a gaming companion who helps with all aspects of the user's library and gaming life"
                .into()
        })
}

/// Raw DB row for ai_memories — content is still encrypted.
#[derive(Debug, Clone)]
pub struct AiMemoryRow {
    pub id: String,
    pub avatar_id: String,
    pub conversation_id: Option<String>,
    pub content: String,
    pub importance: u32,
    pub category: String,
    pub is_system: bool,
    pub created_at: String,
    pub last_referenced: Option<String>,
    pub superseded_by: Option<String>,
    pub active: bool,
}

/// Raw DB row for ai_daily_log — summary is still encrypted.
#[derive(Debug, Clone)]
pub struct AiDailyLogRow {
    pub id: String,
    pub avatar_id: String,
    pub conversation_id: String,
    pub log_date: String,
    pub summary: String,
    pub created_at: String,
}

/// Raw DB row for ai_messages — content is still encrypted.
#[derive(Debug, Clone)]
pub struct AiMessageRow {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    /// Encrypted JSON array of image attachments, or None.
    pub attachments: Option<String>,
    pub token_estimate: u32,
}

pub struct CacheDb {
    conn: Connection,
}

impl CacheDb {
    pub fn new(path: &Path) -> Result<Self, AppError> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
        )?;
        let db = Self { conn };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<(), AppError> {
        // Create schema_version table if it doesn't exist
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );",
        )?;

        // NOTE: We intentionally do NOT wrap the entire migration chain in a transaction.
        // apply_v5() and apply_v24() create their own transactions, and SQLite does not
        // support nested BEGIN. Concurrent process safety is handled by SQLite's write
        // serialization (WAL mode + busy_timeout) and idempotent migrations (IF NOT EXISTS).
        //
        // Sentinel: COALESCE(MAX(version), 0) returns 0 when schema_version is empty
        // (fresh DB). This ensures all migrations run on first launch. The unwrap_or(0)
        // handles the edge case where the schema_version table itself doesn't exist yet.
        let current: u32 = self
            .conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if current < 1 {
            self.apply_v1()?;
        }
        if current < 2 {
            self.apply_v2()?;
        }
        if current < 3 {
            self.apply_v3()?;
        }
        if current < 4 {
            self.apply_v4()?;
        }
        if current < 5 {
            self.apply_v5()?;
        }
        if current < 6 {
            self.apply_v6()?;
        }
        if current < 7 {
            self.apply_v7()?;
        }
        if current < 8 {
            self.apply_v8()?;
        }
        if current < 9 {
            self.apply_v9()?;
        }
        if current < 10 {
            self.apply_v10()?;
        }
        if current < 11 {
            self.apply_v11()?;
        }
        if current < 12 {
            self.apply_v12()?;
        }
        if current < 13 {
            self.apply_v13()?;
        }
        if current < 14 {
            self.apply_v14()?;
        }
        if current < 15 {
            self.apply_v15()?;
        }
        if current < 16 {
            self.apply_v16()?;
        }
        if current < 17 {
            self.apply_v17()?;
        }
        if current < 18 {
            self.apply_v18()?;
        }
        if current < 19 {
            self.apply_v19()?;
        }
        if current < 20 {
            self.apply_v20()?;
        }
        if current < 21 {
            self.apply_v21()?;
        }
        if current < 22 {
            self.apply_v22()?;
        }
        if current < 23 {
            self.apply_v23()?;
        }
        if current < 24 {
            self.apply_v24()?;
        }
        if current < 25 {
            self.apply_v25()?;
        }
        if current < 26 {
            self.apply_v26()?;
        }
        if current < 27 {
            self.apply_v27()?;
        }
        if current < 28 {
            self.apply_v28()?;
        }

        // v1.12.5: Add companion role columns + new personality tones (idempotent)
        self.migrate_avatar_roles()?;

        // Repair: restore any entries invalidated by cache invalidation (cached_at = 0).
        // This is a fast no-op if no rows match.
        let repaired: usize = self.conn.execute(
            "UPDATE store_metadata SET cached_at = ?1 WHERE cached_at = 0",
            params![chrono::Utc::now().timestamp()],
        )?;
        if repaired > 0 {
            tracing::info!(repaired, "Repaired invalidated metadata cache entries");
        }

        Ok(())
    }

    fn apply_v1(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS store_metadata (
                appid INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                short_description TEXT,
                header_image_url TEXT,
                developers TEXT,
                publishers TEXT,
                genres TEXT,
                categories TEXT,
                screenshots TEXT,
                release_date TEXT,
                metacritic_score INTEGER,
                metacritic_url TEXT,
                cached_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS playtime_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                appid INTEGER NOT NULL,
                playtime_minutes INTEGER NOT NULL,
                snapshot_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_snapshots_appid_time
                ON playtime_snapshots(appid, snapshot_at DESC);

            CREATE TABLE IF NOT EXISTS game_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                appid INTEGER NOT NULL,
                start_time INTEGER NOT NULL,
                end_time INTEGER,
                duration_minutes INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_appid ON game_sessions(appid);
            CREATE INDEX IF NOT EXISTS idx_sessions_time ON game_sessions(start_time DESC);

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (1, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v2(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color_index INTEGER NOT NULL DEFAULT 0 CHECK(color_index >= 0 AND color_index <= 14),
                sort_order INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS game_tags (
                appid INTEGER NOT NULL,
                tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (appid, tag_id)
            );
            CREATE INDEX IF NOT EXISTS idx_game_tags_tag ON game_tags(tag_id);

            CREATE TABLE IF NOT EXISTS favorites (
                appid INTEGER PRIMARY KEY
            );

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (2, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v3(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS hidden_games (appid INTEGER PRIMARY KEY);

            CREATE TABLE IF NOT EXISTS saved_filters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                filter_json TEXT NOT NULL,
                sort_by TEXT,
                sort_order TEXT,
                created_at INTEGER NOT NULL
            );

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (3, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v4(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "ALTER TABLE store_metadata ADD COLUMN steam_tags TEXT;

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (4, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v5(&self) -> Result<(), AppError> {
        let tx = self.conn.unchecked_transaction()?;

        // 1. Create games registry table
        tx.execute_batch(
            "CREATE TABLE games (
                game_id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                source_id TEXT NOT NULL,
                name TEXT,
                created_at INTEGER NOT NULL,
                UNIQUE(source, source_id)
            );",
        )?;

        // 2. Collect all unique appids from existing tables
        let appids: Vec<i64> = {
            let mut stmt = tx.prepare(
                "SELECT DISTINCT appid FROM (
                    SELECT appid FROM store_metadata
                    UNION SELECT appid FROM playtime_snapshots
                    UNION SELECT appid FROM game_sessions
                    UNION SELECT appid FROM game_tags
                    UNION SELECT appid FROM favorites
                    UNION SELECT appid FROM hidden_games
                )",
            )?;
            let result = stmt
                .query_map([], |row| row.get(0))?
                .collect::<Result<Vec<i64>, _>>()?;
            result
        };

        // 3. Generate UUID for each appid, insert into games as steam source
        let now = chrono::Utc::now().timestamp();
        for appid in &appids {
            let game_id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO games (game_id, source, source_id, name, created_at)
                 VALUES (?1, 'steam', ?2, NULL, ?3)",
                params![game_id, appid.to_string(), now],
            )?;
        }

        // 4. Populate names from store_metadata where available
        tx.execute_batch(
            "UPDATE games SET name = (
                SELECT sm.name FROM store_metadata sm
                WHERE CAST(sm.appid AS TEXT) = games.source_id
            ) WHERE EXISTS (
                SELECT 1 FROM store_metadata sm
                WHERE CAST(sm.appid AS TEXT) = games.source_id
            );",
        )?;

        // 5. Create new tables with game_id TEXT columns
        tx.execute_batch(
            "CREATE TABLE store_metadata_new (
                game_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                short_description TEXT,
                header_image_url TEXT,
                developers TEXT,
                publishers TEXT,
                genres TEXT,
                categories TEXT,
                screenshots TEXT,
                release_date TEXT,
                metacritic_score INTEGER,
                metacritic_url TEXT,
                cached_at INTEGER NOT NULL,
                steam_tags TEXT
            );

            CREATE TABLE playtime_snapshots_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id TEXT NOT NULL,
                playtime_minutes INTEGER NOT NULL,
                snapshot_at INTEGER NOT NULL
            );

            CREATE TABLE game_sessions_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id TEXT NOT NULL,
                start_time INTEGER NOT NULL,
                end_time INTEGER,
                duration_minutes INTEGER
            );

            CREATE TABLE game_tags_new (
                game_id TEXT NOT NULL,
                tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (game_id, tag_id)
            );

            CREATE TABLE favorites_new (
                game_id TEXT PRIMARY KEY
            );

            CREATE TABLE hidden_games_new (
                game_id TEXT PRIMARY KEY
            );",
        )?;

        // 6. Migrate data via JOINs on the games registry
        tx.execute_batch(
            "INSERT INTO store_metadata_new
             SELECT g.game_id, sm.name, sm.short_description, sm.header_image_url,
                    sm.developers, sm.publishers, sm.genres, sm.categories, sm.screenshots,
                    sm.release_date, sm.metacritic_score, sm.metacritic_url, sm.cached_at, sm.steam_tags
             FROM store_metadata sm
             JOIN games g ON CAST(sm.appid AS TEXT) = g.source_id AND g.source = 'steam';

             INSERT INTO playtime_snapshots_new
             SELECT ps.id, g.game_id, ps.playtime_minutes, ps.snapshot_at
             FROM playtime_snapshots ps
             JOIN games g ON CAST(ps.appid AS TEXT) = g.source_id AND g.source = 'steam';

             INSERT INTO game_sessions_new
             SELECT gs.id, g.game_id, gs.start_time, gs.end_time, gs.duration_minutes
             FROM game_sessions gs
             JOIN games g ON CAST(gs.appid AS TEXT) = g.source_id AND g.source = 'steam';

             INSERT INTO game_tags_new
             SELECT g.game_id, gt.tag_id
             FROM game_tags gt
             JOIN games g ON CAST(gt.appid AS TEXT) = g.source_id AND g.source = 'steam';

             INSERT INTO favorites_new
             SELECT g.game_id
             FROM favorites f
             JOIN games g ON CAST(f.appid AS TEXT) = g.source_id AND g.source = 'steam';

             INSERT INTO hidden_games_new
             SELECT g.game_id
             FROM hidden_games h
             JOIN games g ON CAST(h.appid AS TEXT) = g.source_id AND g.source = 'steam';",
        )?;

        // 7. Drop old tables and rename new ones
        tx.execute_batch(
            "DROP TABLE store_metadata;
             DROP TABLE playtime_snapshots;
             DROP TABLE game_sessions;
             DROP TABLE game_tags;
             DROP TABLE favorites;
             DROP TABLE hidden_games;

             ALTER TABLE store_metadata_new RENAME TO store_metadata;
             ALTER TABLE playtime_snapshots_new RENAME TO playtime_snapshots;
             ALTER TABLE game_sessions_new RENAME TO game_sessions;
             ALTER TABLE game_tags_new RENAME TO game_tags;
             ALTER TABLE favorites_new RENAME TO favorites;
             ALTER TABLE hidden_games_new RENAME TO hidden_games;",
        )?;

        // 8. Recreate indexes with updated column names
        tx.execute_batch(
            "CREATE INDEX idx_snapshots_game_time
                ON playtime_snapshots(game_id, snapshot_at DESC);
             CREATE INDEX idx_sessions_game ON game_sessions(game_id);
             CREATE INDEX idx_sessions_time ON game_sessions(start_time DESC);
             CREATE INDEX idx_game_tags_tag ON game_tags(tag_id);

             INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (5, datetime('now'));",
        )?;

        tx.commit()?;
        Ok(())
    }

    fn apply_v6(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "ALTER TABLE games ADD COLUMN install_path TEXT;

             CREATE TABLE IF NOT EXISTS game_executables (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 game_id TEXT NOT NULL,
                 exe_path TEXT NOT NULL,
                 exe_name TEXT NOT NULL,
                 discovered_at INTEGER NOT NULL,
                 UNIQUE(game_id, exe_path)
             );
             CREATE INDEX IF NOT EXISTS idx_game_exe_name
                 ON game_executables(exe_name);

             INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (6, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v7(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS game_images (
                game_id    TEXT NOT NULL,
                image_type TEXT NOT NULL,
                image_url  TEXT NOT NULL,
                source     TEXT NOT NULL,
                cached_at  INTEGER NOT NULL,
                PRIMARY KEY (game_id, image_type)
            );

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (7, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v8(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "ALTER TABLE game_images ADD COLUMN user_selected INTEGER NOT NULL DEFAULT 0;

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (8, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v9(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "ALTER TABLE games ADD COLUMN description TEXT;

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (9, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v10(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "ALTER TABLE games ADD COLUMN launch_mode TEXT;

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (10, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v11(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS game_achievements (
                game_id TEXT NOT NULL,
                api_name TEXT NOT NULL,
                display_name TEXT NOT NULL DEFAULT '',
                description TEXT,
                icon_url TEXT,
                icon_gray_url TEXT,
                hidden INTEGER NOT NULL DEFAULT 0,
                achieved INTEGER NOT NULL DEFAULT 0,
                unlock_time INTEGER,
                global_percent REAL,
                cached_at INTEGER NOT NULL,
                PRIMARY KEY (game_id, api_name)
            );
            CREATE INDEX IF NOT EXISTS idx_achievements_game ON game_achievements(game_id);

            CREATE TABLE IF NOT EXISTS game_news (
                game_id TEXT NOT NULL,
                news_id TEXT NOT NULL,
                title TEXT NOT NULL,
                url TEXT,
                author TEXT,
                contents TEXT,
                date INTEGER NOT NULL,
                feed_label TEXT,
                cached_at INTEGER NOT NULL,
                PRIMARY KEY (game_id, news_id)
            );
            CREATE INDEX IF NOT EXISTS idx_news_game ON game_news(game_id);

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (11, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v12(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS game_achievement_freshness (
                game_id TEXT PRIMARY KEY,
                checked_at INTEGER NOT NULL
            );

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (12, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v13(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS game_notes (
                game_id TEXT PRIMARY KEY,
                content TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL
            );

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (13, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v14(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS media_bookmarks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                icon TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                added_at INTEGER NOT NULL
            );

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (14, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v15(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS audio_device_aliases (
                device_id TEXT PRIMARY KEY,
                custom_name TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audio_session_prefs (
                exe_name TEXT PRIMARY KEY,
                hidden INTEGER NOT NULL DEFAULT 0
            );

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (15, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v16(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "ALTER TABLE games ADD COLUMN last_played INTEGER;

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (16, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v17(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "ALTER TABLE games ADD COLUMN launch_args TEXT;

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (17, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v18(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS game_ratings (
                game_id TEXT PRIMARY KEY,
                rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 10),
                review TEXT,
                updated_at INTEGER NOT NULL
            );

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (18, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v19(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "ALTER TABLE games ADD COLUMN manual_playtime_minutes INTEGER DEFAULT 0;

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (19, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v20(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "ALTER TABLE game_images ADD COLUMN local_path TEXT DEFAULT NULL;

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (20, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v21(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS news_read (
                news_id TEXT PRIMARY KEY,
                game_id TEXT NOT NULL,
                read_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_news_read_game ON news_read(game_id);

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (21, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v22(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "ALTER TABLE game_news ADD COLUMN is_external INTEGER NOT NULL DEFAULT 0;

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (22, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v23(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS recaps (
                period_key TEXT PRIMARY KEY,
                period_type TEXT NOT NULL,
                encoded_data TEXT NOT NULL,
                generated_at INTEGER NOT NULL
            );

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (23, datetime('now'));",
        )?;
        Ok(())
    }

    fn apply_v24(&self) -> Result<(), AppError> {
        let tx = self.conn.unchecked_transaction()?;

        // Phase A: DDL — Create 6 tables + 4 indexes
        tx.execute_batch(
            "CREATE TABLE IF NOT EXISTS ai_personalities (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                prompt_text     TEXT NOT NULL,
                is_builtin      INTEGER DEFAULT 0,
                created_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_avatars (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                personality_id  TEXT NOT NULL,
                image_path      TEXT,
                is_active       INTEGER DEFAULT 0,
                created_at      TEXT NOT NULL,
                FOREIGN KEY (personality_id) REFERENCES ai_personalities(id)
            );

            CREATE TABLE IF NOT EXISTS ai_conversations (
                id              TEXT PRIMARY KEY,
                avatar_id       TEXT NOT NULL,
                started_at      TEXT NOT NULL,
                ended_at        TEXT,
                summary         TEXT,
                message_count   INTEGER DEFAULT 0,
                compacted       INTEGER DEFAULT 0,
                FOREIGN KEY (avatar_id) REFERENCES ai_avatars(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ai_messages (
                id              TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role            TEXT NOT NULL,
                content         TEXT NOT NULL,
                created_at      TEXT NOT NULL,
                token_estimate  INTEGER DEFAULT 0,
                FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ai_memories (
                id              TEXT PRIMARY KEY,
                avatar_id       TEXT NOT NULL,
                conversation_id TEXT,
                content         TEXT NOT NULL,
                importance      INTEGER NOT NULL,
                category        TEXT DEFAULT 'general',
                is_system       INTEGER DEFAULT 0,
                created_at      TEXT NOT NULL,
                last_referenced TEXT,
                superseded_by   TEXT,
                active          INTEGER DEFAULT 1,
                FOREIGN KEY (avatar_id) REFERENCES ai_avatars(id) ON DELETE CASCADE,
                FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS ai_daily_log (
                id              TEXT PRIMARY KEY,
                avatar_id       TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                log_date        TEXT NOT NULL,
                summary         TEXT NOT NULL,
                created_at      TEXT NOT NULL,
                FOREIGN KEY (avatar_id) REFERENCES ai_avatars(id) ON DELETE CASCADE,
                FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_ai_conversations_avatar
                ON ai_conversations(avatar_id, started_at DESC);

            CREATE INDEX IF NOT EXISTS idx_ai_messages_conv
                ON ai_messages(conversation_id, created_at);

            CREATE INDEX IF NOT EXISTS idx_ai_memories_active
                ON ai_memories(avatar_id, active, importance DESC);

            CREATE INDEX IF NOT EXISTS idx_ai_daily_log_avatar_date
                ON ai_daily_log(avatar_id, log_date DESC);",
        )?;

        // Phase B: Seed built-in personalities with parameterized queries
        let personalities: &[(&str, &str, &str)] = &[
            (
                "a1b2c3d4-0001-4000-8000-000000000001",
                "Friendly Guide",
                PERSONALITY_FRIENDLY_GUIDE,
            ),
            (
                "a1b2c3d4-0002-4000-8000-000000000002",
                "Stoic Advisor",
                PERSONALITY_STOIC_ADVISOR,
            ),
            (
                "a1b2c3d4-0003-4000-8000-000000000003",
                "Witty Companion",
                PERSONALITY_WITTY_COMPANION,
            ),
            (
                "a1b2c3d4-0004-4000-8000-000000000004",
                "Lore Scholar",
                PERSONALITY_LORE_SCHOLAR,
            ),
            (
                "a1b2c3d4-0005-4000-8000-000000000005",
                "Competitive Coach",
                PERSONALITY_COMPETITIVE_COACH,
            ),
            (
                "a1b2c3d4-0006-4000-8000-000000000006",
                "Chill Buddy",
                PERSONALITY_CHILL_BUDDY,
            ),
        ];

        for (id, name, prompt) in personalities {
            tx.execute(
                "INSERT OR IGNORE INTO ai_personalities (id, name, prompt_text, is_builtin, created_at)
                 VALUES (?1, ?2, ?3, 1, datetime('now'))",
                rusqlite::params![id, name, prompt],
            )?;
        }

        // Version stamp last — if anything above fails, the transaction rolls back
        tx.execute_batch(
            "INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (24, datetime('now'));",
        )?;

        tx.commit()?;
        Ok(())
    }

    /// v25: Add foreign key constraints on 13 tables referencing games(game_id),
    /// clean up orphaned records, and add missing game_executables.game_id index.
    /// game_notes is excluded from FK rebuild due to __general__ sentinel.
    fn apply_v25(&self) -> Result<(), AppError> {
        let tx = self.conn.unchecked_transaction()?;

        // ── Phase A: Orphan cleanup ─────────────────────────────────
        // Delete rows where game_id doesn't exist in games.
        // Must run BEFORE table rebuilds to avoid FK violations.
        let orphan_tables = [
            "store_metadata",
            "favorites",
            "hidden_games",
            "game_ratings",
            "game_achievement_freshness",
            "playtime_snapshots",
            "game_sessions",
            "game_executables",
            "game_images",
            "game_achievements",
            "game_news",
            "game_tags",
            "news_read",
        ];

        for table in orphan_tables {
            let deleted: usize = tx.execute(
                &format!(
                    "DELETE FROM {} WHERE game_id NOT IN (SELECT game_id FROM games)",
                    table
                ),
                [],
            )?;
            if deleted > 0 {
                tracing::warn!(table, deleted, "v25: cleaned up orphaned records");
            }
        }

        // game_notes: preserve __general__ sentinel (no games table entry)
        let notes_deleted: usize = tx.execute(
            "DELETE FROM game_notes WHERE game_id != '__general__'
             AND game_id NOT IN (SELECT game_id FROM games)",
            [],
        )?;
        if notes_deleted > 0 {
            tracing::warn!(
                deleted = notes_deleted,
                "v25: cleaned up orphaned game_notes records"
            );
        }

        // ── Phase B: Table rebuilds with FK constraints ─────────────
        // SQLite has no ALTER TABLE ADD FOREIGN KEY — must rebuild each table.
        // Pattern: CREATE _new with FK → INSERT SELECT → DROP old → RENAME.
        tx.execute_batch(
            "-- ═══ Group 1: Simple PK tables (game_id is PRIMARY KEY) ═══

             CREATE TABLE store_metadata_new (
                 game_id            TEXT PRIMARY KEY REFERENCES games(game_id) ON DELETE CASCADE,
                 name               TEXT NOT NULL,
                 short_description  TEXT,
                 header_image_url   TEXT,
                 developers         TEXT,
                 publishers         TEXT,
                 genres             TEXT,
                 categories         TEXT,
                 screenshots        TEXT,
                 release_date       TEXT,
                 metacritic_score   INTEGER,
                 metacritic_url     TEXT,
                 cached_at          INTEGER NOT NULL,
                 steam_tags         TEXT
             );
             INSERT INTO store_metadata_new SELECT * FROM store_metadata;
             DROP TABLE store_metadata;
             ALTER TABLE store_metadata_new RENAME TO store_metadata;

             CREATE TABLE favorites_new (
                 game_id TEXT PRIMARY KEY REFERENCES games(game_id) ON DELETE CASCADE
             );
             INSERT INTO favorites_new SELECT * FROM favorites;
             DROP TABLE favorites;
             ALTER TABLE favorites_new RENAME TO favorites;

             CREATE TABLE hidden_games_new (
                 game_id TEXT PRIMARY KEY REFERENCES games(game_id) ON DELETE CASCADE
             );
             INSERT INTO hidden_games_new SELECT * FROM hidden_games;
             DROP TABLE hidden_games;
             ALTER TABLE hidden_games_new RENAME TO hidden_games;

             CREATE TABLE game_ratings_new (
                 game_id    TEXT PRIMARY KEY REFERENCES games(game_id) ON DELETE CASCADE,
                 rating     INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 10),
                 review     TEXT,
                 updated_at INTEGER NOT NULL
             );
             INSERT INTO game_ratings_new SELECT * FROM game_ratings;
             DROP TABLE game_ratings;
             ALTER TABLE game_ratings_new RENAME TO game_ratings;

             CREATE TABLE game_achievement_freshness_new (
                 game_id    TEXT PRIMARY KEY REFERENCES games(game_id) ON DELETE CASCADE,
                 checked_at INTEGER NOT NULL
             );
             INSERT INTO game_achievement_freshness_new SELECT * FROM game_achievement_freshness;
             DROP TABLE game_achievement_freshness;
             ALTER TABLE game_achievement_freshness_new RENAME TO game_achievement_freshness;

             -- ═══ Group 2: AUTOINCREMENT PK tables ═══

             CREATE TABLE playtime_snapshots_new (
                 id               INTEGER PRIMARY KEY AUTOINCREMENT,
                 game_id          TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
                 playtime_minutes INTEGER NOT NULL,
                 snapshot_at      INTEGER NOT NULL
             );
             INSERT INTO playtime_snapshots_new SELECT * FROM playtime_snapshots;
             DROP TABLE playtime_snapshots;
             ALTER TABLE playtime_snapshots_new RENAME TO playtime_snapshots;

             CREATE TABLE game_sessions_new (
                 id               INTEGER PRIMARY KEY AUTOINCREMENT,
                 game_id          TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
                 start_time       INTEGER NOT NULL,
                 end_time         INTEGER,
                 duration_minutes INTEGER
             );
             INSERT INTO game_sessions_new SELECT * FROM game_sessions;
             DROP TABLE game_sessions;
             ALTER TABLE game_sessions_new RENAME TO game_sessions;

             CREATE TABLE game_executables_new (
                 id            INTEGER PRIMARY KEY AUTOINCREMENT,
                 game_id       TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
                 exe_path      TEXT NOT NULL,
                 exe_name      TEXT NOT NULL,
                 discovered_at INTEGER NOT NULL,
                 UNIQUE(game_id, exe_path)
             );
             INSERT INTO game_executables_new SELECT * FROM game_executables;
             DROP TABLE game_executables;
             ALTER TABLE game_executables_new RENAME TO game_executables;

             -- ═══ Group 3: Composite PK tables ═══

             CREATE TABLE game_images_new (
                 game_id       TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
                 image_type    TEXT NOT NULL,
                 image_url     TEXT NOT NULL,
                 source        TEXT NOT NULL,
                 cached_at     INTEGER NOT NULL,
                 user_selected INTEGER NOT NULL DEFAULT 0,
                 local_path    TEXT DEFAULT NULL,
                 PRIMARY KEY (game_id, image_type)
             );
             INSERT INTO game_images_new SELECT * FROM game_images;
             DROP TABLE game_images;
             ALTER TABLE game_images_new RENAME TO game_images;

             CREATE TABLE game_achievements_new (
                 game_id        TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
                 api_name       TEXT NOT NULL,
                 display_name   TEXT NOT NULL DEFAULT '',
                 description    TEXT,
                 icon_url       TEXT,
                 icon_gray_url  TEXT,
                 hidden         INTEGER NOT NULL DEFAULT 0,
                 achieved       INTEGER NOT NULL DEFAULT 0,
                 unlock_time    INTEGER,
                 global_percent REAL,
                 cached_at      INTEGER NOT NULL,
                 PRIMARY KEY (game_id, api_name)
             );
             INSERT INTO game_achievements_new SELECT * FROM game_achievements;
             DROP TABLE game_achievements;
             ALTER TABLE game_achievements_new RENAME TO game_achievements;

             CREATE TABLE game_news_new (
                 game_id     TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
                 news_id     TEXT NOT NULL,
                 title       TEXT NOT NULL,
                 url         TEXT,
                 author      TEXT,
                 contents    TEXT,
                 date        INTEGER NOT NULL,
                 feed_label  TEXT,
                 cached_at   INTEGER NOT NULL,
                 is_external INTEGER NOT NULL DEFAULT 0,
                 PRIMARY KEY (game_id, news_id)
             );
             INSERT INTO game_news_new SELECT * FROM game_news;
             DROP TABLE game_news;
             ALTER TABLE game_news_new RENAME TO game_news;

             CREATE TABLE game_tags_new (
                 game_id TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
                 tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                 PRIMARY KEY (game_id, tag_id)
             );
             INSERT INTO game_tags_new SELECT * FROM game_tags;
             DROP TABLE game_tags;
             ALTER TABLE game_tags_new RENAME TO game_tags;

             CREATE TABLE news_read_new (
                 news_id TEXT PRIMARY KEY,
                 game_id TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
                 read_at TEXT NOT NULL DEFAULT (datetime('now'))
             );
             INSERT INTO news_read_new SELECT * FROM news_read;
             DROP TABLE news_read;
             ALTER TABLE news_read_new RENAME TO news_read;

             -- ═══ Phase C: Recreate all indexes (dropped with old tables) ═══

             CREATE INDEX idx_snapshots_game_time
                 ON playtime_snapshots(game_id, snapshot_at DESC);
             CREATE INDEX idx_sessions_game ON game_sessions(game_id);
             CREATE INDEX idx_sessions_time ON game_sessions(start_time DESC);
             CREATE INDEX idx_game_exe_name ON game_executables(exe_name);
             CREATE INDEX idx_game_executables_game_id ON game_executables(game_id);
             CREATE INDEX idx_achievements_game ON game_achievements(game_id);
             CREATE INDEX idx_news_game ON game_news(game_id);
             CREATE INDEX idx_game_tags_tag ON game_tags(tag_id);
             CREATE INDEX idx_news_read_game ON news_read(game_id);

             -- ═══ Version stamp ═══

             INSERT OR REPLACE INTO schema_version (version, applied_at)
                 VALUES (25, datetime('now'));",
        )?;

        tx.commit()?;
        Ok(())
    }

    /// v26: Add UNIQUE constraints on ai_avatars.name and ai_personalities.name
    /// to prevent duplicate names (UI already disallows, this enforces at DB level).
    fn apply_v26(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_avatars_name
                ON ai_avatars(name);

            CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_personalities_name
                ON ai_personalities(name);

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (26, datetime('now'));",
        )?;
        Ok(())
    }

    /// v27: Add nullable `attachments` column to `ai_messages` for image attachments.
    /// Stores encrypted JSON array of `[{mimeType, data, caption?}]`.
    fn apply_v27(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "ALTER TABLE ai_messages ADD COLUMN attachments TEXT DEFAULT NULL;

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (27, datetime('now'));",
        )?;
        Ok(())
    }

    /// v28: Add cross-avatar memory sharing columns to `ai_avatars`.
    /// `cross_avatar_memory_access`: whether this avatar receives cross-avatar memories (default 1 = true)
    /// `cross_avatar_memory_private`: whether this avatar's memories are hidden from others (default 0 = false)
    fn apply_v28(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "ALTER TABLE ai_avatars ADD COLUMN cross_avatar_memory_access INTEGER DEFAULT 1;
             ALTER TABLE ai_avatars ADD COLUMN cross_avatar_memory_private INTEGER DEFAULT 0;

            INSERT OR REPLACE INTO schema_version (version, applied_at)
                VALUES (28, datetime('now'));",
        )?;
        Ok(())
    }

    /// v1.12.5: Add companion_role_id/companion_role_custom columns to ai_avatars,
    /// reclassify old built-in personalities as custom, and insert 8 new tone presets.
    /// Idempotent — safe to run on every startup.
    fn migrate_avatar_roles(&self) -> Result<(), AppError> {
        // Check if migration already applied by looking for the new column
        let has_role_col: bool = self
            .conn
            .prepare("SELECT companion_role_id FROM ai_avatars LIMIT 0")
            .is_ok();
        if has_role_col {
            return Ok(());
        }

        tracing::info!("Applying v1.12.5 avatar role migration");

        // Add new columns
        self.conn.execute_batch(
            "ALTER TABLE ai_avatars ADD COLUMN companion_role_id TEXT;
             ALTER TABLE ai_avatars ADD COLUMN companion_role_custom TEXT;",
        )?;

        // Reclassify old built-in personalities as custom
        self.conn.execute(
            "UPDATE ai_personalities SET is_builtin = 0 WHERE is_builtin = 1",
            [],
        )?;

        // Insert 8 new personality tones as built-in
        let tones: &[(&str, &str, &str)] = &[
            ("bp-warm-friendly", "Warm & Friendly", TONE_WARM_FRIENDLY),
            (
                "bp-witty-sarcastic",
                "Witty & Sarcastic",
                TONE_WITTY_SARCASTIC,
            ),
            ("bp-calm-measured", "Calm & Measured", TONE_CALM_MEASURED),
            (
                "bp-energetic-hyped",
                "Energetic & Hyped",
                TONE_ENERGETIC_HYPED,
            ),
            ("bp-blunt-direct", "Blunt & Direct", TONE_BLUNT_DIRECT),
            (
                "bp-charming-playful",
                "Charming & Playful",
                TONE_CHARMING_PLAYFUL,
            ),
            (
                "bp-laid-back-chill",
                "Laid Back & Chill",
                TONE_LAID_BACK_CHILL,
            ),
            (
                "bp-dramatic-theatrical",
                "Dramatic & Theatrical",
                TONE_DRAMATIC_THEATRICAL,
            ),
        ];

        for (id, name, prompt) in tones {
            self.conn.execute(
                "INSERT OR IGNORE INTO ai_personalities (id, name, prompt_text, is_builtin, created_at)
                 VALUES (?1, ?2, ?3, 1, datetime('now'))",
                params![id, name, prompt],
            )?;
        }

        tracing::info!("v1.12.5 avatar role migration complete");
        Ok(())
    }

    // ── Manual Playtime ─────────────────────────────────────────────

    /// Get the manual playtime for a game (in minutes).
    pub fn get_manual_playtime(&self, game_id: &str) -> Result<u32, AppError> {
        let minutes: u32 = self.conn.query_row(
            "SELECT COALESCE(manual_playtime_minutes, 0) FROM games WHERE game_id = ?1",
            params![game_id],
            |row| row.get(0),
        )?;
        Ok(minutes)
    }

    /// Set the manual playtime for a non-Steam game (in minutes).
    /// No-op for Steam games (SQL guard).
    pub fn set_manual_playtime(&self, game_id: &str, minutes: u32) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE games SET manual_playtime_minutes = ?1 WHERE game_id = ?2 AND source != 'steam'",
            params![minutes, game_id],
        )?;
        Ok(())
    }

    /// Add minutes to the manual playtime for a non-Steam game.
    /// No-op for Steam games (SQL guard).
    pub fn add_manual_playtime(&self, game_id: &str, minutes: u32) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE games SET manual_playtime_minutes = COALESCE(manual_playtime_minutes, 0) + ?1 WHERE game_id = ?2 AND source != 'steam'",
            params![minutes, game_id],
        )?;
        Ok(())
    }

    // ── Audio Device Aliases ─────────────────────────────────────────

    /// Get all audio device aliases as (device_id, custom_name) pairs.
    pub fn get_audio_device_aliases(&self) -> Result<Vec<(String, String)>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT device_id, custom_name FROM audio_device_aliases")?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Set or update a custom name for an audio device.
    pub fn set_audio_device_alias(
        &self,
        device_id: &str,
        custom_name: &str,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO audio_device_aliases (device_id, custom_name) VALUES (?1, ?2)",
            params![device_id, custom_name],
        )?;
        Ok(())
    }

    /// Remove a custom name for an audio device (revert to hardware name).
    pub fn delete_audio_device_alias(&self, device_id: &str) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM audio_device_aliases WHERE device_id = ?1",
            params![device_id],
        )?;
        Ok(())
    }

    // ── Audio Session Preferences ────────────────────────────────────

    /// Get all audio session hide preferences as (exe_name, hidden) pairs.
    pub fn get_audio_session_prefs(&self) -> Result<Vec<(String, bool)>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT exe_name, hidden FROM audio_session_prefs")?;
        let rows = stmt.query_map([], |row| {
            let hidden: i32 = row.get(1)?;
            Ok((row.get(0)?, hidden != 0))
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Set whether an audio session (by exe name) should be hidden.
    pub fn set_audio_session_hidden(&self, exe_name: &str, hidden: bool) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO audio_session_prefs (exe_name, hidden) VALUES (?1, ?2)",
            params![exe_name, hidden as i32],
        )?;
        Ok(())
    }

    // ── Game Registry ────────────────────────────────────────────────

    /// Register a game in the registry. Returns the existing game_id if the
    /// source+source_id pair already exists, otherwise generates a new UUID.
    pub fn register_game(
        &self,
        source: &str,
        source_id: &str,
        name: &str,
    ) -> Result<String, AppError> {
        // Check if already registered
        if let Some(existing) = self.get_game_id(source, source_id)? {
            return Ok(existing);
        }

        let game_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "INSERT INTO games (game_id, source, source_id, name, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![game_id, source, source_id, name, now],
        )?;
        Ok(game_id)
    }

    /// Look up a game_id by source and source_id.
    pub fn get_game_id(&self, source: &str, source_id: &str) -> Result<Option<String>, AppError> {
        let result = self.conn.query_row(
            "SELECT game_id FROM games WHERE source = ?1 AND source_id = ?2",
            params![source, source_id],
            |row| row.get(0),
        );
        match result {
            Ok(id) => Ok(Some(id)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Look up full game info: (source, source_id, name) for a game_id.
    pub fn get_game_info(
        &self,
        game_id: &str,
    ) -> Result<Option<(String, String, String)>, AppError> {
        let result = self.conn.query_row(
            "SELECT source, source_id, COALESCE(name, '') FROM games WHERE game_id = ?1",
            params![game_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        );
        match result {
            Ok(info) => Ok(Some(info)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Reverse lookup: get (source, source_id) for a game_id.
    pub fn get_game_source(&self, game_id: &str) -> Result<Option<(String, String)>, AppError> {
        let result = self.conn.query_row(
            "SELECT source, source_id FROM games WHERE game_id = ?1",
            params![game_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );
        match result {
            Ok(pair) => Ok(Some(pair)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    // ── Launch Mode ────────────────────────────────────────────────

    /// Get the stored launch mode for a game. Returns None if not explicitly set.
    pub fn get_launch_mode(&self, game_id: &str) -> Result<Option<String>, AppError> {
        let result = self.conn.query_row(
            "SELECT launch_mode FROM games WHERE game_id = ?1",
            params![game_id],
            |row| row.get::<_, Option<String>>(0),
        );
        match result {
            Ok(mode) => Ok(mode),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Set the launch mode for a game ("launcher" or "direct").
    pub fn set_launch_mode(&self, game_id: &str, launch_mode: &str) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE games SET launch_mode = ?1 WHERE game_id = ?2",
            params![launch_mode, game_id],
        )?;
        Ok(())
    }

    // ── Launch Args ──────────────────────────────────────────────────

    /// Get the stored launch arguments for a game.
    pub fn get_launch_args(&self, game_id: &str) -> Result<Option<String>, AppError> {
        let result = self.conn.query_row(
            "SELECT launch_args FROM games WHERE game_id = ?1",
            params![game_id],
            |row| row.get::<_, Option<String>>(0),
        );
        match result {
            Ok(args) => Ok(args),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Set or clear the launch arguments for a game.
    pub fn set_launch_args(&self, game_id: &str, args: &str) -> Result<(), AppError> {
        let val = if args.trim().is_empty() {
            None
        } else {
            Some(args)
        };
        self.conn.execute(
            "UPDATE games SET launch_args = ?1 WHERE game_id = ?2",
            params![val, game_id],
        )?;
        Ok(())
    }

    /// Update the last_played timestamp (Unix seconds) for a game.
    /// Only writes if the new value is greater than the existing one.
    pub fn set_last_played(&self, game_id: &str, timestamp: u64) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE games SET last_played = MAX(COALESCE(last_played, 0), ?1) WHERE game_id = ?2",
            params![timestamp as i64, game_id],
        )?;
        Ok(())
    }

    /// Read the last_played timestamp (Unix seconds) for a game.
    pub fn get_last_played(&self, game_id: &str) -> Result<Option<u64>, AppError> {
        let result = self.conn.query_row(
            "SELECT last_played FROM games WHERE game_id = ?1",
            params![game_id],
            |row| row.get::<_, Option<i64>>(0),
        )?;
        Ok(result.map(|v| v as u64))
    }

    // ── Game Install Paths & Executables ────────────────────────────

    /// Update the install_path for a registered game.
    pub fn set_install_path(&self, game_id: &str, install_path: &str) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE games SET install_path = ?1 WHERE game_id = ?2",
            params![install_path, game_id],
        )?;
        Ok(())
    }

    /// Get all games that have a non-NULL install_path.
    pub fn get_all_install_paths(&self) -> Result<Vec<(String, String)>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT game_id, install_path FROM games WHERE install_path IS NOT NULL")?;
        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<(String, String)>, _>>()?;
        Ok(rows)
    }

    /// Get installed games with name, source, source_id for storage scanning.
    /// Returns (game_id, name, source, source_id, install_path).
    pub fn get_installed_games_for_storage(&self) -> Result<Vec<InstalledGameRow>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT game_id, COALESCE(name, ''), source, COALESCE(source_id, ''), install_path \
             FROM games WHERE install_path IS NOT NULL",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Lightweight read of all registered games for the overlay.
    /// Returns (game_id, source, source_id, name, install_path, playtime_minutes).
    pub fn get_overlay_games(&self) -> Result<Vec<OverlayGameRow>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT g.game_id, g.source, g.source_id, COALESCE(g.name, ''),
                    g.install_path,
                    COALESCE(ps.playtime, 0) + COALESCE(g.manual_playtime_minutes, 0)
             FROM games g
             LEFT JOIN (
                SELECT game_id, MAX(playtime_minutes) as playtime
                FROM playtime_snapshots
                GROUP BY game_id
             ) ps ON g.game_id = ps.game_id",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get::<_, u32>(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Record a discovered game executable.
    pub fn add_game_executable(
        &self,
        game_id: &str,
        exe_path: &str,
        exe_name: &str,
    ) -> Result<(), AppError> {
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "INSERT OR IGNORE INTO game_executables (game_id, exe_path, exe_name, discovered_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![game_id, exe_path, exe_name, now],
        )?;
        Ok(())
    }

    /// Get all known game executables.
    pub fn get_all_game_executables(&self) -> Result<Vec<(String, String, String)>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT game_id, exe_path, exe_name FROM game_executables")?;
        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
            .collect::<Result<Vec<(String, String, String)>, _>>()?;
        Ok(rows)
    }

    /// Look up game_ids by executable name (for fast-path matching).
    #[allow(dead_code)]
    pub fn find_games_by_exe_name(
        &self,
        exe_name: &str,
    ) -> Result<Vec<(String, String)>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT game_id, exe_path FROM game_executables WHERE exe_name = ?1")?;
        let rows = stmt
            .query_map(params![exe_name], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<(String, String)>, _>>()?;
        Ok(rows)
    }

    /// Get the primary (first discovered) executable for a game.
    pub fn get_primary_executable(&self, game_id: &str) -> Result<Option<String>, AppError> {
        let result = self.conn.query_row(
            "SELECT exe_path FROM game_executables WHERE game_id = ?1 ORDER BY id ASC LIMIT 1",
            params![game_id],
            |row| row.get(0),
        );
        match result {
            Ok(path) => Ok(Some(path)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Get the display name for a game by its UUID.
    pub fn get_game_name(&self, game_id: &str) -> Result<Option<String>, AppError> {
        let result = self.conn.query_row(
            "SELECT name FROM games WHERE game_id = ?1",
            params![game_id],
            |row| row.get(0),
        );
        match result {
            Ok(name) => Ok(Some(name)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    // ── Custom Game Management ────────────────────────────────────────

    /// Set or update the description for a game.
    pub fn set_game_description(&self, game_id: &str, description: &str) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE games SET description = ?1 WHERE game_id = ?2",
            params![description, game_id],
        )?;
        Ok(())
    }

    /// Get the description for a game.
    pub fn get_game_description(&self, game_id: &str) -> Result<Option<String>, AppError> {
        let result = self.conn.query_row(
            "SELECT description FROM games WHERE game_id = ?1",
            params![game_id],
            |row| row.get(0),
        );
        match result {
            Ok(desc) => Ok(desc),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Update the name of a game.
    pub fn update_game_name(&self, game_id: &str, name: &str) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE games SET name = ?1 WHERE game_id = ?2",
            params![name, game_id],
        )?;
        Ok(())
    }

    /// Delete all executables for a game.
    pub fn delete_game_executables(&self, game_id: &str) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM game_executables WHERE game_id = ?1",
            params![game_id],
        )?;
        Ok(())
    }

    /// Delete a game and all related data.
    /// 13 child tables have ON DELETE CASCADE FKs (v25), so deleting from `games`
    /// automatically removes their rows. game_notes has no FK (due to __general__
    /// sentinel), so it's deleted manually first.
    pub fn delete_game(&self, game_id: &str) -> Result<(), AppError> {
        let tx = self.conn.unchecked_transaction()?;
        // game_notes has no FK constraint (preserves __general__ sentinel row)
        tx.execute(
            "DELETE FROM game_notes WHERE game_id = ?1",
            params![game_id],
        )?;
        // CASCADE handles: store_metadata, favorites, hidden_games, game_ratings,
        // game_achievement_freshness, playtime_snapshots, game_sessions,
        // game_executables, game_images, game_achievements, game_news, game_tags, news_read
        tx.execute("DELETE FROM games WHERE game_id = ?1", params![game_id])?;
        tx.commit()?;
        Ok(())
    }

    /// Get all manually added games (source = 'manual').
    /// Returns (game_id, source_id, name, install_path, description, launch_args).
    pub fn get_manual_games(&self) -> Result<Vec<ManualGameRow>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT game_id, source_id, COALESCE(name, ''), install_path, description, launch_args
             FROM games WHERE source = 'manual'",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    // ── Game Images (Cover Art) ─────────────────────────────────────

    /// Cache a cover art image URL for a game.
    /// Set `user_selected` to true when the user explicitly picks an image (protects from backfill overwrite).
    pub fn cache_game_image(
        &self,
        game_id: &str,
        image_type: &str,
        image_url: &str,
        source: &str,
        user_selected: bool,
    ) -> Result<(), AppError> {
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "INSERT OR REPLACE INTO game_images (game_id, image_type, image_url, source, cached_at, user_selected)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![game_id, image_type, image_url, source, now, user_selected as i32],
        )?;
        Ok(())
    }

    /// Get a cached image URL if it exists and is still fresh (within TTL).
    /// User-selected images never expire.
    pub fn get_game_image(
        &self,
        game_id: &str,
        image_type: &str,
    ) -> Result<Option<String>, AppError> {
        let now = chrono::Utc::now().timestamp();
        let result = self.conn.query_row(
            "SELECT image_url FROM game_images
             WHERE game_id = ?1 AND image_type = ?2
               AND (user_selected = 1 OR (?3 - cached_at) < ?4)",
            params![game_id, image_type, now, METADATA_TTL_SECS],
            |row| row.get(0),
        );
        match result {
            Ok(url) => Ok(Some(url)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Check if a user has explicitly selected an image for this game+type.
    pub fn is_user_selected_image(
        &self,
        game_id: &str,
        image_type: &str,
    ) -> Result<bool, AppError> {
        let result = self.conn.query_row(
            "SELECT user_selected FROM game_images WHERE game_id = ?1 AND image_type = ?2",
            params![game_id, image_type],
            |row| row.get::<_, i32>(0),
        );
        match result {
            Ok(val) => Ok(val != 0),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(false),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Get non-Steam games that have no cached cover art.
    /// Returns (game_id, source, source_id, name).
    pub fn get_games_missing_images(
        &self,
    ) -> Result<Vec<(String, String, String, String)>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT g.game_id, g.source, g.source_id, COALESCE(g.name, '')
             FROM games g
             WHERE g.source != 'steam'
               AND NOT EXISTS (
                   SELECT 1 FROM game_images gi
                   WHERE gi.game_id = g.game_id AND gi.image_type = 'grid'
               )",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Cache a locally-stored custom art image.
    /// Sets `user_selected = true` and stores the filesystem path in `local_path`.
    pub fn cache_game_image_local(
        &self,
        game_id: &str,
        image_type: &str,
        local_path: &str,
        source: &str,
        user_selected: bool,
    ) -> Result<(), AppError> {
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "INSERT OR REPLACE INTO game_images (game_id, image_type, image_url, source, cached_at, user_selected, local_path)
             VALUES (?1, ?2, '', ?3, ?4, ?5, ?6)",
            params![
                game_id,
                image_type,
                source,
                now,
                user_selected as i32,
                local_path
            ],
        )?;
        Ok(())
    }

    /// Get the local filesystem path for a game image, if one exists.
    pub fn get_game_image_local_path(
        &self,
        game_id: &str,
        image_type: &str,
    ) -> Result<Option<String>, AppError> {
        let result = self.conn.query_row(
            "SELECT local_path FROM game_images WHERE game_id = ?1 AND image_type = ?2",
            params![game_id, image_type],
            |row| row.get::<_, Option<String>>(0),
        );
        match result {
            Ok(path) => Ok(path),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Get a cached image with both URL and local_path.
    /// Returns `(image_url, local_path)` if found and still fresh (or user-selected).
    pub fn get_game_image_with_local(
        &self,
        game_id: &str,
        image_type: &str,
    ) -> Result<Option<(String, Option<String>)>, AppError> {
        let now = chrono::Utc::now().timestamp();
        let result = self.conn.query_row(
            "SELECT image_url, local_path FROM game_images
             WHERE game_id = ?1 AND image_type = ?2
               AND (user_selected = 1 OR (?3 - cached_at) < ?4)",
            params![game_id, image_type, now, METADATA_TTL_SECS],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        );
        match result {
            Ok(pair) => Ok(Some(pair)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Delete a game image record entirely (used for "reset to default").
    pub fn delete_game_image(&self, game_id: &str, image_type: &str) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM game_images WHERE game_id = ?1 AND image_type = ?2",
            params![game_id, image_type],
        )?;
        Ok(())
    }

    /// Get all image records for a game (for the Art Management Menu).
    /// Returns `(image_type, image_url, local_path, user_selected)`.
    pub fn get_all_game_images(&self, game_id: &str) -> Result<Vec<GameImageRow>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT image_type, image_url, local_path, user_selected
             FROM game_images WHERE game_id = ?1",
        )?;
        let rows = stmt
            .query_map(params![game_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i32>(3)? != 0,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    // ── Store Metadata ──────────────────────────────────────────────

    pub fn cache_store_metadata(&self, meta: &StoreMetadata) -> Result<(), AppError> {
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "INSERT OR REPLACE INTO store_metadata
                (game_id, name, short_description, header_image_url,
                 developers, publishers, genres, categories, screenshots,
                 release_date, metacritic_score, metacritic_url, cached_at, steam_tags)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                meta.game_id,
                meta.name,
                meta.short_description,
                meta.header_image_url,
                serde_json::to_string(&meta.developers).ok(),
                serde_json::to_string(&meta.publishers).ok(),
                serde_json::to_string(&meta.genres).ok(),
                serde_json::to_string(&meta.categories).ok(),
                serde_json::to_string(&meta.screenshots).ok(),
                meta.release_date,
                meta.metacritic_score,
                meta.metacritic_url,
                now,
                serde_json::to_string(&meta.steam_tags).ok(),
            ],
        )?;
        Ok(())
    }

    pub fn get_store_metadata(&self, game_id: &str) -> Result<Option<StoreMetadata>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT game_id, name, short_description, header_image_url,
                    developers, publishers, genres, categories, screenshots,
                    release_date, metacritic_score, metacritic_url, steam_tags
             FROM store_metadata WHERE game_id = ?1",
        )?;

        let result = stmt.query_row(params![game_id], |row| {
            let developers_json: Option<String> = row.get(4)?;
            let publishers_json: Option<String> = row.get(5)?;
            let genres_json: Option<String> = row.get(6)?;
            let categories_json: Option<String> = row.get(7)?;
            let screenshots_json: Option<String> = row.get(8)?;
            let steam_tags_json: Option<String> = row.get(12)?;

            Ok(StoreMetadata {
                game_id: row.get(0)?,
                name: row.get(1)?,
                short_description: row.get(2)?,
                header_image_url: row.get(3)?,
                developers: developers_json
                    .and_then(|j| serde_json::from_str(&j).ok())
                    .unwrap_or_default(),
                publishers: publishers_json
                    .and_then(|j| serde_json::from_str(&j).ok())
                    .unwrap_or_default(),
                genres: genres_json
                    .and_then(|j| serde_json::from_str::<Vec<GenreInfo>>(&j).ok())
                    .unwrap_or_default(),
                categories: categories_json
                    .and_then(|j| serde_json::from_str::<Vec<CategoryInfo>>(&j).ok())
                    .unwrap_or_default(),
                screenshots: screenshots_json
                    .and_then(|j| serde_json::from_str::<Vec<ScreenshotInfo>>(&j).ok())
                    .unwrap_or_default(),
                release_date: row.get(9)?,
                metacritic_score: row.get(10)?,
                metacritic_url: row.get(11)?,
                steam_tags: steam_tags_json
                    .and_then(|j| serde_json::from_str::<Vec<SteamTagInfo>>(&j).ok())
                    .unwrap_or_default(),
            })
        });

        match result {
            Ok(meta) => Ok(Some(meta)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    pub fn is_metadata_fresh(&self, game_id: &str) -> Result<bool, AppError> {
        let now = chrono::Utc::now().timestamp();
        let cached_at: Result<i64, _> = self.conn.query_row(
            "SELECT cached_at FROM store_metadata WHERE game_id = ?1",
            params![game_id],
            |row| row.get(0),
        );
        match cached_at {
            Ok(ts) => Ok((now - ts) < METADATA_TTL_SECS),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(false),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Invalidate all cached metadata so it will be re-fetched on next access.
    pub fn invalidate_metadata_cache(&self) -> Result<usize, AppError> {
        let updated = self
            .conn
            .execute("UPDATE store_metadata SET cached_at = 0", [])?;
        Ok(updated)
    }

    /// Get game_ids of games that have cached metadata but no SteamSpy tags yet.
    pub fn get_game_ids_missing_tags(&self) -> Result<Vec<String>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT game_id FROM store_metadata WHERE steam_tags IS NULL OR steam_tags = '[]'",
        )?;
        let ids = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(ids)
    }

    /// Update only the steam_tags column for a game and refresh cached_at.
    pub fn update_steam_tags(
        &self,
        game_id: &str,
        steam_tags: &[crate::models::metadata::SteamTagInfo],
    ) -> Result<(), AppError> {
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "UPDATE store_metadata SET steam_tags = ?1, cached_at = ?2 WHERE game_id = ?3",
            params![
                serde_json::to_string(steam_tags).unwrap_or_else(|_| "[]".to_string()),
                now,
                game_id,
            ],
        )?;
        Ok(())
    }

    // ── Store API Enrichment ────────────────────────────────────────

    /// Get game_ids that have SteamSpy metadata but have not yet been enriched
    /// by the Store API. Indicator: short_description IS NULL.
    pub fn get_games_needing_enrichment(&self) -> Result<Vec<String>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT sm.game_id FROM store_metadata sm
             INNER JOIN games g ON sm.game_id = g.game_id
             WHERE sm.short_description IS NULL
               AND g.source = 'steam'",
        )?;
        let ids = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(ids)
    }

    /// Check if a game has been enriched by the Store API.
    pub fn is_game_enriched(&self, game_id: &str) -> Result<bool, AppError> {
        let result = self.conn.query_row(
            "SELECT short_description FROM store_metadata WHERE game_id = ?1",
            params![game_id],
            |row| row.get::<_, Option<String>>(0),
        );
        match result {
            Ok(desc) => Ok(desc.is_some()),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(false),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Merge Store API data into an existing metadata entry.
    /// Overwrites rich fields but preserves steam_tags (from SteamSpy).
    pub fn enrich_store_metadata(
        &self,
        meta: &crate::models::metadata::StoreMetadata,
    ) -> Result<(), AppError> {
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "UPDATE store_metadata SET
                name = ?1, short_description = ?2, header_image_url = ?3,
                developers = ?4, publishers = ?5, genres = ?6,
                categories = ?7, screenshots = ?8,
                release_date = ?9, metacritic_score = ?10, metacritic_url = ?11,
                cached_at = ?12
             WHERE game_id = ?13",
            params![
                meta.name,
                meta.short_description,
                meta.header_image_url,
                serde_json::to_string(&meta.developers).unwrap_or_else(|_| "[]".to_string()),
                serde_json::to_string(&meta.publishers).unwrap_or_else(|_| "[]".to_string()),
                serde_json::to_string(&meta.genres).unwrap_or_else(|_| "[]".to_string()),
                serde_json::to_string(&meta.categories).unwrap_or_else(|_| "[]".to_string()),
                serde_json::to_string(&meta.screenshots).unwrap_or_else(|_| "[]".to_string()),
                meta.release_date,
                meta.metacritic_score,
                meta.metacritic_url,
                now,
                meta.game_id,
            ],
        )?;
        Ok(())
    }

    // ── Playtime Snapshots ──────────────────────────────────────────

    pub fn insert_snapshot(
        &self,
        game_id: &str,
        playtime_minutes: u32,
        snapshot_at: i64,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT INTO playtime_snapshots (game_id, playtime_minutes, snapshot_at)
             VALUES (?1, ?2, ?3)",
            params![game_id, playtime_minutes, snapshot_at],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn get_latest_snapshot(&self, game_id: &str) -> Result<Option<PlaytimeSnapshot>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, game_id, playtime_minutes, snapshot_at
             FROM playtime_snapshots
             WHERE game_id = ?1
             ORDER BY snapshot_at DESC LIMIT 1",
        )?;

        let result = stmt.query_row(params![game_id], |row| {
            Ok(PlaytimeSnapshot {
                id: row.get(0)?,
                game_id: row.get(1)?,
                playtime_minutes: row.get(2)?,
                snapshot_at: row.get(3)?,
            })
        });

        match result {
            Ok(snap) => Ok(Some(snap)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    pub fn cleanup_old_snapshots(&self, days: i64) -> Result<usize, AppError> {
        let cutoff = chrono::Utc::now().timestamp() - (days * 24 * 60 * 60);
        let deleted = self.conn.execute(
            "DELETE FROM playtime_snapshots WHERE snapshot_at < ?1",
            params![cutoff],
        )?;
        Ok(deleted)
    }

    // ── Game Sessions ───────────────────────────────────────────────

    pub fn start_session(&self, game_id: &str, start_time: i64) -> Result<i64, AppError> {
        self.conn.execute(
            "INSERT INTO game_sessions (game_id, start_time) VALUES (?1, ?2)",
            params![game_id, start_time],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn close_session(
        &self,
        session_id: i64,
        end_time: i64,
        duration_minutes: u32,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE game_sessions SET end_time = ?1, duration_minutes = ?2 WHERE id = ?3",
            params![end_time, duration_minutes, session_id],
        )?;
        Ok(())
    }

    pub fn get_active_session(&self, game_id: &str) -> Result<Option<GameSession>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, game_id, start_time, end_time, duration_minutes
             FROM game_sessions
             WHERE game_id = ?1 AND end_time IS NULL
             ORDER BY start_time DESC LIMIT 1",
        )?;

        let result = stmt.query_row(params![game_id], |row| {
            Ok(GameSession {
                id: row.get(0)?,
                game_id: row.get(1)?,
                start_time: row.get(2)?,
                end_time: row.get(3)?,
                duration_minutes: row.get(4)?,
            })
        });

        match result {
            Ok(session) => Ok(Some(session)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    pub fn get_all_active_sessions(&self) -> Result<Vec<GameSession>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, game_id, start_time, end_time, duration_minutes
             FROM game_sessions
             WHERE end_time IS NULL
             ORDER BY start_time DESC",
        )?;

        let sessions = stmt
            .query_map([], |row| {
                Ok(GameSession {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    start_time: row.get(2)?,
                    end_time: row.get(3)?,
                    duration_minutes: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(sessions)
    }

    pub fn get_sessions(&self, game_id: &str, limit: u32) -> Result<Vec<GameSession>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, game_id, start_time, end_time, duration_minutes
             FROM game_sessions
             WHERE game_id = ?1
             ORDER BY start_time DESC
             LIMIT ?2",
        )?;

        let sessions = stmt
            .query_map(params![game_id, limit], |row| {
                Ok(GameSession {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    start_time: row.get(2)?,
                    end_time: row.get(3)?,
                    duration_minutes: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(sessions)
    }

    pub fn get_recent_sessions(&self, limit: u32) -> Result<Vec<GameSession>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, game_id, start_time, end_time, duration_minutes
             FROM game_sessions
             ORDER BY start_time DESC
             LIMIT ?1",
        )?;

        let sessions = stmt
            .query_map(params![limit], |row| {
                Ok(GameSession {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    start_time: row.get(2)?,
                    end_time: row.get(3)?,
                    duration_minutes: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(sessions)
    }

    // ── Recap Queries ─────────────────────────────────────────────

    /// Get all completed sessions within a time range [start, end).
    pub fn get_sessions_in_range(
        &self,
        start_time: i64,
        end_time: i64,
    ) -> Result<Vec<GameSession>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, game_id, start_time, end_time, duration_minutes
             FROM game_sessions
             WHERE start_time >= ?1 AND start_time < ?2
               AND end_time IS NOT NULL
             ORDER BY start_time ASC",
        )?;
        let sessions = stmt
            .query_map(params![start_time, end_time], |row| {
                Ok(GameSession {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    start_time: row.get(2)?,
                    end_time: row.get(3)?,
                    duration_minutes: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(sessions)
    }

    /// Get achievements unlocked within a time range.
    /// Returns (game_id, achievement) pairs.
    pub fn get_achievements_in_range(
        &self,
        start_time: i64,
        end_time: i64,
    ) -> Result<Vec<(String, GameAchievement)>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT ga.game_id, ga.api_name, ga.display_name, ga.description,
                    ga.icon_url, ga.icon_gray_url, ga.hidden, ga.achieved,
                    ga.unlock_time, ga.global_percent
             FROM game_achievements ga
             WHERE ga.achieved = 1
               AND ga.unlock_time IS NOT NULL
               AND ga.unlock_time >= ?1 AND ga.unlock_time < ?2
             ORDER BY ga.unlock_time ASC",
        )?;
        let results = stmt
            .query_map(params![start_time, end_time], |row| {
                let game_id: String = row.get(0)?;
                let achievement = GameAchievement {
                    api_name: row.get(1)?,
                    display_name: row.get(2)?,
                    description: row.get(3)?,
                    icon_url: row.get(4)?,
                    icon_gray_url: row.get(5)?,
                    hidden: row.get::<_, i32>(6)? != 0,
                    achieved: row.get::<_, i32>(7)? != 0,
                    unlock_time: row.get(8)?,
                    global_percent: row.get(9)?,
                };
                Ok((game_id, achievement))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(results)
    }

    /// Get the first session timestamp for each game (for new discoveries detection).
    pub fn get_first_session_per_game(&self) -> Result<Vec<(String, i64)>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT game_id, MIN(start_time) as first_played
             FROM game_sessions
             WHERE end_time IS NOT NULL
             GROUP BY game_id",
        )?;
        let results = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<(String, i64)>, _>>()?;
        Ok(results)
    }

    /// Bulk lookup game names by IDs.
    pub fn get_game_names_bulk(
        &self,
        game_ids: &[String],
    ) -> Result<Vec<(String, String)>, AppError> {
        if game_ids.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders: String = (1..=game_ids.len())
            .map(|i| format!("?{}", i))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT game_id, name FROM games WHERE game_id IN ({})",
            placeholders
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::types::ToSql> = game_ids
            .iter()
            .map(|id| id as &dyn rusqlite::types::ToSql)
            .collect();
        let results = stmt
            .query_map(params.as_slice(), |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<(String, String)>, _>>()?;
        Ok(results)
    }

    /// Bulk lookup genres from store_metadata by game IDs.
    /// Returns (game_id, genres_json_string) pairs.
    pub fn get_genres_for_games(
        &self,
        game_ids: &[String],
    ) -> Result<Vec<(String, String)>, AppError> {
        if game_ids.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders: String = (1..=game_ids.len())
            .map(|i| format!("?{}", i))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT game_id, genres FROM store_metadata WHERE game_id IN ({}) AND genres IS NOT NULL",
            placeholders
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::types::ToSql> = game_ids
            .iter()
            .map(|id| id as &dyn rusqlite::types::ToSql)
            .collect();
        let results = stmt
            .query_map(params.as_slice(), |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<(String, String)>, _>>()?;
        Ok(results)
    }

    // ── Recap CRUD ──────────────────────────────────────────────────

    /// Store a computed recap (insert or replace).
    pub fn save_recap(
        &self,
        period_key: &str,
        period_type: &str,
        data: &crate::models::recap::RecapData,
    ) -> Result<(), AppError> {
        let json = serde_json::to_string(data)
            .map_err(|e| AppError::Parse(format!("Failed to serialize recap: {}", e)))?;
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "INSERT OR REPLACE INTO recaps (period_key, period_type, encoded_data, generated_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![period_key, period_type, json, now],
        )?;
        Ok(())
    }

    /// Get a specific recap by period key.
    pub fn get_recap(
        &self,
        period_key: &str,
    ) -> Result<Option<crate::models::recap::RecapData>, AppError> {
        let result = self.conn.query_row(
            "SELECT encoded_data FROM recaps WHERE period_key = ?1",
            params![period_key],
            |row| {
                let json: String = row.get(0)?;
                Ok(json)
            },
        );
        match result {
            Ok(json) => {
                let data: crate::models::recap::RecapData = serde_json::from_str(&json)
                    .map_err(|e| AppError::Parse(format!("Failed to parse recap: {}", e)))?;
                Ok(Some(data))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// List all recap summaries, ordered by period_key descending.
    pub fn list_recaps(&self) -> Result<Vec<crate::models::recap::RecapSummary>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT period_key, period_type, generated_at, encoded_data
             FROM recaps ORDER BY period_key DESC",
        )?;
        let results: Vec<crate::models::recap::RecapSummary> = stmt
            .query_map([], |row| {
                let period_key: String = row.get(0)?;
                let period_type: String = row.get(1)?;
                let generated_at: i64 = row.get(2)?;
                let json: String = row.get(3)?;
                Ok((period_key, period_type, generated_at, json))
            })?
            .filter_map(|r| {
                let (period_key, period_type, generated_at, json) = r.ok()?;
                let data: crate::models::recap::RecapData = serde_json::from_str(&json).ok()?;
                Some(crate::models::recap::RecapSummary {
                    period_key,
                    period_type,
                    generated_at,
                    total_minutes: data.total_minutes,
                    top_game_name: data.top_game.name.clone(),
                })
            })
            .collect();
        Ok(results)
    }

    /// Delete a specific recap.
    pub fn delete_recap(&self, period_key: &str) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM recaps WHERE period_key = ?1",
            params![period_key],
        )?;
        Ok(())
    }

    // ── Tray helpers ──────────────────────────────────────────────

    /// Returns the N most recently played distinct games with their names.
    /// Only considers completed sessions (end_time IS NOT NULL).
    pub fn get_recently_played_games(&self, limit: u32) -> Result<Vec<(String, String)>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT gs.game_id, COALESCE(g.name, 'Unknown Game') as name
             FROM game_sessions gs
             JOIN games g ON gs.game_id = g.game_id
             WHERE gs.end_time IS NOT NULL
             GROUP BY gs.game_id
             ORDER BY MAX(gs.start_time) DESC
             LIMIT ?1",
        )?;
        let results = stmt
            .query_map(params![limit], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<(String, String)>, _>>()?;
        Ok(results)
    }

    /// Returns active sessions with game names: (game_id, name, start_time).
    pub fn get_active_sessions_with_names(&self) -> Result<Vec<(String, String, i64)>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT gs.game_id, COALESCE(g.name, 'Unknown Game'), gs.start_time
             FROM game_sessions gs
             JOIN games g ON gs.game_id = g.game_id
             WHERE gs.end_time IS NULL
             ORDER BY gs.start_time DESC",
        )?;
        let results = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
            .collect::<Result<Vec<(String, String, i64)>, _>>()?;
        Ok(results)
    }

    /// Returns (game_name, start_time) for the most recently started active game session.
    /// Used by conversation context to inject "Currently Playing" into the AI system prompt.
    pub fn get_active_game_session_context(&self) -> Result<Option<(String, i64)>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT g.name, gs.start_time
             FROM game_sessions gs
             JOIN games g ON gs.game_id = g.game_id
             WHERE gs.end_time IS NULL
             ORDER BY gs.start_time DESC
             LIMIT 1",
        )?;
        let result = stmt.query_row([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        });
        match result {
            Ok(pair) => Ok(Some(pair)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    // ── Tags ─────────────────────────────────────────────────────

    pub fn create_tag(&self, name: &str, color_index: u32) -> Result<Tag, AppError> {
        let max_order: i64 = self
            .conn
            .query_row("SELECT COALESCE(MAX(sort_order), -1) FROM tags", [], |r| {
                r.get(0)
            })
            .unwrap_or(-1);
        self.conn.execute(
            "INSERT INTO tags (name, color_index, sort_order) VALUES (?1, ?2, ?3)",
            params![name, color_index, max_order + 1],
        )?;
        let id = self.conn.last_insert_rowid();
        Ok(Tag {
            id,
            name: name.to_string(),
            color_index,
            sort_order: max_order + 1,
        })
    }

    pub fn get_all_tags(&self) -> Result<Vec<Tag>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, color_index, sort_order FROM tags ORDER BY sort_order")?;
        let tags = stmt
            .query_map([], |row| {
                Ok(Tag {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    color_index: row.get(2)?,
                    sort_order: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(tags)
    }

    pub fn update_tag(&self, id: i64, name: &str, color_index: u32) -> Result<(), AppError> {
        let changed = self.conn.execute(
            "UPDATE tags SET name = ?1, color_index = ?2 WHERE id = ?3",
            params![name, color_index, id],
        )?;
        if changed == 0 {
            return Err(AppError::NotFound(format!("Tag {} not found", id)));
        }
        Ok(())
    }

    pub fn delete_tag(&self, id: i64) -> Result<(), AppError> {
        self.conn
            .execute("DELETE FROM tags WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn reorder_tags(&self, tag_ids: &[i64]) -> Result<(), AppError> {
        let tx = self.conn.unchecked_transaction()?;
        for (i, id) in tag_ids.iter().enumerate() {
            tx.execute(
                "UPDATE tags SET sort_order = ?1 WHERE id = ?2",
                params![i as i64, id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn set_game_tags(&self, game_id: &str, tag_ids: &[i64]) -> Result<(), AppError> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("DELETE FROM game_tags WHERE game_id = ?1", params![game_id])?;
        for tag_id in tag_ids {
            tx.execute(
                "INSERT INTO game_tags (game_id, tag_id) VALUES (?1, ?2)",
                params![game_id, tag_id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_game_tag_ids(&self, game_id: &str) -> Result<Vec<i64>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT tag_id FROM game_tags WHERE game_id = ?1")?;
        let ids = stmt
            .query_map(params![game_id], |row| row.get(0))?
            .collect::<Result<Vec<i64>, _>>()?;
        Ok(ids)
    }

    pub fn get_all_game_tags(&self) -> Result<Vec<(String, i64)>, AppError> {
        let mut stmt = self.conn.prepare("SELECT game_id, tag_id FROM game_tags")?;
        let pairs = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<(String, i64)>, _>>()?;
        Ok(pairs)
    }

    pub fn bulk_set_game_tags(&self, game_ids: &[String], tag_ids: &[i64]) -> Result<(), AppError> {
        if game_ids.is_empty() || tag_ids.is_empty() {
            return Ok(());
        }
        let tx = self.conn.unchecked_transaction()?;
        let mut stmt =
            tx.prepare("INSERT OR IGNORE INTO game_tags (game_id, tag_id) VALUES (?1, ?2)")?;
        for game_id in game_ids {
            for &tag_id in tag_ids {
                stmt.execute(params![game_id, tag_id])?;
            }
        }
        drop(stmt);
        tx.commit()?;
        Ok(())
    }

    // ── Favorites ────────────────────────────────────────────────

    pub fn set_favorite(&self, game_id: &str, is_favorite: bool) -> Result<(), AppError> {
        if is_favorite {
            self.conn.execute(
                "INSERT OR IGNORE INTO favorites (game_id) VALUES (?1)",
                params![game_id],
            )?;
        } else {
            self.conn
                .execute("DELETE FROM favorites WHERE game_id = ?1", params![game_id])?;
        }
        Ok(())
    }

    pub fn get_all_favorites(&self) -> Result<Vec<String>, AppError> {
        let mut stmt = self.conn.prepare("SELECT game_id FROM favorites")?;
        let ids = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(ids)
    }

    // ── Hidden Games ────────────────────────────────────────────

    pub fn set_hidden(&self, game_id: &str, is_hidden: bool) -> Result<(), AppError> {
        if is_hidden {
            self.conn.execute(
                "INSERT OR IGNORE INTO hidden_games (game_id) VALUES (?1)",
                params![game_id],
            )?;
        } else {
            self.conn.execute(
                "DELETE FROM hidden_games WHERE game_id = ?1",
                params![game_id],
            )?;
        }
        Ok(())
    }

    pub fn get_all_hidden(&self) -> Result<Vec<String>, AppError> {
        let mut stmt = self.conn.prepare("SELECT game_id FROM hidden_games")?;
        let ids = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(ids)
    }

    // ── Saved Filters ───────────────────────────────────────────

    pub fn save_filter(
        &self,
        name: &str,
        filter_json: &str,
        sort_by: Option<&str>,
        sort_order: Option<&str>,
    ) -> Result<SavedFilterRow, AppError> {
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "INSERT INTO saved_filters (name, filter_json, sort_by, sort_order, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![name, filter_json, sort_by, sort_order, now],
        )?;
        let id = self.conn.last_insert_rowid();
        Ok(SavedFilterRow {
            id,
            name: name.to_string(),
            filter_json: filter_json.to_string(),
            sort_by: sort_by.map(|s| s.to_string()),
            sort_order: sort_order.map(|s| s.to_string()),
            created_at: now,
        })
    }

    pub fn get_all_saved_filters(&self) -> Result<Vec<SavedFilterRow>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, filter_json, sort_by, sort_order, created_at
             FROM saved_filters ORDER BY created_at",
        )?;
        let filters = stmt
            .query_map([], |row| {
                Ok(SavedFilterRow {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    filter_json: row.get(2)?,
                    sort_by: row.get(3)?,
                    sort_order: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(filters)
    }

    pub fn delete_saved_filter(&self, id: i64) -> Result<(), AppError> {
        self.conn
            .execute("DELETE FROM saved_filters WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ── Achievements ────────────────────────────────────────────────

    /// Returns all (game_id, appid) pairs for Steam games in the registry.
    pub fn get_all_steam_games(&self) -> Result<Vec<(String, u32)>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT game_id, source_id FROM games WHERE source = 'steam'")?;
        let games = stmt
            .query_map([], |row| {
                let game_id: String = row.get(0)?;
                let source_id: String = row.get(1)?;
                Ok((game_id, source_id))
            })?
            .filter_map(|r| {
                r.ok()
                    .and_then(|(gid, sid)| sid.parse::<u32>().ok().map(|appid| (gid, appid)))
            })
            .collect();
        Ok(games)
    }

    pub fn is_achievements_fresh(&self, game_id: &str) -> Result<bool, AppError> {
        let now = chrono::Utc::now().timestamp();
        let checked_at: Result<i64, _> = self.conn.query_row(
            "SELECT checked_at FROM game_achievement_freshness WHERE game_id = ?1",
            params![game_id],
            |row| row.get(0),
        );
        match checked_at {
            Ok(ts) => Ok((now - ts) < ACHIEVEMENT_TTL_SECS),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(false),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Record that we checked achievements for a game (even if it has none).
    pub fn mark_achievements_checked(&self, game_id: &str) -> Result<(), AppError> {
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "INSERT OR REPLACE INTO game_achievement_freshness (game_id, checked_at) VALUES (?1, ?2)",
            params![game_id, now],
        )?;
        Ok(())
    }

    pub fn cache_game_achievements(
        &self,
        game_id: &str,
        achievements: &[GameAchievement],
    ) -> Result<(), AppError> {
        let tx = self.conn.unchecked_transaction()?;
        let now = chrono::Utc::now().timestamp();
        // Clear old achievements for this game first
        tx.execute(
            "DELETE FROM game_achievements WHERE game_id = ?1",
            params![game_id],
        )?;

        let mut stmt = tx.prepare(
            "INSERT INTO game_achievements (game_id, api_name, display_name, description, icon_url, icon_gray_url, hidden, achieved, unlock_time, global_percent, cached_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        )?;

        for a in achievements {
            stmt.execute(params![
                game_id,
                a.api_name,
                a.display_name,
                a.description,
                a.icon_url,
                a.icon_gray_url,
                a.hidden as i32,
                a.achieved as i32,
                a.unlock_time,
                a.global_percent,
                now,
            ])?;
        }
        drop(stmt);
        tx.commit()?;
        Ok(())
    }

    pub fn get_game_achievements(&self, game_id: &str) -> Result<Vec<GameAchievement>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT api_name, display_name, description, icon_url, icon_gray_url, hidden, achieved, unlock_time, global_percent
             FROM game_achievements WHERE game_id = ?1",
        )?;
        let achievements = stmt
            .query_map(params![game_id], |row| {
                Ok(GameAchievement {
                    api_name: row.get(0)?,
                    display_name: row.get(1)?,
                    description: row.get(2)?,
                    icon_url: row.get(3)?,
                    icon_gray_url: row.get(4)?,
                    hidden: row.get::<_, i32>(5)? != 0,
                    achieved: row.get::<_, i32>(6)? != 0,
                    unlock_time: row.get(7)?,
                    global_percent: row.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(achievements)
    }

    /// Returns (game_id, total, unlocked) for all games with cached achievements.
    pub fn get_all_achievement_summaries(&self) -> Result<Vec<(String, u32, u32)>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT game_id, COUNT(*) as total, SUM(achieved) as unlocked
             FROM game_achievements GROUP BY game_id",
        )?;
        let summaries = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, u32>(1)?,
                    row.get::<_, u32>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(summaries)
    }

    /// Delete all cached achievement data and freshness markers.
    pub fn clear_achievement_cache(&self) -> Result<u32, AppError> {
        let deleted: usize = self.conn.execute("DELETE FROM game_achievements", [])?;
        self.conn
            .execute("DELETE FROM game_achievement_freshness", [])?;
        tracing::info!(deleted, "Achievement cache cleared");
        Ok(deleted as u32)
    }

    // ── Game News ───────────────────────────────────────────────────

    pub fn is_news_fresh(&self, game_id: &str) -> Result<bool, AppError> {
        let now = chrono::Utc::now().timestamp();
        let cached_at: Option<i64> = self.conn.query_row(
            "SELECT MIN(cached_at) FROM game_news WHERE game_id = ?1",
            params![game_id],
            |row| row.get(0),
        )?;
        match cached_at {
            Some(ts) => Ok((now - ts) < NEWS_TTL_SECS),
            None => Ok(false),
        }
    }

    pub fn cache_game_news(&self, game_id: &str, items: &[GameNewsItem]) -> Result<(), AppError> {
        let tx = self.conn.unchecked_transaction()?;
        let now = chrono::Utc::now().timestamp();
        // Clear old news for this game first
        tx.execute("DELETE FROM game_news WHERE game_id = ?1", params![game_id])?;

        let mut stmt = tx.prepare(
            "INSERT INTO game_news (game_id, news_id, title, url, author, contents, date, feed_label, is_external, cached_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        )?;

        for item in items {
            stmt.execute(params![
                game_id,
                item.news_id,
                item.title,
                item.url,
                item.author,
                item.contents,
                item.date,
                item.feed_label,
                item.is_external,
                now,
            ])?;
        }
        drop(stmt);
        tx.commit()?;
        Ok(())
    }

    /// Clear all cached news articles. Returns the number of rows deleted.
    pub fn clear_news_cache(&self) -> Result<u32, AppError> {
        let count = self.conn.execute("DELETE FROM game_news", [])?;
        tracing::info!(deleted = count, "News cache cleared");
        Ok(count as u32)
    }

    pub fn get_game_news(&self, game_id: &str) -> Result<Vec<GameNewsItem>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT news_id, title, url, author, contents, date, feed_label, is_external
             FROM game_news WHERE game_id = ?1 ORDER BY date DESC",
        )?;
        let items = stmt
            .query_map(params![game_id], |row| {
                Ok(GameNewsItem {
                    news_id: row.get(0)?,
                    game_id: game_id.to_string(),
                    title: row.get(1)?,
                    url: row.get(2)?,
                    author: row.get(3)?,
                    contents: row.get(4)?,
                    date: row.get(5)?,
                    feed_label: row.get(6)?,
                    is_external: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(items)
    }

    // ── News Read Tracking ──────────────────────────────────────────

    pub fn mark_news_read(&self, news_id: &str, game_id: &str) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT OR IGNORE INTO news_read (news_id, game_id) VALUES (?1, ?2)",
            params![news_id, game_id],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn mark_all_news_read_for_game(&self, game_id: &str) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT OR IGNORE INTO news_read (news_id, game_id)
             SELECT news_id, game_id FROM game_news WHERE game_id = ?1",
            params![game_id],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn is_news_read(&self, news_id: &str) -> Result<bool, AppError> {
        let count: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM news_read WHERE news_id = ?1",
            params![news_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn get_read_news_ids(&self, news_ids: &[String]) -> Result<HashSet<String>, AppError> {
        if news_ids.is_empty() {
            return Ok(HashSet::new());
        }
        let placeholders: String = news_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT news_id FROM news_read WHERE news_id IN ({})",
            placeholders
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let ids = stmt
            .query_map(rusqlite::params_from_iter(news_ids.iter()), |row| {
                row.get(0)
            })?
            .collect::<Result<HashSet<String>, _>>()?;
        Ok(ids)
    }

    pub fn get_unread_news_count(&self) -> Result<u32, AppError> {
        let count: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM game_news WHERE news_id NOT IN (SELECT news_id FROM news_read)",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// Return all distinct feed labels from the news cache, sorted alphabetically.
    pub fn get_news_sources(&self) -> Result<Vec<String>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT feed_label FROM game_news WHERE feed_label IS NOT NULL AND feed_label != '' ORDER BY feed_label",
        )?;
        let sources = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(sources)
    }

    /// Get all cached news items with game name, annotated with read status.
    #[allow(dead_code)]
    pub fn get_all_cached_news_with_read_status(
        &self,
    ) -> Result<Vec<(GameNewsItem, String, bool)>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT gn.news_id, gn.game_id, gn.title, gn.url, gn.author, gn.contents, gn.date, gn.feed_label, gn.is_external,
                    COALESCE(g.name, ''), (nr.news_id IS NOT NULL) as is_read
             FROM game_news gn
             LEFT JOIN games g ON g.game_id = gn.game_id
             LEFT JOIN news_read nr ON nr.news_id = gn.news_id
             ORDER BY gn.date DESC",
        )?;
        let rows = stmt
            .query_map([], |row| {
                let item = GameNewsItem {
                    news_id: row.get(0)?,
                    game_id: row.get(1)?,
                    title: row.get(2)?,
                    url: row.get(3)?,
                    author: row.get(4)?,
                    contents: row.get(5)?,
                    date: row.get(6)?,
                    feed_label: row.get(7)?,
                    is_external: row.get(8)?,
                };
                let game_name: String = row.get(9)?;
                let is_read: bool = row.get(10)?;
                Ok((item, game_name, is_read))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    // ── Game Notes ──────────────────────────────────────────────────

    /// Get a note for a specific game (or the __general__ scratchpad).
    pub fn get_game_note(&self, game_id: &str) -> Result<Option<GameNote>, AppError> {
        let result = self.conn.query_row(
            "SELECT game_id, content, updated_at FROM game_notes WHERE game_id = ?1",
            params![game_id],
            |row| {
                Ok(GameNote {
                    game_id: row.get(0)?,
                    content: row.get(1)?,
                    updated_at: row.get(2)?,
                })
            },
        );
        match result {
            Ok(note) => Ok(Some(note)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Save (upsert) a note for a game. Returns the saved note.
    pub fn save_game_note(&self, game_id: &str, content: &str) -> Result<GameNote, AppError> {
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "INSERT INTO game_notes (game_id, content, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(game_id) DO UPDATE SET content = ?2, updated_at = ?3",
            params![game_id, content, now],
        )?;
        Ok(GameNote {
            game_id: game_id.to_string(),
            content: content.to_string(),
            updated_at: now,
        })
    }

    /// Delete a note for a game.
    pub fn delete_game_note(&self, game_id: &str) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM game_notes WHERE game_id = ?1",
            params![game_id],
        )?;
        Ok(())
    }

    /// Get all notes joined with game names.
    /// Ensures the __general__ note always exists. Sorts general first, then by updated_at desc.
    pub fn get_all_notes_with_content(&self) -> Result<Vec<GameNoteWithName>, AppError> {
        // Ensure the general note always exists
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        self.conn.execute(
            "INSERT OR IGNORE INTO game_notes (game_id, content, updated_at) VALUES ('__general__', '', ?1)",
            params![now],
        )?;

        let mut stmt = self.conn.prepare(
            "SELECT n.game_id, n.content, n.updated_at, g.name
             FROM game_notes n
             LEFT JOIN games g ON g.game_id = n.game_id
             ORDER BY
               CASE WHEN n.game_id = '__general__' THEN 0 ELSE 1 END,
               n.updated_at DESC,
               n.game_id ASC",
        )?;
        let notes = stmt
            .query_map([], |row| {
                Ok(GameNoteWithName {
                    game_id: row.get(0)?,
                    content: row.get(1)?,
                    updated_at: row.get(2)?,
                    game_name: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(notes)
    }

    // ── Game Ratings ─────────────────────────────────────────────────

    pub fn get_game_rating(&self, game_id: &str) -> Result<Option<GameRating>, AppError> {
        let result = self.conn.query_row(
            "SELECT game_id, rating, review, updated_at FROM game_ratings WHERE game_id = ?1",
            params![game_id],
            |row| {
                Ok(GameRating {
                    game_id: row.get(0)?,
                    rating: row.get(1)?,
                    review: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            },
        );
        match result {
            Ok(r) => Ok(Some(r)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    pub fn save_game_rating(
        &self,
        game_id: &str,
        rating: u8,
        review: Option<&str>,
    ) -> Result<GameRating, AppError> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        self.conn.execute(
            "INSERT INTO game_ratings (game_id, rating, review, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(game_id) DO UPDATE SET rating = ?2, review = ?3, updated_at = ?4",
            params![game_id, rating, review, now],
        )?;
        Ok(GameRating {
            game_id: game_id.to_string(),
            rating,
            review: review.map(|s| s.to_string()),
            updated_at: now,
        })
    }

    pub fn delete_game_rating(&self, game_id: &str) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM game_ratings WHERE game_id = ?1",
            params![game_id],
        )?;
        Ok(())
    }

    pub fn get_all_ratings(&self) -> Result<Vec<GameRating>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT game_id, rating, review, updated_at FROM game_ratings
             ORDER BY updated_at DESC",
        )?;
        let ratings = stmt
            .query_map([], |row| {
                Ok(GameRating {
                    game_id: row.get(0)?,
                    rating: row.get(1)?,
                    review: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(ratings)
    }

    // ── Media Bookmarks ───────────────────────────────────────────────

    pub fn get_media_bookmarks(&self) -> Result<Vec<MediaBookmark>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, url, icon, sort_order, added_at
             FROM media_bookmarks ORDER BY sort_order ASC",
        )?;
        let bookmarks = stmt
            .query_map([], |row| {
                Ok(MediaBookmark {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    url: row.get(2)?,
                    icon: row.get(3)?,
                    sort_order: row.get(4)?,
                    added_at: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(bookmarks)
    }

    pub fn add_media_bookmark(
        &self,
        title: &str,
        url: &str,
        icon: Option<&str>,
    ) -> Result<MediaBookmark, AppError> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let max_order: i64 = self
            .conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) FROM media_bookmarks",
                [],
                |row| row.get(0),
            )
            .unwrap_or(-1);

        self.conn.execute(
            "INSERT INTO media_bookmarks (title, url, icon, sort_order, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![title, url, icon, max_order + 1, now],
        )?;

        let id = self.conn.last_insert_rowid();
        Ok(MediaBookmark {
            id,
            title: title.to_string(),
            url: url.to_string(),
            icon: icon.map(|s| s.to_string()),
            sort_order: max_order + 1,
            added_at: now,
        })
    }

    pub fn update_media_bookmark(
        &self,
        id: i64,
        title: &str,
        url: &str,
        icon: Option<&str>,
    ) -> Result<(), AppError> {
        let rows = self.conn.execute(
            "UPDATE media_bookmarks SET title = ?1, url = ?2, icon = ?3 WHERE id = ?4",
            params![title, url, icon, id],
        )?;
        if rows == 0 {
            return Err(AppError::NotFound(format!(
                "Media bookmark {} not found",
                id
            )));
        }
        Ok(())
    }

    pub fn delete_media_bookmark(&self, id: i64) -> Result<(), AppError> {
        self.conn
            .execute("DELETE FROM media_bookmarks WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn reorder_media_bookmarks(&self, bookmark_ids: &[i64]) -> Result<(), AppError> {
        let tx = self.conn.unchecked_transaction()?;
        for (idx, id) in bookmark_ids.iter().enumerate() {
            tx.execute(
                "UPDATE media_bookmarks SET sort_order = ?1 WHERE id = ?2",
                params![idx as i64, id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    // ── AI Context Queries ─────────────────────────────────────────

    /// Get all game names for AI context: `(game_id, name)`.
    pub fn get_all_game_names(&self) -> Result<Vec<(String, String)>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT game_id, name FROM games WHERE name IS NOT NULL")?;
        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<(String, String)>, _>>()?;
        Ok(rows)
    }

    /// Get all games with their genres and Steam tags for rich AI context.
    /// Returns `(game_id, name, genres_json, steam_tags_json)`.
    /// Get all games with their genres, tags, playtime hours, and last-played timestamp.
    /// Returns `(game_id, name, genres_json, tags_json, playtime_hours, last_played_ts)`.
    /// Playtime is only included for Steam games — non-Steam sources lack
    /// reliable total-playtime data so they report 0.
    /// Last-played is the best timestamp from either Steam metadata or session tracking.
    pub fn get_games_with_genre_tags(&self) -> Result<Vec<GameGenreTagRow>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT g.game_id, g.name, sm.genres, sm.steam_tags,
                    CASE WHEN g.source = 'steam'
                         THEN COALESCE(ps.playtime_minutes, 0) / 60.0
                         ELSE COALESCE(g.manual_playtime_minutes, 0) / 60.0
                    END as hours,
                    MAX(g.last_played, sess.last_session) as last_played_ts
             FROM games g
             LEFT JOIN store_metadata sm ON g.game_id = sm.game_id
             LEFT JOIN (
                 SELECT game_id, MAX(playtime_minutes) as playtime_minutes
                 FROM playtime_snapshots
                 GROUP BY game_id
             ) ps ON g.game_id = ps.game_id
             LEFT JOIN (
                 SELECT game_id, MAX(start_time) as last_session
                 FROM game_sessions
                 GROUP BY game_id
             ) sess ON g.game_id = sess.game_id
             WHERE g.name IS NOT NULL",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Get distinct genres across all cached metadata: `(genre_id, genre_name)`.
    pub fn get_distinct_genres(&self) -> Result<Vec<(String, String)>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT genres FROM store_metadata WHERE genres IS NOT NULL")?;
        let mut seen = std::collections::HashSet::new();
        let mut result = Vec::new();
        let rows = stmt.query_map([], |row| {
            let json: String = row.get(0)?;
            Ok(json)
        })?;
        for row in rows {
            let json = row?;
            if let Ok(genres) = serde_json::from_str::<Vec<GenreInfo>>(&json) {
                for g in genres {
                    if seen.insert(g.id.clone()) {
                        result.push((g.id, g.description));
                    }
                }
            }
        }
        Ok(result)
    }

    /// Get distinct Steam community tags across all cached metadata.
    pub fn get_distinct_steam_tags(&self) -> Result<Vec<String>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT steam_tags FROM store_metadata WHERE steam_tags IS NOT NULL")?;
        let mut seen = std::collections::HashSet::new();
        let mut result = Vec::new();
        let rows = stmt.query_map([], |row| {
            let json: String = row.get(0)?;
            Ok(json)
        })?;
        for row in rows {
            let json = row?;
            if let Ok(tags) = serde_json::from_str::<Vec<SteamTagInfo>>(&json) {
                for t in tags {
                    if seen.insert(t.name.clone()) {
                        result.push(t.name);
                    }
                }
            }
        }
        Ok(result)
    }

    // ── Cloud AI Context Queries ──────────────────────────────────

    /// Get game counts grouped by source: `(source_name, count)`.
    pub fn get_game_count_by_source(&self) -> Result<Vec<(String, u32)>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT source, COUNT(*) FROM games GROUP BY source ORDER BY COUNT(*) DESC")?;
        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get::<_, u32>(1)?)))?
            .collect::<Result<Vec<(String, u32)>, _>>()?;
        Ok(rows)
    }

    /// Get the top N games by total playtime: `(game_id, name, hours)`.
    /// Combines Steam playtime snapshots with manual playtime for non-Steam games.
    pub fn get_top_games_by_playtime(
        &self,
        limit: usize,
    ) -> Result<Vec<(String, String, f64)>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT g.game_id, g.name,
                    (COALESCE(ps.playtime_minutes, 0) + COALESCE(g.manual_playtime_minutes, 0)) / 60.0 as hours
             FROM games g
             LEFT JOIN (
                 SELECT game_id, MAX(playtime_minutes) as playtime_minutes
                 FROM playtime_snapshots
                 GROUP BY game_id
             ) ps ON g.game_id = ps.game_id
             WHERE g.name IS NOT NULL
               AND (COALESCE(ps.playtime_minutes, 0) + COALESCE(g.manual_playtime_minutes, 0)) > 0
             ORDER BY hours DESC
             LIMIT ?1",
        )?;
        let rows = stmt
            .query_map(params![limit as u32], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?
            .collect::<Result<Vec<(String, String, f64)>, _>>()?;
        Ok(rows)
    }

    /// Get recently played games (completed sessions only): `(game_id, name)`.
    pub fn get_recently_played_game_names(
        &self,
        limit: usize,
    ) -> Result<Vec<(String, String)>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT gs.game_id, COALESCE(g.name, 'Unknown Game') as name
             FROM game_sessions gs
             JOIN games g ON gs.game_id = g.game_id
             WHERE gs.end_time IS NOT NULL
             GROUP BY gs.game_id
             ORDER BY MAX(gs.start_time) DESC
             LIMIT ?1",
        )?;
        let rows = stmt
            .query_map(params![limit as u32], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<(String, String)>, _>>()?;
        Ok(rows)
    }

    /// Get favorite games (up to limit): `(game_id, name)`.
    pub fn get_favorite_game_names(&self, limit: usize) -> Result<Vec<(String, String)>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT f.game_id, COALESCE(g.name, 'Unknown Game')
             FROM favorites f
             JOIN games g ON f.game_id = g.game_id
             WHERE g.name IS NOT NULL
             ORDER BY g.name
             LIMIT ?1",
        )?;
        let rows = stmt
            .query_map(params![limit as u32], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<(String, String)>, _>>()?;
        Ok(rows)
    }

    /// Get game IDs for installed games (those with a known install_path).
    pub fn get_installed_game_ids(&self) -> Result<Vec<String>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT game_id FROM games WHERE install_path IS NOT NULL")?;
        let rows = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(rows)
    }

    /// Get game IDs for games played within the last N days (based on sessions).
    pub fn get_recently_played_game_ids(&self, days: u32) -> Result<Vec<String>, AppError> {
        let cutoff = chrono::Utc::now().timestamp() - (days as i64 * 86400);
        // Combine session tracking data AND the Steam last_played timestamp
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT game_id FROM (
                SELECT gs.game_id FROM game_sessions gs WHERE gs.start_time > ?1
                UNION
                SELECT g.game_id FROM games g WHERE g.last_played IS NOT NULL AND g.last_played > ?1
            )",
        )?;
        let rows = stmt
            .query_map(params![cutoff], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(rows)
    }

    /// Get genre distribution: `(genre_name, game_count)` sorted by count descending.
    #[allow(dead_code)]
    pub fn get_genre_distribution(&self) -> Result<Vec<(String, u32)>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT genres FROM store_metadata WHERE genres IS NOT NULL")?;
        let mut genre_counts: std::collections::HashMap<String, u32> =
            std::collections::HashMap::new();
        let rows = stmt.query_map([], |row| {
            let json: String = row.get(0)?;
            Ok(json)
        })?;
        for row in rows {
            let json = row?;
            if let Ok(genres) = serde_json::from_str::<Vec<GenreInfo>>(&json) {
                for g in genres {
                    *genre_counts.entry(g.description).or_insert(0) += 1;
                }
            }
        }
        let mut result: Vec<(String, u32)> = genre_counts.into_iter().collect();
        result.sort_by(|a, b| b.1.cmp(&a.1));
        Ok(result)
    }

    /// Get distinct categories (features) across all cached metadata: `(id, description)`.
    pub fn get_distinct_categories(&self) -> Result<Vec<(u32, String)>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT categories FROM store_metadata WHERE categories IS NOT NULL")?;
        let mut seen = std::collections::HashSet::new();
        let mut result = Vec::new();
        let rows = stmt.query_map([], |row| {
            let json: String = row.get(0)?;
            Ok(json)
        })?;
        for row in rows {
            let json = row?;
            if let Ok(cats) = serde_json::from_str::<Vec<CategoryInfo>>(&json) {
                for c in cats {
                    if seen.insert(c.id) {
                        result.push((c.id, c.description));
                    }
                }
            }
        }
        Ok(result)
    }

    // ── Backup helpers ────────────────────────────────────────────

    /// Flush WAL data into the main database file so a raw file copy is consistent.
    pub fn checkpoint_wal(&self) -> Result<(), AppError> {
        self.conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")?;
        Ok(())
    }

    /// Return the current database schema version.
    pub fn schema_version(&self) -> Result<u32, AppError> {
        let version: u32 = self.conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )?;
        Ok(version)
    }

    /// Replace the live database file with a restored copy.
    ///
    /// Opens an in-memory connection first (releasing the file lock on the live
    /// DB), copies the restored file into place, then reopens the live path with
    /// the standard WAL/FK pragmas.  The caller **must** hold the `CacheDbHandle`
    /// Mutex for the entire operation.
    pub fn swap_database(
        &mut self,
        restored_db_path: &Path,
        live_db_path: &Path,
    ) -> Result<(), AppError> {
        // Release the file lock by switching to an in-memory connection
        self.conn = Connection::open_in_memory()?;

        // Overwrite the live database file with the restored copy
        std::fs::copy(restored_db_path, live_db_path)?;

        // Reopen the real database
        let conn = Connection::open(live_db_path)?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
        )?;
        self.conn = conn;
        Ok(())
    }

    // ── AI Personality CRUD ─────────────────────────────────────────

    /// List all AI personalities, built-in first then custom alphabetically.
    pub fn list_ai_personalities(&self) -> Result<Vec<AiPersonality>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, prompt_text, is_builtin, created_at
             FROM ai_personalities
             ORDER BY is_builtin DESC, name ASC",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(AiPersonality {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    prompt_text: row.get(2)?,
                    is_builtin: row.get::<_, i32>(3)? != 0,
                    created_at: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Create a custom AI personality.
    pub fn create_ai_personality(
        &self,
        name: &str,
        prompt_text: &str,
    ) -> Result<AiPersonality, AppError> {
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO ai_personalities (id, name, prompt_text, is_builtin, created_at)
             VALUES (?1, ?2, ?3, 0, datetime('now'))",
            params![id, name, prompt_text],
        ).map_err(|e| {
            if let rusqlite::Error::SqliteFailure(err, _) = &e {
                if err.code == rusqlite::ErrorCode::ConstraintViolation {
                    return AppError::Validation(
                        "A personality with that name already exists. Please choose a different name.".into(),
                    );
                }
            }
            AppError::Database(e)
        })?;
        let created_at: String = self.conn.query_row(
            "SELECT created_at FROM ai_personalities WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        Ok(AiPersonality {
            id,
            name: name.to_string(),
            prompt_text: prompt_text.to_string(),
            is_builtin: false,
            created_at,
        })
    }

    /// Delete a custom AI personality. Rejects built-in personalities and
    /// personalities currently referenced by any avatar.
    pub fn delete_ai_personality(&self, id: &str) -> Result<(), AppError> {
        // Check exists and is custom
        let is_builtin: bool = self
            .conn
            .query_row(
                "SELECT is_builtin FROM ai_personalities WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    AppError::NotFound(format!("Personality not found: {}", id))
                }
                other => AppError::Database(other),
            })?;

        if is_builtin {
            return Err(AppError::Validation(
                "Cannot delete built-in personalities".into(),
            ));
        }

        // Check not in use
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM ai_avatars WHERE personality_id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        if count > 0 {
            return Err(AppError::Validation(
                "Cannot delete a personality that is in use by an avatar".into(),
            ));
        }

        self.conn.execute(
            "DELETE FROM ai_personalities WHERE id = ?1 AND is_builtin = 0",
            params![id],
        )?;
        Ok(())
    }

    // ── AI Companion Role CRUD ─────────────────────────────────────

    /// List all companion roles: built-in (from static list) + custom (from DB).
    pub fn list_ai_companion_roles(&self) -> Result<Vec<CompanionRolePreset>, AppError> {
        let mut roles = companion_role_presets(); // built-in

        // Add custom roles from DB if table exists
        let table_exists: bool = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ai_companion_roles'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .unwrap_or(false);

        if table_exists {
            let mut stmt = self.conn.prepare(
                "SELECT id, name, description, system_prompt_text
                 FROM ai_companion_roles
                 ORDER BY name ASC",
            )?;
            let custom_rows = stmt
                .query_map([], |row| {
                    Ok(CompanionRolePreset {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        description: row.get(2)?,
                        system_prompt_text: row.get(3)?,
                        is_builtin: false,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            roles.extend(custom_rows);
        }

        Ok(roles)
    }

    /// Create a custom companion role. Stored in ai_companion_roles table.
    pub fn create_ai_companion_role(
        &self,
        name: &str,
        description: &str,
        system_prompt_text: &str,
    ) -> Result<CompanionRolePreset, AppError> {
        // Ensure table exists
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS ai_companion_roles (
                id                TEXT PRIMARY KEY,
                name              TEXT NOT NULL,
                description       TEXT NOT NULL,
                system_prompt_text TEXT NOT NULL,
                created_at        TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )?;

        let id = Uuid::new_v4().to_string();
        self.conn
            .execute(
                "INSERT INTO ai_companion_roles (id, name, description, system_prompt_text)
                 VALUES (?1, ?2, ?3, ?4)",
                params![id, name, description, system_prompt_text],
            )
            .map_err(|e| {
                if let rusqlite::Error::SqliteFailure(err, _) = &e {
                    if err.code == rusqlite::ErrorCode::ConstraintViolation {
                        return AppError::Validation(
                            "A companion role with that name already exists.".into(),
                        );
                    }
                }
                AppError::Database(e)
            })?;

        Ok(CompanionRolePreset {
            id,
            name: name.to_string(),
            description: description.to_string(),
            system_prompt_text: system_prompt_text.to_string(),
            is_builtin: false,
        })
    }

    /// Delete a custom companion role. Rejects built-in roles and roles
    /// currently referenced by any avatar.
    pub fn delete_ai_companion_role(&self, id: &str) -> Result<(), AppError> {
        // Check it's not a built-in role
        let builtins = companion_role_presets();
        if builtins.iter().any(|r| r.id == id) {
            return Err(AppError::Validation(
                "Cannot delete built-in companion roles".into(),
            ));
        }

        // Check not in use by any avatar
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM ai_avatars WHERE companion_role_id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        if count > 0 {
            return Err(AppError::Validation(
                "Cannot delete a companion role that is in use by an avatar".into(),
            ));
        }

        let deleted = self
            .conn
            .execute("DELETE FROM ai_companion_roles WHERE id = ?1", params![id])?;
        if deleted == 0 {
            return Err(AppError::NotFound(format!(
                "Companion role not found: {}",
                id
            )));
        }
        Ok(())
    }

    // ── AI Avatar CRUD ──────────────────────────────────────────────

    /// List all AI avatars, active first then by creation date.
    pub fn list_ai_avatars(&self) -> Result<Vec<AiAvatar>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, personality_id, image_path, companion_role_id,
                    companion_role_custom, is_active, created_at,
                    cross_avatar_memory_access, cross_avatar_memory_private
             FROM ai_avatars
             ORDER BY is_active DESC, created_at ASC",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(AiAvatar {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    personality_id: row.get(2)?,
                    image_path: row.get(3)?,
                    companion_role_id: row.get(4)?,
                    companion_role_custom: row.get(5)?,
                    is_active: row.get::<_, i32>(6)? != 0,
                    created_at: row.get(7)?,
                    cross_avatar_memory_access: row.get::<_, i32>(8).unwrap_or(1) != 0,
                    cross_avatar_memory_private: row.get::<_, i32>(9).unwrap_or(0) != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Get the currently active AI avatar, if any.
    pub fn get_active_ai_avatar(&self) -> Result<Option<AiAvatar>, AppError> {
        let result = self.conn.query_row(
            "SELECT id, name, personality_id, image_path, companion_role_id,
                    companion_role_custom, is_active, created_at,
                    cross_avatar_memory_access, cross_avatar_memory_private
             FROM ai_avatars WHERE is_active = 1",
            [],
            |row| {
                Ok(AiAvatar {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    personality_id: row.get(2)?,
                    image_path: row.get(3)?,
                    companion_role_id: row.get(4)?,
                    companion_role_custom: row.get(5)?,
                    is_active: true,
                    created_at: row.get(7)?,
                    cross_avatar_memory_access: row.get::<_, i32>(8).unwrap_or(1) != 0,
                    cross_avatar_memory_private: row.get::<_, i32>(9).unwrap_or(0) != 0,
                })
            },
        );
        match result {
            Ok(avatar) => Ok(Some(avatar)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Create a new AI avatar linked to a personality.
    pub fn create_ai_avatar(
        &self,
        name: &str,
        personality_id: &str,
        companion_role_id: Option<&str>,
        companion_role_custom: Option<&str>,
        image_path: Option<&str>,
    ) -> Result<AiAvatar, AppError> {
        // Validate personality exists
        let exists: bool = self
            .conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM ai_personalities WHERE id = ?1",
                params![personality_id],
                |row| row.get(0),
            )
            .unwrap_or(false);
        if !exists {
            return Err(AppError::NotFound(format!(
                "Personality '{}' not found",
                personality_id
            )));
        }

        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO ai_avatars (id, name, personality_id, image_path, companion_role_id,
                                     companion_role_custom, is_active, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, datetime('now'))",
            params![id, name, personality_id, image_path, companion_role_id, companion_role_custom],
        ).map_err(|e| {
            if let rusqlite::Error::SqliteFailure(err, _) = &e {
                if err.code == rusqlite::ErrorCode::ConstraintViolation {
                    return AppError::Validation(
                        "An avatar with that name already exists. Please choose a different name.".into(),
                    );
                }
            }
            AppError::Database(e)
        })?;
        let created_at: String = self.conn.query_row(
            "SELECT created_at FROM ai_avatars WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        Ok(AiAvatar {
            id,
            name: name.to_string(),
            personality_id: personality_id.to_string(),
            image_path: image_path.map(|s| s.to_string()),
            companion_role_id: companion_role_id.map(|s| s.to_string()),
            companion_role_custom: companion_role_custom.map(|s| s.to_string()),
            is_active: false,
            created_at,
            cross_avatar_memory_access: true,
            cross_avatar_memory_private: false,
        })
    }

    /// Update an existing AI avatar's mutable fields.
    /// Only non-None fields are updated. Returns the updated avatar.
    pub fn update_ai_avatar(
        &self,
        avatar_id: &str,
        name: Option<&str>,
        personality_id: Option<&str>,
        image_path: Option<Option<&str>>,
        companion_role_id: Option<Option<&str>>,
        companion_role_custom: Option<Option<&str>>,
        cross_avatar_memory_access: Option<bool>,
        cross_avatar_memory_private: Option<bool>,
    ) -> Result<AiAvatar, AppError> {
        // Build dynamic SET clauses
        let mut sets: Vec<String> = Vec::new();
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(n) = name {
            sets.push(format!("name = ?{}", sets.len() + 1));
            param_values.push(Box::new(n.to_string()));
        }
        if let Some(pid) = personality_id {
            sets.push(format!("personality_id = ?{}", sets.len() + 1));
            param_values.push(Box::new(pid.to_string()));
        }
        if let Some(ip) = image_path {
            sets.push(format!("image_path = ?{}", sets.len() + 1));
            param_values.push(Box::new(ip.map(|s| s.to_string())));
        }
        if let Some(rid) = companion_role_id {
            sets.push(format!("companion_role_id = ?{}", sets.len() + 1));
            param_values.push(Box::new(rid.map(|s| s.to_string())));
        }
        if let Some(rc) = companion_role_custom {
            sets.push(format!("companion_role_custom = ?{}", sets.len() + 1));
            param_values.push(Box::new(rc.map(|s| s.to_string())));
        }
        if let Some(access) = cross_avatar_memory_access {
            sets.push(format!("cross_avatar_memory_access = ?{}", sets.len() + 1));
            param_values.push(Box::new(access as i32));
        }
        if let Some(private) = cross_avatar_memory_private {
            sets.push(format!("cross_avatar_memory_private = ?{}", sets.len() + 1));
            param_values.push(Box::new(private as i32));
        }

        if sets.is_empty() {
            // Nothing to update — just return current avatar
            return self.get_ai_avatar_by_id(avatar_id);
        }

        let idx = sets.len() + 1;
        let sql = format!(
            "UPDATE ai_avatars SET {} WHERE id = ?{}",
            sets.join(", "),
            idx
        );
        param_values.push(Box::new(avatar_id.to_string()));

        let params_ref: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();

        let updated = self.conn.execute(&sql, params_ref.as_slice())?;
        if updated == 0 {
            return Err(AppError::NotFound(format!(
                "Avatar '{}' not found",
                avatar_id
            )));
        }

        self.get_ai_avatar_by_id(avatar_id)
    }

    /// Get a single AI avatar by ID.
    pub fn get_ai_avatar_by_id(&self, avatar_id: &str) -> Result<AiAvatar, AppError> {
        let result = self.conn.query_row(
            "SELECT id, name, personality_id, image_path, companion_role_id,
                    companion_role_custom, is_active, created_at,
                    cross_avatar_memory_access, cross_avatar_memory_private
             FROM ai_avatars WHERE id = ?1",
            params![avatar_id],
            |row| {
                Ok(AiAvatar {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    personality_id: row.get(2)?,
                    image_path: row.get(3)?,
                    companion_role_id: row.get(4)?,
                    companion_role_custom: row.get(5)?,
                    is_active: row.get::<_, i32>(6)? != 0,
                    created_at: row.get(7)?,
                    cross_avatar_memory_access: row.get::<_, i32>(8).unwrap_or(1) != 0,
                    cross_avatar_memory_private: row.get::<_, i32>(9).unwrap_or(0) != 0,
                })
            },
        );
        match result {
            Ok(avatar) => Ok(avatar),
            Err(rusqlite::Error::QueryReturnedNoRows) => Err(AppError::NotFound(format!(
                "Avatar '{}' not found",
                avatar_id
            ))),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Clear image_path on all avatars referencing a given sprite filename.
    pub fn clear_avatar_sprite(&self, filename: &str) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE ai_avatars SET image_path = NULL WHERE image_path = ?1",
            params![filename],
        )?;
        Ok(())
    }

    /// Update image_path on all avatars referencing a sprite that was renamed.
    pub fn update_avatar_sprite_references(
        &self,
        old_filename: &str,
        new_filename: &str,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE ai_avatars SET image_path = ?1 WHERE image_path = ?2",
            params![new_filename, old_filename],
        )?;
        Ok(())
    }

    /// Switch the active avatar. Deactivates all, then activates the specified one.
    pub fn switch_ai_avatar(&self, avatar_id: &str) -> Result<(), AppError> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("UPDATE ai_avatars SET is_active = 0", [])?;
        let updated = tx.execute(
            "UPDATE ai_avatars SET is_active = 1 WHERE id = ?1",
            params![avatar_id],
        )?;
        if updated == 0 {
            tx.rollback().ok();
            return Err(AppError::NotFound(format!(
                "Avatar '{}' not found",
                avatar_id
            )));
        }
        tx.commit()?;
        Ok(())
    }

    // ── AI Memory CRUD (raw — content is encrypted) ─────────────────

    /// Get active system memories for an avatar (ordered by creation date).
    pub fn get_active_system_memories_raw(
        &self,
        avatar_id: &str,
    ) -> Result<Vec<AiMemoryRow>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, avatar_id, conversation_id, content, importance, category,
                    is_system, created_at, last_referenced, superseded_by, active
             FROM ai_memories
             WHERE avatar_id = ?1 AND active = 1 AND is_system = 1
             ORDER BY created_at ASC",
        )?;
        let rows = stmt
            .query_map(params![avatar_id], |row| {
                Ok(AiMemoryRow {
                    id: row.get(0)?,
                    avatar_id: row.get(1)?,
                    conversation_id: row.get(2)?,
                    content: row.get(3)?,
                    importance: row.get(4)?,
                    category: row.get(5)?,
                    is_system: row.get::<_, i32>(6)? != 0,
                    created_at: row.get(7)?,
                    last_referenced: row.get(8)?,
                    superseded_by: row.get(9)?,
                    active: row.get::<_, i32>(10)? != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Get active vault (non-system) memories for an avatar, ordered by importance DESC.
    pub fn get_active_vault_memories_raw(
        &self,
        avatar_id: &str,
        limit: u32,
    ) -> Result<Vec<AiMemoryRow>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, avatar_id, conversation_id, content, importance, category,
                    is_system, created_at, last_referenced, superseded_by, active
             FROM ai_memories
             WHERE avatar_id = ?1 AND active = 1 AND is_system = 0
             ORDER BY importance DESC
             LIMIT ?2",
        )?;
        let rows = stmt
            .query_map(params![avatar_id, limit], |row| {
                Ok(AiMemoryRow {
                    id: row.get(0)?,
                    avatar_id: row.get(1)?,
                    conversation_id: row.get(2)?,
                    content: row.get(3)?,
                    importance: row.get(4)?,
                    category: row.get(5)?,
                    is_system: row.get::<_, i32>(6)? != 0,
                    created_at: row.get(7)?,
                    last_referenced: row.get(8)?,
                    superseded_by: row.get(9)?,
                    active: row.get::<_, i32>(10)? != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Get high-importance memories from OTHER avatars (for cross-avatar sharing).
    pub fn get_cross_avatar_memories_raw(
        &self,
        avatar_id: &str,
        limit: u32,
    ) -> Result<Vec<(AiMemoryRow, String)>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT m.id, m.avatar_id, m.conversation_id, m.content, m.importance, m.category,
                    m.is_system, m.created_at, m.last_referenced, m.superseded_by, m.active,
                    a.name
             FROM ai_memories m
             JOIN ai_avatars a ON m.avatar_id = a.id
             WHERE m.avatar_id != ?1 AND m.active = 1 AND m.importance >= 6 AND m.is_system = 0
               AND COALESCE(a.cross_avatar_memory_private, 0) = 0
             ORDER BY m.importance DESC
             LIMIT ?2",
        )?;
        let rows = stmt
            .query_map(params![avatar_id, limit], |row| {
                let mem = AiMemoryRow {
                    id: row.get(0)?,
                    avatar_id: row.get(1)?,
                    conversation_id: row.get(2)?,
                    content: row.get(3)?,
                    importance: row.get(4)?,
                    category: row.get(5)?,
                    is_system: row.get::<_, i32>(6)? != 0,
                    created_at: row.get(7)?,
                    last_referenced: row.get(8)?,
                    superseded_by: row.get(9)?,
                    active: row.get::<_, i32>(10)? != 0,
                };
                let avatar_name: String = row.get(11)?;
                Ok((mem, avatar_name))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Get all active memories for an avatar (system + vault), ordered by importance DESC.
    pub fn get_all_active_memories_raw(
        &self,
        avatar_id: &str,
    ) -> Result<Vec<AiMemoryRow>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, avatar_id, conversation_id, content, importance, category,
                    is_system, created_at, last_referenced, superseded_by, active
             FROM ai_memories
             WHERE avatar_id = ?1 AND active = 1
             ORDER BY importance DESC",
        )?;
        let rows = stmt
            .query_map(params![avatar_id], |row| {
                Ok(AiMemoryRow {
                    id: row.get(0)?,
                    avatar_id: row.get(1)?,
                    conversation_id: row.get(2)?,
                    content: row.get(3)?,
                    importance: row.get(4)?,
                    category: row.get(5)?,
                    is_system: row.get::<_, i32>(6)? != 0,
                    created_at: row.get(7)?,
                    last_referenced: row.get(8)?,
                    superseded_by: row.get(9)?,
                    active: row.get::<_, i32>(10)? != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Insert a new AI memory (content should already be encrypted by the caller).
    pub fn insert_ai_memory_raw(
        &self,
        avatar_id: &str,
        content_encrypted: &str,
        importance: u32,
        category: &str,
        conversation_id: Option<&str>,
        is_system: bool,
    ) -> Result<String, AppError> {
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO ai_memories (id, avatar_id, conversation_id, content, importance,
             category, is_system, created_at, active)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), 1)",
            params![
                id,
                avatar_id,
                conversation_id,
                content_encrypted,
                importance,
                category,
                is_system as i32
            ],
        )?;
        Ok(id)
    }

    /// Mark a memory as superseded by a newer memory.
    #[allow(dead_code)]
    pub fn mark_memory_superseded(&self, old_id: &str, new_id: &str) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE ai_memories SET active = 0, superseded_by = ?1 WHERE id = ?2",
            params![new_id, old_id],
        )?;
        Ok(())
    }

    /// Soft-delete a memory by marking it inactive.
    /// Used internally by batch operations and tests; user-facing deletion
    /// should go through `soft_delete_user_memory` which guards system memories.
    #[allow(dead_code)]
    pub fn soft_delete_memory(&self, memory_id: &str) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE ai_memories SET active = 0 WHERE id = ?1",
            params![memory_id],
        )?;
        Ok(())
    }

    /// Soft-delete a user memory, guarding against system memory deletion.
    pub fn soft_delete_user_memory(&self, memory_id: &str) -> Result<(), AppError> {
        let updated = self.conn.execute(
            "UPDATE ai_memories SET active = 0 WHERE id = ?1 AND is_system = 0",
            params![memory_id],
        )?;
        if updated == 0 {
            return Err(AppError::Validation(
                "Memory not found or is a protected system memory".into(),
            ));
        }
        Ok(())
    }

    /// Soft-delete a batch of memories in a single statement (used by pruning).
    pub fn soft_delete_memories_batch(&self, ids: &[String]) -> Result<(), AppError> {
        if ids.is_empty() {
            return Ok(());
        }
        let placeholders = vec!["?"; ids.len()].join(", ");
        let sql = format!(
            "UPDATE ai_memories SET active = 0 WHERE id IN ({})",
            placeholders
        );
        let params: Vec<&dyn rusqlite::ToSql> =
            ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        self.conn.execute(&sql, params.as_slice())?;
        Ok(())
    }

    /// Count journal (daily log) entries for an avatar.
    pub fn count_avatar_journal_entries(&self, avatar_id: &str) -> Result<u32, AppError> {
        let count: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM ai_daily_log WHERE avatar_id = ?1",
            params![avatar_id],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// Count active non-system memories for an avatar.
    pub fn count_active_vault_memories(&self, avatar_id: &str) -> Result<u32, AppError> {
        let count: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM ai_memories WHERE avatar_id = ?1 AND active = 1 AND is_system = 0",
            params![avatar_id],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// Get IDs of the lowest-value active vault memories for pruning.
    /// Ranks by importance (primary), then by recency — memories that were never
    /// referenced and are old get pruned first. Uses `COALESCE(last_referenced,
    /// created_at)` so unreferenced memories sort by creation date.
    pub fn get_lowest_importance_memories(
        &self,
        avatar_id: &str,
        limit: u32,
    ) -> Result<Vec<String>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM ai_memories
             WHERE avatar_id = ?1 AND active = 1 AND is_system = 0
             ORDER BY importance ASC, COALESCE(last_referenced, created_at) ASC
             LIMIT ?2",
        )?;
        let ids = stmt
            .query_map(params![avatar_id, limit], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(ids)
    }

    /// Hard-delete inactive (superseded) memories older than `before` date.
    /// Returns the number of rows deleted.
    pub fn hard_delete_old_inactive_memories(
        &self,
        avatar_id: &str,
        before: &str,
    ) -> Result<u32, AppError> {
        let deleted = self.conn.execute(
            "DELETE FROM ai_memories
             WHERE avatar_id = ?1 AND active = 0 AND created_at < ?2",
            params![avatar_id, before],
        )?;
        Ok(deleted as u32)
    }

    /// Delete journal entries older than `before` date.
    /// Returns the number of rows deleted.
    pub fn prune_old_journal_entries(
        &self,
        avatar_id: &str,
        before: &str,
    ) -> Result<u32, AppError> {
        let deleted = self.conn.execute(
            "DELETE FROM ai_daily_log
             WHERE avatar_id = ?1 AND created_at < ?2",
            params![avatar_id, before],
        )?;
        Ok(deleted as u32)
    }

    // ── AI Journal CRUD (raw — summary is encrypted) ────────────────

    /// Get all journal entries for an avatar, newest first.
    pub fn get_ai_journal_raw(&self, avatar_id: &str) -> Result<Vec<AiDailyLogRow>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, avatar_id, conversation_id, log_date, summary, created_at
             FROM ai_daily_log
             WHERE avatar_id = ?1
             ORDER BY log_date DESC",
        )?;
        let rows = stmt
            .query_map(params![avatar_id], |row| {
                Ok(AiDailyLogRow {
                    id: row.get(0)?,
                    avatar_id: row.get(1)?,
                    conversation_id: row.get(2)?,
                    log_date: row.get(3)?,
                    summary: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Get recent journal entries for an avatar, newest first, with a limit.
    pub fn get_recent_journal_raw(
        &self,
        avatar_id: &str,
        limit: u32,
    ) -> Result<Vec<AiDailyLogRow>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, avatar_id, conversation_id, log_date, summary, created_at
             FROM ai_daily_log
             WHERE avatar_id = ?1
             ORDER BY log_date DESC
             LIMIT ?2",
        )?;
        let rows = stmt
            .query_map(params![avatar_id, limit], |row| {
                Ok(AiDailyLogRow {
                    id: row.get(0)?,
                    avatar_id: row.get(1)?,
                    conversation_id: row.get(2)?,
                    log_date: row.get(3)?,
                    summary: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Insert a new journal entry (summary should already be encrypted by the caller).
    #[allow(dead_code)]
    pub fn insert_ai_journal_raw(
        &self,
        avatar_id: &str,
        conversation_id: &str,
        log_date: &str,
        summary_encrypted: &str,
    ) -> Result<String, AppError> {
        let id = Uuid::new_v4().to_string();
        let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        self.conn.execute(
            "INSERT INTO ai_daily_log (id, avatar_id, conversation_id, log_date, summary, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, avatar_id, conversation_id, log_date, summary_encrypted, created_at],
        )?;
        Ok(id)
    }

    /// Delete a journal entry by ID.
    pub fn delete_ai_journal_entry(&self, entry_id: &str) -> Result<(), AppError> {
        self.conn
            .execute("DELETE FROM ai_daily_log WHERE id = ?1", params![entry_id])?;
        Ok(())
    }

    // ── AI Conversation CRUD ───────────────────────────────────────────

    /// Get the active (un-ended) conversation for an avatar.
    pub fn get_active_conversation(
        &self,
        avatar_id: &str,
    ) -> Result<Option<AiConversation>, AppError> {
        let result = self.conn.query_row(
            "SELECT id, avatar_id, started_at, ended_at, summary, message_count, compacted
             FROM ai_conversations
             WHERE avatar_id = ?1 AND ended_at IS NULL
             ORDER BY started_at DESC
             LIMIT 1",
            params![avatar_id],
            |row| {
                Ok(AiConversation {
                    id: row.get(0)?,
                    avatar_id: row.get(1)?,
                    started_at: row.get(2)?,
                    ended_at: row.get(3)?,
                    summary: row.get(4)?,
                    message_count: row.get(5)?,
                    compacted: row.get::<_, u8>(6)?,
                })
            },
        );
        match result {
            Ok(conv) => Ok(Some(conv)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Check whether an avatar has any ended (completed) conversations.
    /// Returns `true` if this avatar has never finished a conversation — i.e. it's brand new.
    pub fn is_avatar_first_conversation(&self, avatar_id: &str) -> Result<bool, AppError> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM ai_conversations WHERE avatar_id = ?1 AND ended_at IS NOT NULL",
            params![avatar_id],
            |row| row.get(0),
        )?;
        Ok(count == 0)
    }

    /// Create a new conversation with a generated UUID.
    pub fn create_ai_conversation(&self, avatar_id: &str) -> Result<AiConversation, AppError> {
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO ai_conversations (id, avatar_id, started_at, message_count, compacted)
             VALUES (?1, ?2, datetime('now'), 0, 0)",
            params![id, avatar_id],
        )?;
        let started_at: String = self.conn.query_row(
            "SELECT started_at FROM ai_conversations WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        Ok(AiConversation {
            id,
            avatar_id: avatar_id.to_string(),
            started_at,
            ended_at: None,
            summary: None,
            message_count: 0,
            compacted: 0,
        })
    }

    /// Set ended_at on a conversation (no compaction).
    pub fn end_ai_conversation(&self, conversation_id: &str) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE ai_conversations SET ended_at = datetime('now') WHERE id = ?1",
            params![conversation_id],
        )?;
        Ok(())
    }

    /// Mark a conversation's compaction as failed (compacted = 2).
    /// Distinguishes from pending (0) so retry logic can differentiate
    /// never-attempted from genuinely-failed compactions.
    pub fn mark_compaction_failed(&self, conversation_id: &str) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE ai_conversations SET compacted = 2 WHERE id = ?1",
            params![conversation_id],
        )?;
        Ok(())
    }

    /// Mark conversation as fully compacted with encrypted summary.
    #[allow(dead_code)]
    pub fn complete_ai_conversation(
        &self,
        conversation_id: &str,
        summary_encrypted: &str,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE ai_conversations
             SET ended_at = COALESCE(ended_at, datetime('now')),
                 summary = ?2,
                 compacted = 1
             WHERE id = ?1",
            params![conversation_id, summary_encrypted],
        )?;
        Ok(())
    }

    /// Insert a message. Content should be pre-encrypted.
    #[allow(dead_code)]
    pub fn insert_ai_message(
        &self,
        conversation_id: &str,
        role: &str,
        content_encrypted: &str,
        token_estimate: u32,
        attachments_encrypted: Option<&str>,
    ) -> Result<String, AppError> {
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO ai_messages (id, conversation_id, role, content, created_at, token_estimate, attachments)
             VALUES (?1, ?2, ?3, ?4, datetime('now'), ?5, ?6)",
            params![id, conversation_id, role, content_encrypted, token_estimate, attachments_encrypted],
        )?;
        Ok(id)
    }

    /// Get all messages for a conversation, ordered chronologically. Content is encrypted.
    pub fn get_ai_messages_raw(
        &self,
        conversation_id: &str,
    ) -> Result<Vec<AiMessageRow>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, conversation_id, role, content, created_at, token_estimate, attachments
             FROM ai_messages
             WHERE conversation_id = ?1
             ORDER BY created_at ASC",
        )?;
        let rows = stmt
            .query_map(params![conversation_id], |row| {
                Ok(AiMessageRow {
                    id: row.get(0)?,
                    conversation_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    created_at: row.get(4)?,
                    attachments: row.get(6)?,
                    token_estimate: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Update the attachments JSON for a specific message (e.g. to add captions).
    pub fn update_message_attachments(
        &self,
        message_id: &str,
        attachments_encrypted: &str,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE ai_messages SET attachments = ?2 WHERE id = ?1",
            params![message_id, attachments_encrypted],
        )?;
        Ok(())
    }

    /// Update message_count for a conversation.
    #[allow(dead_code)]
    pub fn update_ai_conversation_message_count(
        &self,
        conversation_id: &str,
        count: u32,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE ai_conversations SET message_count = ?2 WHERE id = ?1",
            params![conversation_id, count],
        )?;
        Ok(())
    }

    /// Delete all messages for a conversation.
    #[allow(dead_code)]
    pub fn delete_ai_messages_for_conversation(
        &self,
        conversation_id: &str,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM ai_messages WHERE conversation_id = ?1",
            params![conversation_id],
        )?;
        Ok(())
    }

    /// Delete specific messages by ID (for mid-session summarization).
    #[allow(dead_code)]
    pub fn delete_ai_messages_by_ids(&self, ids: &[String]) -> Result<(), AppError> {
        if ids.is_empty() {
            return Ok(());
        }
        let placeholders = vec!["?"; ids.len()].join(", ");
        let sql = format!("DELETE FROM ai_messages WHERE id IN ({})", placeholders);
        let params: Vec<&dyn rusqlite::ToSql> =
            ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        self.conn.execute(&sql, params.as_slice())?;
        Ok(())
    }

    /// Find un-ended conversations for a specific avatar (crash recovery).
    pub fn get_orphaned_conversations(&self, avatar_id: &str) -> Result<Vec<String>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM ai_conversations WHERE avatar_id = ?1 AND ended_at IS NULL AND compacted = 0",
        )?;
        let ids = stmt
            .query_map(params![avatar_id], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(ids)
    }

    /// Find conversations where compaction failed: ended but not compacted, with messages still present.
    pub fn get_pending_compaction_conversations(&self) -> Result<Vec<(String, String)>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT c.id, c.avatar_id
             FROM ai_conversations c
             WHERE c.ended_at IS NOT NULL
               AND c.compacted = 0
               AND EXISTS (SELECT 1 FROM ai_messages m WHERE m.conversation_id = c.id)",
        )?;
        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<(String, String)>, _>>()?;
        Ok(rows)
    }

    /// Get all raw message rows for a conversation (for compaction data export).
    /// Returns (avatar_id, Vec<AiMessageRow>).
    pub fn get_compaction_conversation_data(
        &self,
        conversation_id: &str,
    ) -> Result<(String, Vec<AiMessageRow>), AppError> {
        let avatar_id: String = self
            .conn
            .query_row(
                "SELECT avatar_id FROM ai_conversations WHERE id = ?1",
                params![conversation_id],
                |row| row.get(0),
            )
            .map_err(|_| AppError::NotFound("Conversation not found".into()))?;

        let messages = self.get_ai_messages_raw(conversation_id)?;
        Ok((avatar_id, messages))
    }

    /// Get personality prompt_text by ID.
    pub fn get_personality_prompt(&self, personality_id: &str) -> Result<String, AppError> {
        let result = self.conn.query_row(
            "SELECT prompt_text FROM ai_personalities WHERE id = ?1",
            params![personality_id],
            |row| row.get(0),
        );
        match result {
            Ok(prompt) => Ok(prompt),
            Err(rusqlite::Error::QueryReturnedNoRows) => Err(AppError::NotFound(format!(
                "Personality not found: {}",
                personality_id
            ))),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    /// Get companion role system prompt text. Checks custom text, then built-in
    /// presets, then custom DB roles, falling back to gaming companion default.
    pub fn resolve_companion_role_prompt(
        &self,
        role_id: Option<&str>,
        custom_text: Option<&str>,
    ) -> String {
        // Custom text takes precedence
        if let Some(custom) = custom_text {
            if !custom.is_empty() {
                return custom.to_string();
            }
        }
        let target_id = role_id.unwrap_or("gaming-companion");

        // Check built-in presets first
        if let Some(role) = companion_role_presets()
            .into_iter()
            .find(|r| r.id == target_id)
        {
            return role.system_prompt_text;
        }

        // Check custom DB roles
        if let Ok(prompt) = self.conn.query_row(
            "SELECT system_prompt_text FROM ai_companion_roles WHERE id = ?1",
            params![target_id],
            |row| row.get::<_, String>(0),
        ) {
            return prompt;
        }

        // Fallback
        "a gaming companion who helps with all aspects of the user's library and gaming life".into()
    }

    // ── AI Data Wipe ────────────────────────────────────────────────

    /// Wipe all AI conversation data (messages, journal, memories, conversations).
    /// Keeps avatars and personalities intact.
    pub fn wipe_ai_data(&self) -> Result<(), AppError> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("DELETE FROM ai_messages", [])?;
        tx.execute("DELETE FROM ai_daily_log", [])?;
        tx.execute("DELETE FROM ai_memories", [])?;
        tx.execute("DELETE FROM ai_conversations", [])?;
        tx.commit()?;
        Ok(())
    }

    /// Hard delete an avatar and cascade to all related data.
    /// FK cascades handle: ai_conversations → ai_messages (via conversation FK),
    /// ai_memories (via avatar FK), ai_daily_log (via avatar FK).
    /// We explicitly delete memories and daily_log first for clarity.
    pub fn delete_ai_avatar(&self, avatar_id: &str) -> Result<(), AppError> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "DELETE FROM ai_memories WHERE avatar_id = ?1",
            params![avatar_id],
        )?;
        tx.execute(
            "DELETE FROM ai_daily_log WHERE avatar_id = ?1",
            params![avatar_id],
        )?;
        tx.execute(
            "DELETE FROM ai_conversations WHERE avatar_id = ?1",
            params![avatar_id],
        )?;
        tx.execute("DELETE FROM ai_avatars WHERE id = ?1", params![avatar_id])?;
        tx.commit()?;
        Ok(())
    }

    /// Wipe all data for an avatar without deleting the avatar itself.
    /// Deletes conversations (cascades to messages via FK), memories, and daily_log.
    pub fn wipe_avatar_data(&self, avatar_id: &str) -> Result<(), AppError> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "DELETE FROM ai_conversations WHERE avatar_id = ?1",
            params![avatar_id],
        )?;
        tx.execute(
            "DELETE FROM ai_memories WHERE avatar_id = ?1",
            params![avatar_id],
        )?;
        tx.execute(
            "DELETE FROM ai_daily_log WHERE avatar_id = ?1",
            params![avatar_id],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Count the total number of avatars (active + inactive).
    pub fn count_ai_avatars(&self) -> Result<u32, AppError> {
        let count: u32 = self
            .conn
            .query_row("SELECT COUNT(*) FROM ai_avatars", [], |row| row.get(0))?;
        Ok(count)
    }

    // ── AI Conversation Stub (for FK constraints in tests/seeding) ──

    /// Create a minimal conversation record. Used for FK constraints when inserting
    /// journal entries or memories that reference a conversation.
    #[allow(dead_code)]
    pub fn create_ai_conversation_stub(
        &self,
        conversation_id: &str,
        avatar_id: &str,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT INTO ai_conversations (id, avatar_id, started_at, message_count, compacted)
             VALUES (?1, ?2, datetime('now'), 0, 0)",
            params![conversation_id, avatar_id],
        )?;
        Ok(())
    }

    /// Complete a compaction: insert journal, insert memories, supersede old memories,
    /// mark conversation complete, and delete raw messages.
    /// All operations are wrapped in a single transaction for atomicity.
    pub fn complete_compaction(
        &self,
        conv_id: &str,
        avatar_id: &str,
        summary_encrypted: &str,
        journal_entry_encrypted: &str,
        memories: &[(String, u32, String)], // (encrypted_content, importance, category)
        superseded_ids: &[String],
    ) -> Result<(), AppError> {
        let tx = self.conn.unchecked_transaction()?;

        // Insert journal entry — use local time so displayed timestamps match the user's clock
        let now_local = chrono::Local::now();
        let today = now_local.format("%Y-%m-%d").to_string();
        let created_at = now_local.format("%Y-%m-%d %H:%M:%S").to_string();
        let journal_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO ai_daily_log (id, avatar_id, conversation_id, log_date, summary, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![journal_id, avatar_id, conv_id, today, journal_entry_encrypted, created_at],
        )?;

        // Insert new memories
        for (encrypted_content, importance, category) in memories {
            let mem_id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO ai_memories (id, avatar_id, conversation_id, content, importance, category, is_system, active, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 1, datetime('now'))",
                params![mem_id, avatar_id, conv_id, encrypted_content, importance, category],
            )?;
        }

        // Soft-delete superseded memories
        for old_id in superseded_ids {
            tx.execute(
                "UPDATE ai_memories SET active = 0 WHERE id = ?1 AND is_system = 0",
                params![old_id],
            )?;
        }

        // Complete conversation with summary
        tx.execute(
            "UPDATE ai_conversations SET ended_at = COALESCE(ended_at, datetime('now')), summary = ?2, compacted = 1 WHERE id = ?1",
            params![conv_id, summary_encrypted],
        )?;

        // Delete raw messages
        tx.execute(
            "DELETE FROM ai_messages WHERE conversation_id = ?1",
            params![conv_id],
        )?;

        tx.commit()?;
        Ok(())
    }

    /// Store a user message + assistant response pair and update message count.
    /// Wrapped in a transaction for atomicity.
    /// Store a user+assistant message pair. Returns the user message ID (if stored).
    pub fn store_message_pair(
        &self,
        conversation_id: &str,
        user_content_encrypted: &str,
        user_token_estimate: u32,
        assistant_content_encrypted: &str,
        assistant_token_estimate: u32,
        skip_user_message: bool,
        user_attachments_encrypted: Option<&str>,
    ) -> Result<Option<String>, AppError> {
        let tx = self.conn.unchecked_transaction()?;

        let user_id = if !skip_user_message {
            let id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO ai_messages (id, conversation_id, role, content, created_at, token_estimate, attachments)
                 VALUES (?1, ?2, 'user', ?3, datetime('now'), ?4, ?5)",
                params![id, conversation_id, user_content_encrypted, user_token_estimate, user_attachments_encrypted],
            )?;
            Some(id)
        } else {
            None
        };

        let asst_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO ai_messages (id, conversation_id, role, content, created_at, token_estimate)
             VALUES (?1, ?2, 'assistant', ?3, datetime('now'), ?4)",
            params![asst_id, conversation_id, assistant_content_encrypted, assistant_token_estimate],
        )?;

        // Update message count
        let count: u32 = tx.query_row(
            "SELECT COUNT(*) FROM ai_messages WHERE conversation_id = ?1",
            params![conversation_id],
            |row| row.get(0),
        )?;
        tx.execute(
            "UPDATE ai_conversations SET message_count = ?2 WHERE id = ?1",
            params![conversation_id, count],
        )?;

        tx.commit()?;
        Ok(user_id)
    }

    /// Create a conversation with a specific timestamp. Test-only helper.
    #[cfg(test)]
    pub fn create_ai_conversation_with_timestamp(
        &self,
        avatar_id: &str,
        started_at: &str,
    ) -> Result<AiConversation, AppError> {
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO ai_conversations (id, avatar_id, started_at, message_count, compacted)
             VALUES (?1, ?2, ?3, 0, 0)",
            params![id, avatar_id, started_at],
        )?;
        Ok(AiConversation {
            id,
            avatar_id: avatar_id.to_string(),
            started_at: started_at.to_string(),
            ended_at: None,
            summary: None,
            message_count: 0,
            compacted: 0,
        })
    }

    /// Abandon a conversation: set ended_at and delete all its messages.
    pub fn abandon_conversation(&self, conversation_id: &str) -> Result<(), AppError> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "UPDATE ai_conversations SET ended_at = datetime('now'), message_count = 0 WHERE id = ?1 AND ended_at IS NULL",
            params![conversation_id],
        )?;
        tx.execute(
            "DELETE FROM ai_messages WHERE conversation_id = ?1",
            params![conversation_id],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Check whether a conversation has any user messages.
    pub fn has_user_messages(&self, conversation_id: &str) -> Result<bool, AppError> {
        let count: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM ai_messages WHERE conversation_id = ?1 AND role = 'user'",
            params![conversation_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// Get the started_at timestamp of a conversation.
    pub fn get_conversation_started_at(&self, conversation_id: &str) -> Result<String, AppError> {
        self.conn
            .query_row(
                "SELECT started_at FROM ai_conversations WHERE id = ?1",
                params![conversation_id],
                |row| row.get::<_, String>(0),
            )
            .map_err(|_| AppError::NotFound("Conversation not found".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::metadata::*;
    use std::collections::HashSet;

    fn test_db() -> CacheDb {
        let dir = std::env::temp_dir().join(format!(
            "theroost_test_{}_{:?}_{}",
            std::process::id(),
            std::thread::current().id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("test.db");
        CacheDb::new(&path).unwrap()
    }

    /// Helper: ensure a game exists in the games table for FK constraints.
    fn ensure_game(db: &CacheDb, game_id: &str) {
        db.conn
            .execute(
                "INSERT OR IGNORE INTO games (game_id, source, source_id, name, created_at) VALUES (?1, 'Steam', ?1, 'Test Game', 0)",
                rusqlite::params![game_id],
            )
            .unwrap();
    }

    fn make_metadata(game_id: &str) -> StoreMetadata {
        StoreMetadata {
            game_id: game_id.to_string(),
            name: format!("Game {}", game_id),
            short_description: Some("A test game".to_string()),
            header_image_url: Some("https://example.com/img.jpg".to_string()),
            developers: vec!["Dev Studio".to_string()],
            publishers: vec!["Publisher Inc".to_string()],
            genres: vec![GenreInfo {
                id: "1".to_string(),
                description: "Action".to_string(),
            }],
            categories: vec![CategoryInfo {
                id: 1,
                description: "Single-player".to_string(),
            }],
            screenshots: vec![ScreenshotInfo {
                id: 1,
                thumbnail_url: "https://example.com/thumb.jpg".to_string(),
                full_url: "https://example.com/full.jpg".to_string(),
            }],
            release_date: Some("2023-01-15".to_string()),
            metacritic_score: Some(85),
            metacritic_url: Some("https://metacritic.com/game".to_string()),
            steam_tags: vec![SteamTagInfo {
                name: "Action".to_string(),
                votes: 100,
            }],
        }
    }

    // ── Schema ──────────────────────────────────────────────────────

    #[test]
    fn test_schema_initializes() {
        let db = test_db();
        let mut stmt = db
            .conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .unwrap();
        let tables: HashSet<String> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<HashSet<String>, _>>()
            .unwrap();

        let expected = [
            "games",
            "game_executables",
            "game_images",
            "store_metadata",
            "playtime_snapshots",
            "game_sessions",
            "tags",
            "game_tags",
            "favorites",
            "hidden_games",
            "saved_filters",
            "game_notes",
            "game_ratings",
            "ai_personalities",
            "ai_avatars",
            "ai_conversations",
            "ai_messages",
            "ai_memories",
            "ai_daily_log",
        ];
        for table in &expected {
            assert!(
                tables.contains(*table),
                "Missing table: {}. Found: {:?}",
                table,
                tables
            );
        }
    }

    #[test]
    fn test_schema_version_current() {
        let db = test_db();
        let version: u32 = db
            .conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(version, 28);
    }

    #[test]
    fn test_ai_personalities_seeded() {
        let db = test_db();
        // v1.12.5: 6 original personalities reclassified as custom, 8 new tones as builtin
        let builtin_count: u32 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM ai_personalities WHERE is_builtin = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(builtin_count, 8, "Expected 8 built-in personality tones");
        let total: u32 = db
            .conn
            .query_row("SELECT COUNT(*) FROM ai_personalities", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(
            total, 14,
            "Expected 14 total personalities (6 legacy + 8 new)"
        );
    }

    #[test]
    fn test_ai_schema_idempotent() {
        let db = test_db();
        // init_schema was already called by test_db() → CacheDb::new()
        // Call it again to verify idempotency
        db.init_schema().unwrap();
        let count: u32 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM ai_personalities WHERE is_builtin = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            count, 8,
            "Idempotent: still exactly 8 built-in personality tones"
        );
        let version: u32 = db
            .conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(version, 28);
    }

    #[test]
    fn test_ai_indexes_exist() {
        let db = test_db();
        let mut stmt = db
            .conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_ai_%'")
            .unwrap();
        let indexes: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<String>, _>>()
            .unwrap();
        let expected = [
            "idx_ai_conversations_avatar",
            "idx_ai_messages_conv",
            "idx_ai_memories_active",
            "idx_ai_daily_log_avatar_date",
            "idx_ai_avatars_name",
            "idx_ai_personalities_name",
        ];
        for idx in &expected {
            assert!(
                indexes.contains(&idx.to_string()),
                "Missing index: {}. Found: {:?}",
                idx,
                indexes
            );
        }
    }

    #[test]
    fn test_ai_personality_records_complete() {
        let db = test_db();

        // v1.12.5: Old 6 are reclassified as custom (is_builtin = 0)
        let legacy: &[(&str, &str)] = &[
            ("a1b2c3d4-0001-4000-8000-000000000001", "Friendly Guide"),
            ("a1b2c3d4-0002-4000-8000-000000000002", "Stoic Advisor"),
            ("a1b2c3d4-0003-4000-8000-000000000003", "Witty Companion"),
            ("a1b2c3d4-0004-4000-8000-000000000004", "Lore Scholar"),
            ("a1b2c3d4-0005-4000-8000-000000000005", "Competitive Coach"),
            ("a1b2c3d4-0006-4000-8000-000000000006", "Chill Buddy"),
        ];

        for (expected_id, expected_name) in legacy {
            let row: (String, String, i32, String) = db
                .conn
                .query_row(
                    "SELECT name, prompt_text, is_builtin, created_at FROM ai_personalities WHERE id = ?1",
                    rusqlite::params![expected_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                )
                .unwrap_or_else(|_| panic!("Missing personality: {} ({})", expected_name, expected_id));

            assert_eq!(
                row.0, *expected_name,
                "Name mismatch for ID {}",
                expected_id
            );
            assert!(
                !row.1.is_empty(),
                "prompt_text should be non-empty for '{}'",
                expected_name
            );
            assert_eq!(
                row.2, 0,
                "Legacy personality '{}' should be reclassified as custom",
                expected_name
            );
        }

        // v1.12.5: 8 new tones are built-in
        let new_tones: &[(&str, &str)] = &[
            ("bp-warm-friendly", "Warm & Friendly"),
            ("bp-witty-sarcastic", "Witty & Sarcastic"),
            ("bp-calm-measured", "Calm & Measured"),
            ("bp-energetic-hyped", "Energetic & Hyped"),
            ("bp-blunt-direct", "Blunt & Direct"),
            ("bp-charming-playful", "Charming & Playful"),
            ("bp-laid-back-chill", "Laid Back & Chill"),
            ("bp-dramatic-theatrical", "Dramatic & Theatrical"),
        ];

        for (expected_id, expected_name) in new_tones {
            let row: (String, String, i32, String) = db
                .conn
                .query_row(
                    "SELECT name, prompt_text, is_builtin, created_at FROM ai_personalities WHERE id = ?1",
                    rusqlite::params![expected_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                )
                .unwrap_or_else(|_| panic!("Missing tone: {} ({})", expected_name, expected_id));

            assert_eq!(
                row.0, *expected_name,
                "Name mismatch for ID {}",
                expected_id
            );
            assert!(
                !row.1.is_empty(),
                "prompt_text should be non-empty for '{}'",
                expected_name
            );
            assert_eq!(row.2, 1, "Tone '{}' should be builtin", expected_name);
        }
    }

    #[test]
    fn test_ai_avatar_fk_rejects_invalid_personality() {
        let db = test_db();

        let result = db.conn.execute(
            "INSERT INTO ai_avatars (id, name, personality_id, is_active, created_at)
             VALUES ('avatar-1', 'Test Avatar', 'nonexistent-personality-id', 0, datetime('now'))",
            [],
        );
        assert!(
            result.is_err(),
            "Should reject avatar with non-existent personality_id"
        );
    }

    #[test]
    fn test_ai_cascade_delete_avatar_removes_conversations() {
        let db = test_db();

        db.conn.execute(
            "INSERT INTO ai_avatars (id, name, personality_id, is_active, created_at)
             VALUES ('avatar-1', 'Avatar', 'a1b2c3d4-0001-4000-8000-000000000001', 1, datetime('now'))",
            [],
        ).unwrap();

        db.conn
            .execute(
                "INSERT INTO ai_conversations (id, avatar_id, started_at, message_count, compacted)
             VALUES ('conv-1', 'avatar-1', datetime('now'), 0, 0)",
                [],
            )
            .unwrap();

        let count: u32 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM ai_conversations WHERE avatar_id = 'avatar-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        db.conn
            .execute("DELETE FROM ai_avatars WHERE id = 'avatar-1'", [])
            .unwrap();

        let count: u32 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM ai_conversations WHERE id = 'conv-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            count, 0,
            "Conversation should be cascade-deleted with avatar"
        );
    }

    #[test]
    fn test_ai_memory_conversation_set_null_on_delete() {
        let db = test_db();

        db.conn.execute(
            "INSERT INTO ai_avatars (id, name, personality_id, is_active, created_at)
             VALUES ('avatar-1', 'Avatar', 'a1b2c3d4-0001-4000-8000-000000000001', 1, datetime('now'))",
            [],
        ).unwrap();

        db.conn
            .execute(
                "INSERT INTO ai_conversations (id, avatar_id, started_at, message_count, compacted)
             VALUES ('conv-1', 'avatar-1', datetime('now'), 0, 0)",
                [],
            )
            .unwrap();

        db.conn.execute(
            "INSERT INTO ai_memories (id, avatar_id, conversation_id, content, importance, category, is_system, created_at, active)
             VALUES ('mem-1', 'avatar-1', 'conv-1', 'Extracted fact', 3, 'general', 0, datetime('now'), 1)",
            [],
        ).unwrap();

        let conv_id: Option<String> = db
            .conn
            .query_row(
                "SELECT conversation_id FROM ai_memories WHERE id = 'mem-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(conv_id, Some("conv-1".to_string()));

        db.conn
            .execute("DELETE FROM ai_conversations WHERE id = 'conv-1'", [])
            .unwrap();

        let conv_id: Option<String> = db
            .conn
            .query_row(
                "SELECT conversation_id FROM ai_memories WHERE id = 'mem-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            conv_id.is_none(),
            "conversation_id should be SET NULL after conversation delete, got: {:?}",
            conv_id
        );

        let count: u32 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM ai_memories WHERE id = 'mem-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            count, 1,
            "Memory should survive conversation deletion (SET NULL, not CASCADE)"
        );
    }

    // ── Store Metadata ──────────────────────────────────────────────

    #[test]
    fn test_metadata_roundtrip() {
        let db = test_db();
        ensure_game(&db, "test-440");
        let meta = make_metadata("test-440");
        db.cache_store_metadata(&meta).unwrap();

        let fetched = db
            .get_store_metadata("test-440")
            .unwrap()
            .expect("should exist");
        assert_eq!(fetched.game_id, "test-440");
        assert_eq!(fetched.name, "Game test-440");
        assert_eq!(fetched.short_description, Some("A test game".to_string()));
        assert_eq!(
            fetched.header_image_url,
            Some("https://example.com/img.jpg".to_string())
        );
        assert_eq!(fetched.developers, vec!["Dev Studio".to_string()]);
        assert_eq!(fetched.publishers, vec!["Publisher Inc".to_string()]);
        assert_eq!(fetched.genres.len(), 1);
        assert_eq!(fetched.genres[0].id, "1");
        assert_eq!(fetched.genres[0].description, "Action");
        assert_eq!(fetched.categories.len(), 1);
        assert_eq!(fetched.categories[0].id, 1);
        assert_eq!(fetched.categories[0].description, "Single-player");
        assert_eq!(fetched.screenshots.len(), 1);
        assert_eq!(fetched.screenshots[0].id, 1);
        assert_eq!(
            fetched.screenshots[0].thumbnail_url,
            "https://example.com/thumb.jpg"
        );
        assert_eq!(
            fetched.screenshots[0].full_url,
            "https://example.com/full.jpg"
        );
        assert_eq!(fetched.release_date, Some("2023-01-15".to_string()));
        assert_eq!(fetched.metacritic_score, Some(85));
        assert_eq!(
            fetched.metacritic_url,
            Some("https://metacritic.com/game".to_string())
        );
        assert_eq!(fetched.steam_tags.len(), 1);
        assert_eq!(fetched.steam_tags[0].name, "Action");
        assert_eq!(fetched.steam_tags[0].votes, 100);
    }

    #[test]
    fn test_metadata_not_found() {
        let db = test_db();
        let result = db.get_store_metadata("nonexistent").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_metadata_fresh() {
        let db = test_db();
        ensure_game(&db, "test-440");
        let meta = make_metadata("test-440");
        db.cache_store_metadata(&meta).unwrap();
        assert!(db.is_metadata_fresh("test-440").unwrap());
    }

    #[test]
    fn test_invalidate_metadata() {
        let db = test_db();
        ensure_game(&db, "test-440");
        let meta = make_metadata("test-440");
        db.cache_store_metadata(&meta).unwrap();
        assert!(db.is_metadata_fresh("test-440").unwrap());

        db.invalidate_metadata_cache().unwrap();
        assert!(!db.is_metadata_fresh("test-440").unwrap());
    }

    #[test]
    fn test_game_ids_missing_tags() {
        let db = test_db();
        ensure_game(&db, "test-440");
        ensure_game(&db, "test-730");
        // Cache one with steam_tags populated (via make_metadata)
        let meta = make_metadata("test-440");
        db.cache_store_metadata(&meta).unwrap();

        // Manually insert one with steam_tags = NULL
        let now = chrono::Utc::now().timestamp();
        db.conn
            .execute(
                "INSERT INTO store_metadata (game_id, name, cached_at, steam_tags)
                 VALUES (?1, ?2, ?3, NULL)",
                params!["test-730", "Game 730", now],
            )
            .unwrap();

        let missing = db.get_game_ids_missing_tags().unwrap();
        assert_eq!(missing, vec!["test-730".to_string()]);
    }

    #[test]
    fn test_update_steam_tags() {
        let db = test_db();
        ensure_game(&db, "test-440");
        let meta = make_metadata("test-440");
        db.cache_store_metadata(&meta).unwrap();

        let new_tags = vec![
            SteamTagInfo {
                name: "RPG".to_string(),
                votes: 200,
            },
            SteamTagInfo {
                name: "Open World".to_string(),
                votes: 150,
            },
        ];
        db.update_steam_tags("test-440", &new_tags).unwrap();

        let fetched = db.get_store_metadata("test-440").unwrap().unwrap();
        assert_eq!(fetched.steam_tags.len(), 2);
        assert_eq!(fetched.steam_tags[0].name, "RPG");
        assert_eq!(fetched.steam_tags[0].votes, 200);
        assert_eq!(fetched.steam_tags[1].name, "Open World");
        assert_eq!(fetched.steam_tags[1].votes, 150);
    }

    // ── Sessions ────────────────────────────────────────────────────

    #[test]
    fn test_session_start_and_active() {
        let db = test_db();
        ensure_game(&db, "test-440");
        let now = chrono::Utc::now().timestamp();
        let id = db.start_session("test-440", now).unwrap();
        assert!(id > 0);

        let active = db
            .get_active_session("test-440")
            .unwrap()
            .expect("should exist");
        assert_eq!(active.id, id);
        assert_eq!(active.game_id, "test-440");
        assert_eq!(active.start_time, now);
        assert!(active.end_time.is_none());
    }

    #[test]
    fn test_session_close() {
        let db = test_db();
        ensure_game(&db, "test-440");
        let now = chrono::Utc::now().timestamp();
        let id = db.start_session("test-440", now).unwrap();

        let end = now + 3600;
        db.close_session(id, end, 60).unwrap();

        let active = db.get_active_session("test-440").unwrap();
        assert!(active.is_none());

        let sessions = db.get_sessions("test-440", 10).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, id);
        assert_eq!(sessions[0].end_time, Some(end));
        assert_eq!(sessions[0].duration_minutes, Some(60));
    }

    #[test]
    fn test_all_active_sessions() {
        let db = test_db();
        ensure_game(&db, "test-440");
        ensure_game(&db, "test-730");
        let now = chrono::Utc::now().timestamp();

        let id1 = db.start_session("test-440", now).unwrap();
        let _id2 = db.start_session("test-730", now + 1).unwrap();

        // Close the first one
        db.close_session(id1, now + 3600, 60).unwrap();

        let active = db.get_all_active_sessions().unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].game_id, "test-730");
    }

    #[test]
    fn test_get_sessions_limit() {
        let db = test_db();
        ensure_game(&db, "test-440");
        let now = chrono::Utc::now().timestamp();

        for i in 0..5 {
            let id = db.start_session("test-440", now + i * 100).unwrap();
            db.close_session(id, now + i * 100 + 50, 1).unwrap();
        }

        let sessions = db.get_sessions("test-440", 3).unwrap();
        assert_eq!(sessions.len(), 3);
    }

    #[test]
    fn test_recent_sessions_includes_active() {
        let db = test_db();
        ensure_game(&db, "test-440");
        ensure_game(&db, "test-730");
        let now = chrono::Utc::now().timestamp();

        // Session 1: closed
        let id1 = db.start_session("test-440", now).unwrap();
        db.close_session(id1, now + 3600, 60).unwrap();

        // Session 2: still active
        let _id2 = db.start_session("test-730", now + 5000).unwrap();

        let recent = db.get_recent_sessions(10).unwrap();
        assert_eq!(recent.len(), 2);
        // Newest first (active session started later)
        assert_eq!(recent[0].game_id, "test-730");
        assert!(recent[0].end_time.is_none());
        assert_eq!(recent[1].game_id, "test-440");
        assert!(recent[1].end_time.is_some());
    }

    // ── Tray helpers ────────────────────────────────────────────────

    #[test]
    fn test_recently_played_games() {
        let db = test_db();
        let now = chrono::Utc::now().timestamp();

        // Register games and create sessions using their registered game_ids
        let gid_440 = db.register_game("steam", "440", "Team Fortress 2").unwrap();
        let gid_730 = db.register_game("steam", "730", "CS2").unwrap();
        db.register_game("steam", "570", "Dota 2").unwrap();

        let id1 = db.start_session(&gid_440, now).unwrap();
        db.close_session(id1, now + 3600, 60).unwrap();
        let id2 = db.start_session(&gid_730, now + 5000).unwrap();
        db.close_session(id2, now + 8600, 60).unwrap();

        let recent = db.get_recently_played_games(5).unwrap();
        assert_eq!(recent.len(), 2);
        // Most recent first (730 started later)
        assert_eq!(recent[0].1, "CS2");
        assert_eq!(recent[1].1, "Team Fortress 2");
    }

    #[test]
    fn test_recently_played_games_empty() {
        let db = test_db();
        let recent = db.get_recently_played_games(5).unwrap();
        assert!(recent.is_empty());
    }

    #[test]
    fn test_active_sessions_with_names() {
        let db = test_db();
        let now = chrono::Utc::now().timestamp();

        let gid = db.register_game("steam", "440", "Team Fortress 2").unwrap();
        db.start_session(&gid, now).unwrap();

        let active = db.get_active_sessions_with_names().unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].0, gid);
        assert_eq!(active[0].1, "Team Fortress 2");
        assert_eq!(active[0].2, now);
    }

    // ── Active Game Session Context ────────────────────────────────

    #[test]
    fn test_get_active_game_session_context_none_when_no_sessions() {
        let db = test_db();
        let result = db.get_active_game_session_context().unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_get_active_game_session_context_returns_active_game() {
        let db = test_db();
        let now = chrono::Utc::now().timestamp();
        let gid = db.register_game("steam", "440", "Team Fortress 2").unwrap();
        db.start_session(&gid, now).unwrap();

        let result = db.get_active_game_session_context().unwrap();
        assert!(result.is_some());
        let (name, start_time) = result.unwrap();
        assert_eq!(name, "Team Fortress 2");
        assert_eq!(start_time, now);
    }

    #[test]
    fn test_get_active_game_session_context_returns_most_recent() {
        let db = test_db();
        let now = chrono::Utc::now().timestamp();

        let gid1 = db.register_game("steam", "440", "Team Fortress 2").unwrap();
        db.start_session(&gid1, now - 100).unwrap();

        let gid2 = db.register_game("steam", "730", "CS2").unwrap();
        db.start_session(&gid2, now).unwrap();

        let result = db.get_active_game_session_context().unwrap();
        assert!(result.is_some());
        let (name, _start_time) = result.unwrap();
        assert_eq!(name, "CS2"); // Most recently started
    }

    #[test]
    fn test_get_active_game_session_context_none_when_all_ended() {
        let db = test_db();
        let now = chrono::Utc::now().timestamp();

        let gid = db.register_game("steam", "440", "Team Fortress 2").unwrap();
        let sid = db.start_session(&gid, now).unwrap();
        db.close_session(sid, now + 3600, 60).unwrap();

        let result = db.get_active_game_session_context().unwrap();
        assert!(result.is_none());
    }

    // ── Tags ────────────────────────────────────────────────────────

    #[test]
    fn test_tag_create_and_list() {
        let db = test_db();
        let t1 = db.create_tag("Action", 0).unwrap();
        let t2 = db.create_tag("RPG", 1).unwrap();

        let tags = db.get_all_tags().unwrap();
        assert_eq!(tags.len(), 2);
        assert_eq!(tags[0].id, t1.id);
        assert_eq!(tags[0].name, "Action");
        assert_eq!(tags[1].id, t2.id);
        assert_eq!(tags[1].name, "RPG");
    }

    #[test]
    fn test_tag_update() {
        let db = test_db();
        let tag = db.create_tag("Old Name", 0).unwrap();
        db.update_tag(tag.id, "New Name", 5).unwrap();

        let tags = db.get_all_tags().unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].name, "New Name");
        assert_eq!(tags[0].color_index, 5);
    }

    #[test]
    fn test_tag_delete_cascades() {
        let db = test_db();
        ensure_game(&db, "test-440");
        let tag = db.create_tag("ToDelete", 0).unwrap();
        db.set_game_tags("test-440", &[tag.id]).unwrap();

        db.delete_tag(tag.id).unwrap();

        let game_tags = db.get_game_tag_ids("test-440").unwrap();
        assert!(game_tags.is_empty());
    }

    #[test]
    fn test_tag_reorder() {
        let db = test_db();
        let t1 = db.create_tag("A", 0).unwrap();
        let t2 = db.create_tag("B", 1).unwrap();
        let t3 = db.create_tag("C", 2).unwrap();

        // Reorder to [t3, t1, t2]
        db.reorder_tags(&[t3.id, t1.id, t2.id]).unwrap();

        let tags = db.get_all_tags().unwrap();
        assert_eq!(tags[0].id, t3.id);
        assert_eq!(tags[0].sort_order, 0);
        assert_eq!(tags[1].id, t1.id);
        assert_eq!(tags[1].sort_order, 1);
        assert_eq!(tags[2].id, t2.id);
        assert_eq!(tags[2].sort_order, 2);
    }

    #[test]
    fn test_duplicate_tag_name_error() {
        let db = test_db();
        db.create_tag("Action", 0).unwrap();
        let result = db.create_tag("Action", 1);
        assert!(result.is_err());
    }

    // ── Game-Tag M2M ────────────────────────────────────────────────

    #[test]
    fn test_set_game_tags() {
        let db = test_db();
        ensure_game(&db, "test-440");
        let t1 = db.create_tag("A", 0).unwrap();
        let t2 = db.create_tag("B", 1).unwrap();

        db.set_game_tags("test-440", &[t1.id, t2.id]).unwrap();

        let ids: HashSet<i64> = db
            .get_game_tag_ids("test-440")
            .unwrap()
            .into_iter()
            .collect();
        let expected: HashSet<i64> = [t1.id, t2.id].into_iter().collect();
        assert_eq!(ids, expected);
    }

    #[test]
    fn test_set_game_tags_replaces() {
        let db = test_db();
        ensure_game(&db, "test-440");
        let t1 = db.create_tag("A", 0).unwrap();
        let t2 = db.create_tag("B", 1).unwrap();
        let t3 = db.create_tag("C", 2).unwrap();

        db.set_game_tags("test-440", &[t1.id, t2.id]).unwrap();
        db.set_game_tags("test-440", &[t3.id]).unwrap();

        let ids = db.get_game_tag_ids("test-440").unwrap();
        assert_eq!(ids, vec![t3.id]);
    }

    #[test]
    fn test_get_all_game_tags() {
        let db = test_db();
        ensure_game(&db, "test-440");
        ensure_game(&db, "test-730");
        let t1 = db.create_tag("A", 0).unwrap();
        let t2 = db.create_tag("B", 1).unwrap();

        db.set_game_tags("test-440", &[t1.id]).unwrap();
        db.set_game_tags("test-730", &[t2.id]).unwrap();

        let all: HashSet<(String, i64)> = db.get_all_game_tags().unwrap().into_iter().collect();
        assert!(all.contains(&("test-440".to_string(), t1.id)));
        assert!(all.contains(&("test-730".to_string(), t2.id)));
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn test_bulk_set_game_tags() {
        let db = test_db();
        ensure_game(&db, "test-440");
        ensure_game(&db, "test-730");
        let t1 = db.create_tag("A", 0).unwrap();
        let t2 = db.create_tag("B", 1).unwrap();

        let game_ids = vec!["test-440".to_string(), "test-730".to_string()];
        db.bulk_set_game_tags(&game_ids, &[t1.id, t2.id]).unwrap();

        let all: HashSet<(String, i64)> = db.get_all_game_tags().unwrap().into_iter().collect();
        assert_eq!(all.len(), 4);
        assert!(all.contains(&("test-440".to_string(), t1.id)));
        assert!(all.contains(&("test-440".to_string(), t2.id)));
        assert!(all.contains(&("test-730".to_string(), t1.id)));
        assert!(all.contains(&("test-730".to_string(), t2.id)));
    }

    // ── Favorites ───────────────────────────────────────────────────

    #[test]
    fn test_favorite_toggle() {
        let db = test_db();
        ensure_game(&db, "test-440");

        db.set_favorite("test-440", true).unwrap();
        let favs = db.get_all_favorites().unwrap();
        assert!(favs.contains(&"test-440".to_string()));

        db.set_favorite("test-440", false).unwrap();
        let favs = db.get_all_favorites().unwrap();
        assert!(favs.is_empty());
    }

    // ── Hidden Games ────────────────────────────────────────────────

    #[test]
    fn test_hidden_toggle() {
        let db = test_db();
        ensure_game(&db, "test-440");

        db.set_hidden("test-440", true).unwrap();
        let hidden = db.get_all_hidden().unwrap();
        assert!(hidden.contains(&"test-440".to_string()));

        db.set_hidden("test-440", false).unwrap();
        let hidden = db.get_all_hidden().unwrap();
        assert!(hidden.is_empty());
    }

    // ── Saved Filters ───────────────────────────────────────────────

    #[test]
    fn test_saved_filter_roundtrip() {
        let db = test_db();
        let filter = db
            .save_filter(
                "My Filter",
                r#"{"search":"test"}"#,
                Some("name"),
                Some("asc"),
            )
            .unwrap();

        assert_eq!(filter.name, "My Filter");
        assert_eq!(filter.filter_json, r#"{"search":"test"}"#);
        assert_eq!(filter.sort_by, Some("name".to_string()));
        assert_eq!(filter.sort_order, Some("asc".to_string()));

        let all = db.get_all_saved_filters().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].name, "My Filter");
        assert_eq!(all[0].filter_json, r#"{"search":"test"}"#);
        assert_eq!(all[0].sort_by, Some("name".to_string()));
        assert_eq!(all[0].sort_order, Some("asc".to_string()));
    }

    #[test]
    fn test_delete_saved_filter() {
        let db = test_db();
        let filter = db.save_filter("ToDelete", r#"{}"#, None, None).unwrap();

        db.delete_saved_filter(filter.id).unwrap();

        let all = db.get_all_saved_filters().unwrap();
        assert!(all.is_empty());
    }

    #[test]
    fn test_duplicate_filter_name_error() {
        let db = test_db();
        db.save_filter("Unique", r#"{}"#, None, None).unwrap();
        let result = db.save_filter("Unique", r#"{}"#, None, None);
        assert!(result.is_err());
    }

    // ── Snapshots ───────────────────────────────────────────────────

    #[test]
    fn test_insert_snapshot() {
        let db = test_db();
        ensure_game(&db, "test-440");
        let now = chrono::Utc::now().timestamp();
        let result = db.insert_snapshot("test-440", 120, now);
        assert!(result.is_ok());
    }

    #[test]
    fn test_cleanup_old_snapshots() {
        let db = test_db();
        ensure_game(&db, "test-440");
        let now = chrono::Utc::now().timestamp();

        // Old snapshot (timestamp = 0, well beyond any cleanup cutoff)
        db.insert_snapshot("test-440", 100, 0).unwrap();
        // Recent snapshot
        db.insert_snapshot("test-440", 200, now).unwrap();

        let deleted = db.cleanup_old_snapshots(1).unwrap();
        assert_eq!(deleted, 1);

        // Verify only the recent one remains
        let count: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM playtime_snapshots", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    // ── Game Registry ───────────────────────────────────────────────

    #[test]
    fn test_register_game_creates_new() {
        let db = test_db();
        let game_id = db.register_game("steam", "440", "Team Fortress 2").unwrap();
        assert!(!game_id.is_empty());

        // Verify it was stored
        let found = db.get_game_id("steam", "440").unwrap();
        assert_eq!(found, Some(game_id));
    }

    #[test]
    fn test_register_game_returns_existing() {
        let db = test_db();
        let id1 = db.register_game("steam", "440", "Team Fortress 2").unwrap();
        let id2 = db.register_game("steam", "440", "Team Fortress 2").unwrap();
        assert_eq!(id1, id2);
    }

    #[test]
    fn test_get_game_source_roundtrip() {
        let db = test_db();
        let game_id = db.register_game("steam", "730", "CS2").unwrap();

        let source = db.get_game_source(&game_id).unwrap();
        assert_eq!(source, Some(("steam".to_string(), "730".to_string())));
    }

    #[test]
    fn test_get_game_source_not_found() {
        let db = test_db();
        let source = db.get_game_source("nonexistent-uuid").unwrap();
        assert!(source.is_none());
    }

    #[test]
    fn test_get_game_id_not_found() {
        let db = test_db();
        let found = db.get_game_id("steam", "99999").unwrap();
        assert!(found.is_none());
    }

    // ── Install Paths & Executables ─────────────────────────────────

    #[test]
    fn test_set_and_get_install_path() {
        let db = test_db();
        let gid = db.register_game("steam", "440", "TF2").unwrap();
        db.set_install_path(&gid, r"D:\SteamLibrary\steamapps\common\Team Fortress 2")
            .unwrap();
        let paths = db.get_all_install_paths().unwrap();
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0].0, gid);
        assert_eq!(
            paths[0].1,
            r"D:\SteamLibrary\steamapps\common\Team Fortress 2"
        );
    }

    #[test]
    fn test_install_path_null_by_default() {
        let db = test_db();
        db.register_game("steam", "440", "TF2").unwrap();
        let paths = db.get_all_install_paths().unwrap();
        assert!(paths.is_empty());
    }

    #[test]
    fn test_add_and_find_game_executable() {
        let db = test_db();
        let gid = db.register_game("steam", "440", "TF2").unwrap();
        db.add_game_executable(&gid, r"D:\Games\TF2\hl2.exe", "hl2.exe")
            .unwrap();
        let found = db.find_games_by_exe_name("hl2.exe").unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].0, gid);
    }

    #[test]
    fn test_duplicate_executable_ignored() {
        let db = test_db();
        let gid = db.register_game("steam", "440", "TF2").unwrap();
        db.add_game_executable(&gid, r"D:\Games\TF2\hl2.exe", "hl2.exe")
            .unwrap();
        db.add_game_executable(&gid, r"D:\Games\TF2\hl2.exe", "hl2.exe")
            .unwrap();
        let all = db.get_all_game_executables().unwrap();
        assert_eq!(all.len(), 1);
    }

    #[test]
    fn test_multiple_executables_same_name() {
        let db = test_db();
        let gid1 = db.register_game("steam", "440", "TF2").unwrap();
        let gid2 = db.register_game("steam", "730", "CS2").unwrap();
        db.add_game_executable(&gid1, r"D:\Games\TF2\hl2.exe", "hl2.exe")
            .unwrap();
        db.add_game_executable(&gid2, r"D:\Games\CS2\hl2.exe", "hl2.exe")
            .unwrap();
        let found = db.find_games_by_exe_name("hl2.exe").unwrap();
        assert_eq!(found.len(), 2);
    }

    #[test]
    fn test_get_primary_executable_returns_first() {
        let db = test_db();
        let gid = db.register_game("epic", "Fortnite", "Fortnite").unwrap();
        db.add_game_executable(&gid, r"C:\Epic\Fortnite\start.exe", "start.exe")
            .unwrap();
        db.add_game_executable(&gid, r"C:\Epic\Fortnite\launcher.exe", "launcher.exe")
            .unwrap();
        let primary = db.get_primary_executable(&gid).unwrap();
        assert_eq!(primary, Some(r"C:\Epic\Fortnite\start.exe".to_string()));
    }

    #[test]
    fn test_get_primary_executable_none_when_empty() {
        let db = test_db();
        let gid = db.register_game("gog", "12345", "Some Game").unwrap();
        let primary = db.get_primary_executable(&gid).unwrap();
        assert_eq!(primary, None);
    }

    #[test]
    fn test_register_game_cross_source_unique() {
        let db = test_db();
        let steam_id = db.register_game("steam", "12345", "Game").unwrap();
        let epic_id = db.register_game("epic", "12345", "Game").unwrap();
        let gog_id = db.register_game("gog", "12345", "Game").unwrap();
        assert_ne!(steam_id, epic_id);
        assert_ne!(steam_id, gog_id);
        assert_ne!(epic_id, gog_id);
    }

    #[test]
    fn test_register_game_all_sources() {
        let db = test_db();
        let sources = [
            "steam",
            "manual",
            "epic",
            "gog",
            "ea_app",
            "ubisoft",
            "battlenet",
        ];
        for source in sources {
            let gid = db.register_game(source, "test-id", "Test Game").unwrap();
            assert!(
                !gid.is_empty(),
                "game_id should not be empty for source '{}'",
                source
            );
            let (s, sid) = db.get_game_source(&gid).unwrap().unwrap();
            assert_eq!(s, source);
            assert_eq!(sid, "test-id");
        }
    }

    // ── Game Images (Cover Art) ─────────────────────────────────────

    #[test]
    fn test_cache_game_image_roundtrip() {
        let db = test_db();
        ensure_game(&db, "game-1");
        db.cache_game_image(
            "game-1",
            "grid",
            "https://cdn.example.com/img.jpg",
            "steamgriddb",
            false,
        )
        .unwrap();
        let url = db.get_game_image("game-1", "grid").unwrap();
        assert_eq!(url, Some("https://cdn.example.com/img.jpg".to_string()));
    }

    #[test]
    fn test_cache_game_image_upsert() {
        let db = test_db();
        ensure_game(&db, "game-1");
        db.cache_game_image(
            "game-1",
            "grid",
            "https://old.com/img.jpg",
            "steamgriddb",
            false,
        )
        .unwrap();
        db.cache_game_image(
            "game-1",
            "grid",
            "https://new.com/img.jpg",
            "steamgriddb",
            false,
        )
        .unwrap();
        let url = db.get_game_image("game-1", "grid").unwrap();
        assert_eq!(url, Some("https://new.com/img.jpg".to_string()));
    }

    #[test]
    fn test_game_image_not_found() {
        let db = test_db();
        let url = db.get_game_image("nonexistent", "grid").unwrap();
        assert!(url.is_none());
    }

    #[test]
    fn test_get_games_missing_images() {
        let db = test_db();
        // Register a Steam game (should be excluded)
        db.register_game("steam", "440", "TF2").unwrap();
        // Register non-Steam games
        let epic_id = db.register_game("epic", "Fortnite", "Fortnite").unwrap();
        let gog_id = db.register_game("gog", "12345", "Witcher 3").unwrap();

        // Give one of them an image
        db.cache_game_image(
            &epic_id,
            "grid",
            "https://example.com/fortnite.jpg",
            "steamgriddb",
            false,
        )
        .unwrap();

        let missing = db.get_games_missing_images().unwrap();
        // Only the GOG game should be missing
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0].0, gog_id);
        assert_eq!(missing[0].1, "gog");
        assert_eq!(missing[0].2, "12345");
        assert_eq!(missing[0].3, "Witcher 3");
    }

    #[test]
    fn test_cache_game_image_user_selected() {
        let db = test_db();
        ensure_game(&db, "game-1");
        db.cache_game_image(
            "game-1",
            "grid",
            "https://user-pick.com/img.jpg",
            "steamgriddb",
            true,
        )
        .unwrap();
        let url = db.get_game_image("game-1", "grid").unwrap();
        assert_eq!(url, Some("https://user-pick.com/img.jpg".to_string()));
        assert!(db.is_user_selected_image("game-1", "grid").unwrap());
        assert!(!db.is_user_selected_image("game-1", "hero").unwrap());
    }

    #[test]
    fn test_user_selected_skips_ttl() {
        let db = test_db();
        ensure_game(&db, "game-1");
        // Insert with user_selected = true and a very old cached_at
        db.conn
            .execute(
                "INSERT INTO game_images (game_id, image_type, image_url, source, cached_at, user_selected)
                 VALUES ('game-1', 'grid', 'https://user.com/img.jpg', 'steamgriddb', 0, 1)",
                [],
            )
            .unwrap();
        // Should still be returned despite expired TTL
        let url = db.get_game_image("game-1", "grid").unwrap();
        assert_eq!(url, Some("https://user.com/img.jpg".to_string()));
    }

    #[test]
    fn test_is_user_selected_image() {
        let db = test_db();
        ensure_game(&db, "game-1");
        // Not found → false
        assert!(!db.is_user_selected_image("game-1", "grid").unwrap());
        // Auto-selected → false
        db.cache_game_image(
            "game-1",
            "grid",
            "https://auto.com/img.jpg",
            "steamgriddb",
            false,
        )
        .unwrap();
        assert!(!db.is_user_selected_image("game-1", "grid").unwrap());
        // User-selected → true
        db.cache_game_image(
            "game-1",
            "grid",
            "https://user.com/img.jpg",
            "steamgriddb",
            true,
        )
        .unwrap();
        assert!(db.is_user_selected_image("game-1", "grid").unwrap());
    }

    // ── Custom Art (v1.5.0) Tests ───────────────────────────────────

    #[test]
    fn test_cache_game_image_local() {
        let db = test_db();
        ensure_game(&db, "g1");
        db.cache_game_image_local("g1", "grid", "C:\\art\\g1_grid.png", "custom_upload", true)
            .unwrap();
        let path = db.get_game_image_local_path("g1", "grid").unwrap();
        assert_eq!(path, Some("C:\\art\\g1_grid.png".to_string()));
        assert!(db.is_user_selected_image("g1", "grid").unwrap());
    }

    #[test]
    fn test_get_game_image_with_local_remote() {
        let db = test_db();
        ensure_game(&db, "g1");
        // No image → None
        assert!(db
            .get_game_image_with_local("g1", "grid")
            .unwrap()
            .is_none());

        // Remote image
        db.cache_game_image("g1", "grid", "https://cdn.com/img.jpg", "sgdb", true)
            .unwrap();
        let result = db.get_game_image_with_local("g1", "grid").unwrap().unwrap();
        assert_eq!(result.0, "https://cdn.com/img.jpg");
        assert!(result.1.is_none());
    }

    #[test]
    fn test_get_game_image_with_local_custom() {
        let db = test_db();
        ensure_game(&db, "g1");
        db.cache_game_image_local("g1", "grid", "C:\\art\\g1.png", "custom_upload", true)
            .unwrap();
        let result = db.get_game_image_with_local("g1", "grid").unwrap().unwrap();
        assert_eq!(result.1, Some("C:\\art\\g1.png".to_string()));
    }

    #[test]
    fn test_delete_game_image() {
        let db = test_db();
        ensure_game(&db, "g1");
        db.cache_game_image("g1", "grid", "https://cdn.com/img.jpg", "sgdb", true)
            .unwrap();
        assert!(db.get_game_image("g1", "grid").unwrap().is_some());
        db.delete_game_image("g1", "grid").unwrap();
        assert!(db.get_game_image("g1", "grid").unwrap().is_none());
    }

    #[test]
    fn test_get_all_game_images() {
        let db = test_db();
        ensure_game(&db, "g1");
        db.cache_game_image("g1", "grid", "https://grid.jpg", "sgdb", false)
            .unwrap();
        db.cache_game_image("g1", "hero", "https://hero.jpg", "sgdb", true)
            .unwrap();
        db.cache_game_image_local("g1", "logo", "C:\\art\\g1_logo.png", "custom_upload", true)
            .unwrap();
        let images = db.get_all_game_images("g1").unwrap();
        assert_eq!(images.len(), 3);
    }

    #[test]
    fn test_local_image_replaces_remote() {
        let db = test_db();
        ensure_game(&db, "g1");
        // First set a remote image
        db.cache_game_image("g1", "grid", "https://remote.jpg", "sgdb", false)
            .unwrap();
        // Then upload a local one (should replace)
        db.cache_game_image_local("g1", "grid", "C:\\art\\g1.png", "custom_upload", true)
            .unwrap();
        let result = db.get_game_image_with_local("g1", "grid").unwrap().unwrap();
        assert_eq!(result.1, Some("C:\\art\\g1.png".to_string()));
        assert!(db.is_user_selected_image("g1", "grid").unwrap());
    }

    // ── Custom Game Management Tests ───────────────────────────────

    #[test]
    fn test_delete_game_cascades() {
        let db = test_db();
        let game_id = db
            .register_game("manual", "my-game-1", "Test Game")
            .unwrap();

        // Populate related tables
        db.set_install_path(&game_id, "C:\\Games\\Test").unwrap();
        db.add_game_executable(&game_id, "C:\\Games\\Test\\game.exe", "game.exe")
            .unwrap();
        db.cache_game_image(
            &game_id,
            "grid",
            "https://img.com/grid.jpg",
            "steamgriddb",
            false,
        )
        .unwrap();
        let tag = db.create_tag("RPG", 0).unwrap();
        db.set_game_tags(&game_id, &[tag.id]).unwrap();

        // Verify data exists before delete
        assert!(db.get_primary_executable(&game_id).unwrap().is_some());
        assert!(db.get_game_image(&game_id, "grid").unwrap().is_some());

        // Delete the game
        db.delete_game(&game_id).unwrap();

        // Verify all related data is gone
        assert!(db.get_primary_executable(&game_id).unwrap().is_none());
        assert!(db.get_game_image(&game_id, "grid").unwrap().is_none());
        assert!(db.get_game_source(&game_id).unwrap().is_none());
        let tag_ids = db.get_game_tag_ids(&game_id).unwrap();
        assert!(tag_ids.is_empty());
    }

    #[test]
    fn test_get_manual_games() {
        let db = test_db();

        // Register a manual game and a steam game
        let manual_id = db
            .register_game("manual", "custom-1", "Custom Game")
            .unwrap();
        let _steam_id = db.register_game("steam", "12345", "Steam Game").unwrap();

        db.set_install_path(&manual_id, "C:\\Games\\Custom")
            .unwrap();
        db.set_game_description(&manual_id, "My favorite game")
            .unwrap();

        let manual_games = db.get_manual_games().unwrap();
        assert_eq!(manual_games.len(), 1);

        let (id, source_id, name, install_path, description, launch_args) = &manual_games[0];
        assert_eq!(id, &manual_id);
        assert_eq!(source_id, "custom-1");
        assert_eq!(name, "Custom Game");
        assert_eq!(install_path, &Some("C:\\Games\\Custom".to_string()));
        assert_eq!(description, &Some("My favorite game".to_string()));
        assert_eq!(launch_args, &None);
    }

    #[test]
    fn test_game_description_roundtrip() {
        let db = test_db();
        let game_id = db.register_game("manual", "desc-1", "Desc Game").unwrap();

        // No description initially
        assert!(db.get_game_description(&game_id).unwrap().is_none());

        // Set description
        db.set_game_description(&game_id, "A great game").unwrap();
        assert_eq!(
            db.get_game_description(&game_id).unwrap(),
            Some("A great game".to_string())
        );

        // Update description
        db.set_game_description(&game_id, "An amazing game")
            .unwrap();
        assert_eq!(
            db.get_game_description(&game_id).unwrap(),
            Some("An amazing game".to_string())
        );
    }

    #[test]
    fn test_update_game_name() {
        let db = test_db();
        let game_id = db.register_game("manual", "name-1", "Old Name").unwrap();

        db.update_game_name(&game_id, "New Name").unwrap();

        let (source, _source_id) = db.get_game_source(&game_id).unwrap().unwrap();
        assert_eq!(source, "manual");
        // Verify via get_manual_games which returns the name
        let manuals = db.get_manual_games().unwrap();
        assert_eq!(manuals[0].2, "New Name");
    }

    #[test]
    fn test_delete_game_executables() {
        let db = test_db();
        let game_id = db.register_game("manual", "exe-1", "Exe Game").unwrap();

        db.add_game_executable(&game_id, "C:\\a.exe", "a.exe")
            .unwrap();
        db.add_game_executable(&game_id, "C:\\b.exe", "b.exe")
            .unwrap();
        assert!(db.get_primary_executable(&game_id).unwrap().is_some());

        db.delete_game_executables(&game_id).unwrap();
        assert!(db.get_primary_executable(&game_id).unwrap().is_none());
    }

    #[test]
    fn test_delete_nonexistent_game_is_ok() {
        let db = test_db();
        // Deleting a game that doesn't exist should not error
        db.delete_game("nonexistent-id").unwrap();
    }

    #[test]
    fn test_clear_achievement_cache() {
        let db = test_db();
        let game_id = db.register_game("steam", "440", "Team Fortress 2").unwrap();

        // Insert some achievement data + mark as checked
        let achievement = GameAchievement {
            api_name: "TF_PLAY_GAME_EVERYCLASS".to_string(),
            display_name: "Head of the Class".to_string(),
            description: Some("Play a complete round with every class.".to_string()),
            icon_url: None,
            icon_gray_url: None,
            hidden: false,
            achieved: true,
            unlock_time: Some(1234567890),
            global_percent: Some(45.2),
        };
        db.cache_game_achievements(&game_id, &[achievement])
            .unwrap();
        db.mark_achievements_checked(&game_id).unwrap();

        // Verify data exists
        assert!(db.is_achievements_fresh(&game_id).unwrap());
        assert_eq!(db.get_game_achievements(&game_id).unwrap().len(), 1);

        // Clear and verify
        let deleted = db.clear_achievement_cache().unwrap();
        assert!(deleted > 0);
        assert!(!db.is_achievements_fresh(&game_id).unwrap());
        assert!(db.get_game_achievements(&game_id).unwrap().is_empty());
    }

    // ── Store API Enrichment Tests ──────────────────────────────────

    #[test]
    fn test_get_games_needing_enrichment() {
        let db = test_db();
        let game_id = db.register_game("steam", "440", "TF2").unwrap();

        // Insert SteamSpy-only metadata (short_description = NULL)
        let now = chrono::Utc::now().timestamp();
        db.conn
            .execute(
                "INSERT INTO store_metadata (game_id, name, cached_at) VALUES (?1, ?2, ?3)",
                params![game_id, "TF2", now],
            )
            .unwrap();

        let needing = db.get_games_needing_enrichment().unwrap();
        assert_eq!(needing.len(), 1);
        assert_eq!(needing[0], game_id);

        // Non-Steam games should not appear
        let manual_id = db.register_game("manual", "my-game", "My Game").unwrap();
        db.conn
            .execute(
                "INSERT INTO store_metadata (game_id, name, cached_at) VALUES (?1, ?2, ?3)",
                params![manual_id, "My Game", now],
            )
            .unwrap();
        let needing = db.get_games_needing_enrichment().unwrap();
        assert_eq!(needing.len(), 1); // still just the Steam game

        // After enrichment with short_description, should disappear
        db.conn
            .execute(
                "UPDATE store_metadata SET short_description = 'A great game' WHERE game_id = ?1",
                params![game_id],
            )
            .unwrap();
        let needing = db.get_games_needing_enrichment().unwrap();
        assert!(needing.is_empty());
    }

    #[test]
    fn test_is_game_enriched() {
        let db = test_db();
        ensure_game(&db, "g1");
        let now = chrono::Utc::now().timestamp();

        // Non-existent game → false
        assert!(!db.is_game_enriched("nonexistent").unwrap());

        // SteamSpy-only (no short_description) → false
        db.conn
            .execute(
                "INSERT INTO store_metadata (game_id, name, cached_at) VALUES ('g1', 'Game 1', ?1)",
                params![now],
            )
            .unwrap();
        assert!(!db.is_game_enriched("g1").unwrap());

        // Enriched (has short_description) → true
        db.conn
            .execute(
                "UPDATE store_metadata SET short_description = 'Desc' WHERE game_id = 'g1'",
                [],
            )
            .unwrap();
        assert!(db.is_game_enriched("g1").unwrap());
    }

    #[test]
    fn test_enrich_store_metadata_preserves_tags() {
        use crate::models::metadata::*;

        let db = test_db();
        ensure_game(&db, "g1");
        let now = chrono::Utc::now().timestamp();

        // Start with SteamSpy-only data including tags
        db.conn
            .execute(
                "INSERT INTO store_metadata (game_id, name, cached_at, steam_tags)
                 VALUES ('g1', 'Game 1', ?1, ?2)",
                params![now, r#"[{"name":"Action","votes":100}]"#],
            )
            .unwrap();

        // Enrich with Store API data
        let enrichment = StoreMetadata {
            game_id: "g1".to_string(),
            name: "Game 1 Full Name".to_string(),
            short_description: Some("A great game".to_string()),
            header_image_url: Some("https://example.com/img.jpg".to_string()),
            developers: vec!["Dev Studio".to_string()],
            publishers: vec!["Publisher".to_string()],
            genres: vec![GenreInfo {
                id: "1".to_string(),
                description: "Action".to_string(),
            }],
            categories: vec![CategoryInfo {
                id: 1,
                description: "Single-player".to_string(),
            }],
            screenshots: Vec::new(),
            release_date: Some("2023-01-01".to_string()),
            metacritic_score: Some(85),
            metacritic_url: Some("https://metacritic.com".to_string()),
            steam_tags: Vec::new(), // Should NOT overwrite existing tags
        };
        db.enrich_store_metadata(&enrichment).unwrap();

        let fetched = db.get_store_metadata("g1").unwrap().unwrap();
        assert_eq!(fetched.short_description, Some("A great game".to_string()));
        assert_eq!(fetched.name, "Game 1 Full Name");
        assert_eq!(fetched.developers, vec!["Dev Studio"]);
        assert_eq!(fetched.metacritic_score, Some(85));
        // SteamSpy tags preserved (enrich_store_metadata does not touch steam_tags)
        assert_eq!(fetched.steam_tags.len(), 1);
        assert_eq!(fetched.steam_tags[0].name, "Action");
        assert!(db.is_game_enriched("g1").unwrap());
    }

    // ── Game Notes ──────────────────────────────────────────────────

    #[test]
    fn test_game_note_crud() {
        let db = test_db();
        let gid = "test-game-id";

        // Initially empty
        assert!(db.get_game_note(gid).unwrap().is_none());

        // Save
        let saved = db.save_game_note(gid, "Hello world").unwrap();
        assert_eq!(saved.game_id, gid);
        assert_eq!(saved.content, "Hello world");

        // Get
        let fetched = db.get_game_note(gid).unwrap().unwrap();
        assert_eq!(fetched.content, "Hello world");

        // Update (upsert)
        let updated = db.save_game_note(gid, "Updated content").unwrap();
        assert_eq!(updated.content, "Updated content");
        let fetched2 = db.get_game_note(gid).unwrap().unwrap();
        assert_eq!(fetched2.content, "Updated content");

        // Delete
        db.delete_game_note(gid).unwrap();
        assert!(db.get_game_note(gid).unwrap().is_none());
    }

    #[test]
    fn test_general_note() {
        let db = test_db();

        // __general__ note works without a games table entry
        let saved = db
            .save_game_note("__general__", "General scratchpad")
            .unwrap();
        assert_eq!(saved.game_id, "__general__");
        assert_eq!(saved.content, "General scratchpad");

        let fetched = db.get_game_note("__general__").unwrap().unwrap();
        assert_eq!(fetched.content, "General scratchpad");
    }

    #[test]
    fn test_get_all_notes_with_content() {
        let db = test_db();

        // Register a game so the JOIN resolves a name
        let game_id = db.register_game("steam", "12345", "Test Game").unwrap();

        db.save_game_note(&game_id, "Game note content").unwrap();
        db.save_game_note("__general__", "General content").unwrap();
        // Empty and whitespace notes should persist once created
        db.save_game_note("empty-note-game", "").unwrap();
        db.save_game_note("whitespace-note", "   ").unwrap();

        let notes = db.get_all_notes_with_content().unwrap();
        // All 4 notes should be returned (empty/whitespace notes persist)
        assert_eq!(notes.len(), 4);

        // General should be first
        assert_eq!(notes[0].game_id, "__general__");
        assert!(notes[0].game_name.is_none());
        assert_eq!(notes[0].content, "General content");

        // The registered game note should exist somewhere in the remaining notes
        // (order among same-timestamp notes is by game_id ASC)
        let game_note = notes.iter().find(|n| n.game_id == game_id).unwrap();
        assert_eq!(game_note.game_name, Some("Test Game".to_string()));
        assert_eq!(game_note.content, "Game note content");
    }

    #[test]
    fn test_general_note_auto_created() {
        let db = test_db();

        // get_all_notes should auto-create the __general__ note even if none exist
        let notes = db.get_all_notes_with_content().unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].game_id, "__general__");
        assert_eq!(notes[0].content, "");

        // Writing to it should update, not duplicate
        db.save_game_note("__general__", "Hello").unwrap();
        let notes = db.get_all_notes_with_content().unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].content, "Hello");
    }

    // ── Game Ratings ──────────────────────────────────────────────

    #[test]
    fn test_game_rating_crud() {
        let db = test_db();
        let game_id = db.register_game("steam", "440", "TF2").unwrap();

        // Initially empty
        assert!(db.get_game_rating(&game_id).unwrap().is_none());

        // Save rating without review
        let saved = db.save_game_rating(&game_id, 8, None).unwrap();
        assert_eq!(saved.rating, 8);
        assert!(saved.review.is_none());

        // Get
        let fetched = db.get_game_rating(&game_id).unwrap().unwrap();
        assert_eq!(fetched.rating, 8);
        assert_eq!(fetched.game_id, game_id);

        // Update with review
        let updated = db
            .save_game_rating(&game_id, 9, Some("Great game!"))
            .unwrap();
        assert_eq!(updated.rating, 9);
        assert_eq!(updated.review.as_deref(), Some("Great game!"));

        // Verify single row (upsert, not duplicate)
        let all = db.get_all_ratings().unwrap();
        assert_eq!(all.len(), 1);

        // Delete
        db.delete_game_rating(&game_id).unwrap();
        assert!(db.get_game_rating(&game_id).unwrap().is_none());
    }

    #[test]
    fn test_rating_deleted_with_game() {
        let db = test_db();
        let game_id = db.register_game("steam", "999", "Deletable").unwrap();
        db.save_game_rating(&game_id, 7, Some("Decent")).unwrap();
        assert!(db.get_game_rating(&game_id).unwrap().is_some());

        db.delete_game(&game_id).unwrap();
        assert!(db.get_game_rating(&game_id).unwrap().is_none());
    }

    // ── Media Bookmarks ──────────────────────────────────────────────

    #[test]
    fn test_media_bookmark_crud() {
        let db = test_db();

        // Initially empty
        let bookmarks = db.get_media_bookmarks().unwrap();
        assert!(bookmarks.is_empty());

        // Add two bookmarks
        let bm1 = db
            .add_media_bookmark("Lo-fi Beats", "https://youtube.com/watch?v=abc", None)
            .unwrap();
        assert_eq!(bm1.title, "Lo-fi Beats");
        assert_eq!(bm1.sort_order, 0);
        assert!(bm1.icon.is_none());

        let bm2 = db
            .add_media_bookmark(
                "Spotify Playlist",
                "https://open.spotify.com/playlist/123",
                Some("🎵"),
            )
            .unwrap();
        assert_eq!(bm2.sort_order, 1);
        assert_eq!(bm2.icon.as_deref(), Some("🎵"));

        // List should return both ordered
        let bookmarks = db.get_media_bookmarks().unwrap();
        assert_eq!(bookmarks.len(), 2);
        assert_eq!(bookmarks[0].id, bm1.id);
        assert_eq!(bookmarks[1].id, bm2.id);

        // Update first bookmark
        db.update_media_bookmark(
            bm1.id,
            "Chill Beats",
            "https://youtube.com/watch?v=xyz",
            Some("🎶"),
        )
        .unwrap();
        let bookmarks = db.get_media_bookmarks().unwrap();
        assert_eq!(bookmarks[0].title, "Chill Beats");
        assert_eq!(bookmarks[0].url, "https://youtube.com/watch?v=xyz");
        assert_eq!(bookmarks[0].icon.as_deref(), Some("🎶"));

        // Update non-existent bookmark
        let err = db
            .update_media_bookmark(9999, "Ghost", "https://x.com", None)
            .unwrap_err();
        assert!(err.to_string().contains("not found"));

        // Delete
        db.delete_media_bookmark(bm1.id).unwrap();
        let bookmarks = db.get_media_bookmarks().unwrap();
        assert_eq!(bookmarks.len(), 1);
        assert_eq!(bookmarks[0].id, bm2.id);
    }

    #[test]
    fn test_media_bookmark_reorder() {
        let db = test_db();

        let bm1 = db
            .add_media_bookmark("First", "https://a.com", None)
            .unwrap();
        let bm2 = db
            .add_media_bookmark("Second", "https://b.com", None)
            .unwrap();
        let bm3 = db
            .add_media_bookmark("Third", "https://c.com", None)
            .unwrap();

        // Reverse order
        db.reorder_media_bookmarks(&[bm3.id, bm2.id, bm1.id])
            .unwrap();

        let bookmarks = db.get_media_bookmarks().unwrap();
        assert_eq!(bookmarks[0].id, bm3.id);
        assert_eq!(bookmarks[0].sort_order, 0);
        assert_eq!(bookmarks[1].id, bm2.id);
        assert_eq!(bookmarks[1].sort_order, 1);
        assert_eq!(bookmarks[2].id, bm1.id);
        assert_eq!(bookmarks[2].sort_order, 2);
    }

    // ── AI Context Queries ─────────────────────────────────────────

    #[test]
    fn test_get_all_game_names() {
        let db = test_db();
        let g1 = db.register_game("steam", "100", "Half-Life 2").unwrap();
        let g2 = db.register_game("epic", "200", "Fortnite").unwrap();
        let names = db.get_all_game_names().unwrap();
        assert_eq!(names.len(), 2);
        let ids: Vec<&str> = names.iter().map(|(id, _)| id.as_str()).collect();
        assert!(ids.contains(&g1.as_str()));
        assert!(ids.contains(&g2.as_str()));
        let name_strs: Vec<&str> = names.iter().map(|(_, n)| n.as_str()).collect();
        assert!(name_strs.contains(&"Half-Life 2"));
        assert!(name_strs.contains(&"Fortnite"));
    }

    #[test]
    fn test_get_distinct_genres() {
        let db = test_db();
        let g1 = db.register_game("steam", "100", "Game A").unwrap();
        let g2 = db.register_game("steam", "200", "Game B").unwrap();

        let mut meta1 = make_metadata(&g1);
        meta1.genres = vec![
            GenreInfo {
                id: "1".into(),
                description: "Action".into(),
            },
            GenreInfo {
                id: "4".into(),
                description: "RPG".into(),
            },
        ];
        db.cache_store_metadata(&meta1).unwrap();

        let mut meta2 = make_metadata(&g2);
        meta2.genres = vec![
            GenreInfo {
                id: "4".into(),
                description: "RPG".into(),
            },
            GenreInfo {
                id: "25".into(),
                description: "Adventure".into(),
            },
        ];
        db.cache_store_metadata(&meta2).unwrap();

        let genres = db.get_distinct_genres().unwrap();
        assert_eq!(genres.len(), 3);
        let ids: HashSet<&str> = genres.iter().map(|(id, _)| id.as_str()).collect();
        assert!(ids.contains("1"));
        assert!(ids.contains("4"));
        assert!(ids.contains("25"));
    }

    #[test]
    fn test_get_distinct_steam_tags() {
        let db = test_db();
        let g1 = db.register_game("steam", "100", "Game A").unwrap();
        let g2 = db.register_game("steam", "200", "Game B").unwrap();

        let mut meta1 = make_metadata(&g1);
        meta1.steam_tags = vec![
            SteamTagInfo {
                name: "Action".into(),
                votes: 100,
            },
            SteamTagInfo {
                name: "Singleplayer".into(),
                votes: 80,
            },
        ];
        db.cache_store_metadata(&meta1).unwrap();

        let mut meta2 = make_metadata(&g2);
        meta2.steam_tags = vec![
            SteamTagInfo {
                name: "Singleplayer".into(),
                votes: 90,
            },
            SteamTagInfo {
                name: "Open World".into(),
                votes: 70,
            },
        ];
        db.cache_store_metadata(&meta2).unwrap();

        let tags = db.get_distinct_steam_tags().unwrap();
        assert_eq!(tags.len(), 3);
        assert!(tags.contains(&"Action".to_string()));
        assert!(tags.contains(&"Singleplayer".to_string()));
        assert!(tags.contains(&"Open World".to_string()));
    }

    #[test]
    fn test_get_distinct_categories() {
        let db = test_db();
        let g1 = db.register_game("steam", "100", "Game A").unwrap();
        let g2 = db.register_game("steam", "200", "Game B").unwrap();

        let mut meta1 = make_metadata(&g1);
        meta1.categories = vec![
            CategoryInfo {
                id: 2,
                description: "Single-player".into(),
            },
            CategoryInfo {
                id: 22,
                description: "Steam Achievements".into(),
            },
        ];
        db.cache_store_metadata(&meta1).unwrap();

        let mut meta2 = make_metadata(&g2);
        meta2.categories = vec![
            CategoryInfo {
                id: 22,
                description: "Steam Achievements".into(),
            },
            CategoryInfo {
                id: 28,
                description: "Full controller support".into(),
            },
        ];
        db.cache_store_metadata(&meta2).unwrap();

        let cats = db.get_distinct_categories().unwrap();
        assert_eq!(cats.len(), 3);
        let ids: HashSet<u32> = cats.iter().map(|(id, _)| *id).collect();
        assert!(ids.contains(&2));
        assert!(ids.contains(&22));
        assert!(ids.contains(&28));
    }

    // ── Cloud AI Context Queries ─────────────────────────────────

    #[test]
    fn test_game_count_by_source() {
        let db = test_db();
        db.register_game("steam", "1", "Game A").unwrap();
        db.register_game("steam", "2", "Game B").unwrap();
        db.register_game("epic", "3", "Game C").unwrap();
        db.register_game("gog", "4", "Game D").unwrap();

        let counts = db.get_game_count_by_source().unwrap();
        assert_eq!(counts.len(), 3);
        // Steam should be first (most games)
        assert_eq!(counts[0].0, "steam");
        assert_eq!(counts[0].1, 2);
        // Epic and GOG have 1 each
        let non_steam: Vec<u32> = counts[1..].iter().map(|(_, c)| *c).collect();
        assert!(non_steam.iter().all(|c| *c == 1));
    }

    #[test]
    fn test_game_count_by_source_empty() {
        let db = test_db();
        let counts = db.get_game_count_by_source().unwrap();
        assert!(counts.is_empty());
    }

    #[test]
    fn test_top_games_by_playtime() {
        let db = test_db();
        let g1 = db.register_game("steam", "1", "Heavy Player").unwrap();
        let g2 = db.register_game("steam", "2", "Light Player").unwrap();
        let _g3 = db.register_game("steam", "3", "No Playtime").unwrap();

        // Add playtime snapshots (in minutes)
        db.insert_snapshot(&g1, 6000, chrono::Utc::now().timestamp())
            .unwrap(); // 100 hours
        db.insert_snapshot(&g2, 120, chrono::Utc::now().timestamp())
            .unwrap(); // 2 hours

        let top = db.get_top_games_by_playtime(10).unwrap();
        assert_eq!(top.len(), 2);
        assert_eq!(top[0].1, "Heavy Player");
        assert!((top[0].2 - 100.0).abs() < 0.1);
        assert_eq!(top[1].1, "Light Player");
        assert!((top[1].2 - 2.0).abs() < 0.1);
    }

    #[test]
    fn test_top_games_by_playtime_limit() {
        let db = test_db();
        let g1 = db.register_game("steam", "1", "Game A").unwrap();
        let g2 = db.register_game("steam", "2", "Game B").unwrap();
        let g3 = db.register_game("steam", "3", "Game C").unwrap();

        db.insert_snapshot(&g1, 300, chrono::Utc::now().timestamp())
            .unwrap();
        db.insert_snapshot(&g2, 200, chrono::Utc::now().timestamp())
            .unwrap();
        db.insert_snapshot(&g3, 100, chrono::Utc::now().timestamp())
            .unwrap();

        let top = db.get_top_games_by_playtime(2).unwrap();
        assert_eq!(top.len(), 2);
        assert_eq!(top[0].1, "Game A");
        assert_eq!(top[1].1, "Game B");
    }

    #[test]
    fn test_recently_played_game_names() {
        let db = test_db();
        let g1 = db.register_game("steam", "1", "First Game").unwrap();
        let g2 = db.register_game("steam", "2", "Second Game").unwrap();

        let now = chrono::Utc::now().timestamp();
        // g1 played first
        let s1 = db.start_session(&g1, now - 3600).unwrap();
        db.close_session(s1, now - 3000, 10).unwrap();
        // g2 played later
        let s2 = db.start_session(&g2, now - 1000).unwrap();
        db.close_session(s2, now - 500, 8).unwrap();

        let recent = db.get_recently_played_game_names(10).unwrap();
        assert_eq!(recent.len(), 2);
        assert_eq!(recent[0].1, "Second Game"); // Most recent first
        assert_eq!(recent[1].1, "First Game");
    }

    #[test]
    fn test_recently_played_game_names_excludes_active() {
        let db = test_db();
        let g1 = db.register_game("steam", "1", "Closed Game").unwrap();
        let g2 = db.register_game("steam", "2", "Active Game").unwrap();

        let now = chrono::Utc::now().timestamp();
        let s1 = db.start_session(&g1, now - 3600).unwrap();
        db.close_session(s1, now - 3000, 10).unwrap();
        // g2 still active (no close)
        db.start_session(&g2, now - 500).unwrap();

        let recent = db.get_recently_played_game_names(10).unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].1, "Closed Game");
    }

    #[test]
    fn test_favorite_game_names() {
        let db = test_db();
        let g1 = db.register_game("steam", "1", "Alpha Game").unwrap();
        let _g2 = db.register_game("steam", "2", "Beta Game").unwrap();
        let g3 = db.register_game("steam", "3", "Gamma Game").unwrap();

        db.set_favorite(&g1, true).unwrap();
        db.set_favorite(&g3, true).unwrap();
        // g2 is NOT a favorite

        let names = db.get_favorite_game_names(10).unwrap();
        assert_eq!(names.len(), 2);
        assert_eq!(names[0].1, "Alpha Game"); // Alphabetical order
        assert_eq!(names[1].1, "Gamma Game");
    }

    #[test]
    fn test_favorite_game_names_limit() {
        let db = test_db();
        let g1 = db.register_game("steam", "1", "Game A").unwrap();
        let g2 = db.register_game("steam", "2", "Game B").unwrap();
        let g3 = db.register_game("steam", "3", "Game C").unwrap();

        db.set_favorite(&g1, true).unwrap();
        db.set_favorite(&g2, true).unwrap();
        db.set_favorite(&g3, true).unwrap();

        let names = db.get_favorite_game_names(2).unwrap();
        assert_eq!(names.len(), 2);
    }

    #[test]
    fn test_genre_distribution() {
        let db = test_db();
        let g1 = db.register_game("steam", "1", "Game A").unwrap();
        let g2 = db.register_game("steam", "2", "Game B").unwrap();

        let mut meta1 = make_metadata(&g1);
        meta1.genres = vec![
            GenreInfo {
                id: "1".into(),
                description: "Action".into(),
            },
            GenreInfo {
                id: "2".into(),
                description: "RPG".into(),
            },
        ];
        db.cache_store_metadata(&meta1).unwrap();

        let mut meta2 = make_metadata(&g2);
        meta2.genres = vec![
            GenreInfo {
                id: "1".into(),
                description: "Action".into(),
            },
            GenreInfo {
                id: "3".into(),
                description: "Strategy".into(),
            },
        ];
        db.cache_store_metadata(&meta2).unwrap();

        let dist = db.get_genre_distribution().unwrap();
        // Action appears in both games, should be first
        assert_eq!(dist[0].0, "Action");
        assert_eq!(dist[0].1, 2);
        // RPG and Strategy each appear once
        assert_eq!(dist.len(), 3);
        assert!(dist[1..].iter().all(|(_, count)| *count == 1));
    }

    #[test]
    fn test_genre_distribution_empty() {
        let db = test_db();
        let dist = db.get_genre_distribution().unwrap();
        assert!(dist.is_empty());
    }

    #[test]
    fn test_installed_game_ids() {
        let db = test_db();
        let g1 = db.register_game("steam", "1", "Installed Game").unwrap();
        let _g2 = db.register_game("steam", "2", "Not Installed").unwrap();
        let g3 = db.register_game("epic", "3", "Also Installed").unwrap();

        db.set_install_path(&g1, "/games/installed").unwrap();
        db.set_install_path(&g3, "/games/also").unwrap();

        let ids = db.get_installed_game_ids().unwrap();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&g1));
        assert!(ids.contains(&g3));
    }

    #[test]
    fn test_installed_game_ids_empty() {
        let db = test_db();
        db.register_game("steam", "1", "Game A").unwrap();
        let ids = db.get_installed_game_ids().unwrap();
        assert!(ids.is_empty());
    }

    #[test]
    fn test_recently_played_game_ids() {
        let db = test_db();
        let g1 = db.register_game("steam", "1", "Recent Game").unwrap();
        let g2 = db.register_game("steam", "2", "Old Game").unwrap();
        let _g3 = db.register_game("steam", "3", "Never Played").unwrap();

        let now = chrono::Utc::now().timestamp();
        // g1 played 10 days ago
        let s1 = db.start_session(&g1, now - 10 * 86400).unwrap();
        db.close_session(s1, now - 10 * 86400 + 3600, 60).unwrap();
        // g2 played 400 days ago
        let s2 = db.start_session(&g2, now - 400 * 86400).unwrap();
        db.close_session(s2, now - 400 * 86400 + 3600, 60).unwrap();

        let ids = db.get_recently_played_game_ids(365).unwrap();
        assert_eq!(ids.len(), 1);
        assert!(ids.contains(&g1));
    }

    #[test]
    fn test_recently_played_game_ids_empty() {
        let db = test_db();
        let ids = db.get_recently_played_game_ids(365).unwrap();
        assert!(ids.is_empty());
    }

    #[test]
    fn test_set_last_played() {
        let db = test_db();
        let g1 = db.register_game("steam", "1", "Game One").unwrap();
        db.set_last_played(&g1, 1000).unwrap();
        // Verify it was set
        let val: Option<i64> = db
            .conn
            .query_row(
                "SELECT last_played FROM games WHERE game_id = ?1",
                params![g1],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(val, Some(1000));
        // Setting a lower value should not overwrite
        db.set_last_played(&g1, 500).unwrap();
        let val2: Option<i64> = db
            .conn
            .query_row(
                "SELECT last_played FROM games WHERE game_id = ?1",
                params![g1],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(val2, Some(1000));
    }

    #[test]
    fn test_recently_played_includes_last_played() {
        let db = test_db();
        let g1 = db.register_game("steam", "1", "Session Game").unwrap();
        let g2 = db.register_game("steam", "2", "Steam Last Played").unwrap();
        let _g3 = db.register_game("steam", "3", "Old Game").unwrap();

        let now = chrono::Utc::now().timestamp();
        // g1 has a session 10 days ago
        let s1 = db.start_session(&g1, now - 10 * 86400).unwrap();
        db.close_session(s1, now - 10 * 86400 + 3600, 60).unwrap();
        // g2 has no session, but Steam says it was played 5 days ago
        db.set_last_played(&g2, (now - 5 * 86400) as u64).unwrap();
        // g3 has Steam last_played 400 days ago (out of range)
        db.set_last_played(&_g3, (now - 400 * 86400) as u64)
            .unwrap();

        let ids = db.get_recently_played_game_ids(365).unwrap();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&g1));
        assert!(ids.contains(&g2));
    }

    #[test]
    fn test_get_games_with_genre_tags() {
        let db = test_db();
        let g1 = db.register_game("steam", "1", "Action Game").unwrap();
        let _g2 = db.register_game("steam", "2", "No Metadata").unwrap();

        // Insert metadata for g1 with genres and tags
        db.conn
            .execute(
                "INSERT INTO store_metadata (game_id, name, cached_at, genres, steam_tags)
                 VALUES (?1, 'Action Game', 100, ?2, ?3)",
                params![
                    g1,
                    r#"[{"id":"1","description":"Action"},{"id":"25","description":"Adventure"}]"#,
                    r#"[{"name":"FPS","votes":100},{"name":"Shooter","votes":80}]"#,
                ],
            )
            .unwrap();

        // Insert a playtime snapshot for g1
        db.insert_snapshot(&g1, 120, 100).unwrap();

        let games = db.get_games_with_genre_tags().unwrap();
        assert_eq!(games.len(), 2);

        let (_, name, genres, tags, hours, _lp) = games.iter().find(|(id, ..)| id == &g1).unwrap();
        assert_eq!(name, "Action Game");
        assert!(genres.is_some());
        assert!(tags.is_some());
        assert!((hours - 2.0).abs() < 0.01); // 120 min = 2h

        let (_, name2, genres2, tags2, hours2, _lp2) =
            games.iter().find(|(id, ..)| id == &_g2).unwrap();
        assert_eq!(name2, "No Metadata");
        assert!(genres2.is_none());
        assert!(tags2.is_none());
        assert!((hours2 - 0.0).abs() < 0.01); // no playtime
    }

    // ── News Read Tracking Tests ──────────────────────────────────

    fn make_news_items(game_id: &str, count: usize) -> Vec<GameNewsItem> {
        (0..count)
            .map(|i| GameNewsItem {
                news_id: format!("news-{}-{}", game_id, i),
                game_id: game_id.to_string(),
                title: format!("Article {}", i),
                url: format!("https://example.com/news/{}", i),
                author: "Author".to_string(),
                contents: "Content".to_string(),
                date: 1700000000 + (i as u64 * 3600),
                feed_label: "Community".to_string(),
                is_external: false,
            })
            .collect()
    }

    #[test]
    fn test_news_read_mark_and_check() {
        let db = test_db();
        let game_id = db.register_game("steam", "440", "TF2").unwrap();

        // Not read initially
        assert!(!db.is_news_read("news-1").unwrap());

        // Mark as read
        db.mark_news_read("news-1", &game_id).unwrap();
        assert!(db.is_news_read("news-1").unwrap());

        // Idempotent (INSERT OR IGNORE)
        db.mark_news_read("news-1", &game_id).unwrap();
        assert!(db.is_news_read("news-1").unwrap());
    }

    #[test]
    fn test_news_read_batch_query() {
        let db = test_db();
        let game_id = db.register_game("steam", "440", "TF2").unwrap();

        db.mark_news_read("n1", &game_id).unwrap();
        db.mark_news_read("n2", &game_id).unwrap();

        let ids = vec!["n1".to_string(), "n2".to_string(), "n3".to_string()];
        let read = db.get_read_news_ids(&ids).unwrap();
        assert!(read.contains("n1"));
        assert!(read.contains("n2"));
        assert!(!read.contains("n3"));
        assert_eq!(read.len(), 2);
    }

    #[test]
    fn test_news_read_batch_empty_input() {
        let db = test_db();
        let read = db.get_read_news_ids(&[]).unwrap();
        assert!(read.is_empty());
    }

    #[test]
    fn test_unread_news_count() {
        let db = test_db();
        let game_id = db.register_game("steam", "440", "TF2").unwrap();

        let items = make_news_items(&game_id, 5);
        db.cache_game_news(&game_id, &items).unwrap();

        // All 5 unread
        assert_eq!(db.get_unread_news_count().unwrap(), 5);

        // Mark 2 as read
        db.mark_news_read(&items[0].news_id, &game_id).unwrap();
        db.mark_news_read(&items[1].news_id, &game_id).unwrap();
        assert_eq!(db.get_unread_news_count().unwrap(), 3);
    }

    #[test]
    fn test_mark_all_news_read_for_game() {
        let db = test_db();
        let g1 = db.register_game("steam", "440", "TF2").unwrap();
        let g2 = db.register_game("steam", "730", "CS2").unwrap();

        let items1 = make_news_items(&g1, 3);
        let items2 = make_news_items(&g2, 2);
        db.cache_game_news(&g1, &items1).unwrap();
        db.cache_game_news(&g2, &items2).unwrap();

        assert_eq!(db.get_unread_news_count().unwrap(), 5);

        // Mark all news for g1 as read
        db.mark_all_news_read_for_game(&g1).unwrap();
        assert_eq!(db.get_unread_news_count().unwrap(), 2);

        // g2 news still unread
        assert!(!db.is_news_read(&items2[0].news_id).unwrap());
    }

    #[test]
    fn test_get_all_cached_news_with_read_status() {
        let db = test_db();
        let game_id = db.register_game("steam", "440", "TF2").unwrap();

        let items = make_news_items(&game_id, 3);
        db.cache_game_news(&game_id, &items).unwrap();

        // Mark one as read
        db.mark_news_read(&items[0].news_id, &game_id).unwrap();

        let rows = db.get_all_cached_news_with_read_status().unwrap();
        assert_eq!(rows.len(), 3);

        // Check read status
        let read_count = rows.iter().filter(|(_, _, is_read)| *is_read).count();
        assert_eq!(read_count, 1);

        // Check game name is populated
        let (_, name, _) = &rows[0];
        assert_eq!(name, "TF2");
    }

    #[test]
    fn test_delete_game_cascades_news_read() {
        let db = test_db();
        let game_id = db.register_game("steam", "440", "TF2").unwrap();

        let items = make_news_items(&game_id, 3);
        db.cache_game_news(&game_id, &items).unwrap();
        db.mark_news_read(&items[0].news_id, &game_id).unwrap();
        db.mark_news_read(&items[1].news_id, &game_id).unwrap();

        // Verify read records exist
        let ids = items.iter().map(|i| i.news_id.clone()).collect::<Vec<_>>();
        assert_eq!(db.get_read_news_ids(&ids).unwrap().len(), 2);

        // Delete the game
        db.delete_game(&game_id).unwrap();

        // Read records should be gone
        assert_eq!(db.get_read_news_ids(&ids).unwrap().len(), 0);
    }

    // ── Recap CRUD Tests ─────────────────────────────────────────────

    fn make_recap_data(
        period_type: &str,
        period_key: &str,
        total_minutes: u32,
    ) -> crate::models::recap::RecapData {
        use crate::models::recap::*;
        RecapData {
            version: 1,
            period_type: period_type.to_string(),
            period_key: period_key.to_string(),
            generated_at: 1700000000,
            total_minutes,
            total_sessions: 10,
            unique_games_played: 3,
            avg_session_minutes: total_minutes / 10,
            longest_session_minutes: 120,
            longest_session_game_id: "game-1".to_string(),
            longest_session_game_name: "Test Game".to_string(),
            longest_streak_days: 5,
            top_game: RecapTopGame {
                game_id: "game-1".to_string(),
                name: "Test Game".to_string(),
                minutes: total_minutes / 2,
                sessions: 5,
            },
            top_games: vec![RecapTopGame {
                game_id: "game-1".to_string(),
                name: "Test Game".to_string(),
                minutes: total_minutes / 2,
                sessions: 5,
            }],
            genre_breakdown: vec![RecapGenreEntry {
                genre: "Action".to_string(),
                minutes: total_minutes,
                percentage: 100.0,
            }],
            busiest_day: RecapBusiestDay {
                day: "Saturday".to_string(),
                minutes: total_minutes / 3,
            },
            prev_period_minutes: 0,
            new_discoveries: vec![],
            achievements_unlocked: 0,
            notable_achievements: vec![],
            fun_comparisons: vec![],
            monthly_playtime: None,
        }
    }

    #[test]
    fn test_recap_save_and_load() {
        let db = test_db();
        let recap = make_recap_data("monthly", "2025-06", 600);

        db.save_recap("2025-06", "monthly", &recap).unwrap();
        let loaded = db
            .get_recap("2025-06")
            .unwrap()
            .expect("recap should exist");

        assert_eq!(loaded.version, 1);
        assert_eq!(loaded.period_type, "monthly");
        assert_eq!(loaded.period_key, "2025-06");
        assert_eq!(loaded.total_minutes, 600);
        assert_eq!(loaded.total_sessions, 10);
        assert_eq!(loaded.unique_games_played, 3);
        assert_eq!(loaded.longest_session_minutes, 120);
        assert_eq!(loaded.longest_session_game_id, "game-1");
        assert_eq!(loaded.longest_session_game_name, "Test Game");
        assert_eq!(loaded.longest_streak_days, 5);
        assert_eq!(loaded.top_game.game_id, "game-1");
        assert_eq!(loaded.top_game.name, "Test Game");
        assert_eq!(loaded.top_game.minutes, 300);
        assert_eq!(loaded.top_games.len(), 1);
        assert_eq!(loaded.genre_breakdown.len(), 1);
        assert_eq!(loaded.genre_breakdown[0].genre, "Action");
        assert_eq!(loaded.busiest_day.day, "Saturday");
        assert!(loaded.monthly_playtime.is_none());
    }

    #[test]
    fn test_recap_list() {
        let db = test_db();
        let monthly = make_recap_data("monthly", "2025-06", 600);
        let yearly = make_recap_data("yearly", "2025", 7200);

        db.save_recap("2025-06", "monthly", &monthly).unwrap();
        db.save_recap("2025", "yearly", &yearly).unwrap();

        let summaries = db.list_recaps().unwrap();
        assert_eq!(summaries.len(), 2);

        // Ordered by period_key DESC, so "2025-06" > "2025"
        assert_eq!(summaries[0].period_key, "2025-06");
        assert_eq!(summaries[0].period_type, "monthly");
        assert_eq!(summaries[0].total_minutes, 600);
        assert_eq!(summaries[0].top_game_name, "Test Game");

        assert_eq!(summaries[1].period_key, "2025");
        assert_eq!(summaries[1].period_type, "yearly");
        assert_eq!(summaries[1].total_minutes, 7200);
    }

    #[test]
    fn test_recap_delete() {
        let db = test_db();
        let recap = make_recap_data("monthly", "2025-06", 600);
        db.save_recap("2025-06", "monthly", &recap).unwrap();

        // Verify it exists
        assert!(db.get_recap("2025-06").unwrap().is_some());

        // Delete it
        db.delete_recap("2025-06").unwrap();

        // Verify it's gone
        assert!(db.get_recap("2025-06").unwrap().is_none());
    }

    #[test]
    fn test_recap_overwrite() {
        let db = test_db();
        let recap1 = make_recap_data("monthly", "2025-06", 600);
        db.save_recap("2025-06", "monthly", &recap1).unwrap();

        // Overwrite with different data
        let recap2 = make_recap_data("monthly", "2025-06", 1200);
        db.save_recap("2025-06", "monthly", &recap2).unwrap();

        let loaded = db
            .get_recap("2025-06")
            .unwrap()
            .expect("recap should exist");
        assert_eq!(loaded.total_minutes, 1200);
        assert_eq!(loaded.top_game.minutes, 600); // 1200 / 2

        // Should still be one entry, not two
        let summaries = db.list_recaps().unwrap();
        assert_eq!(summaries.len(), 1);
    }

    #[test]
    fn test_get_sessions_in_range() {
        let db = test_db();
        ensure_game(&db, "game-a");
        ensure_game(&db, "game-b");
        ensure_game(&db, "game-c");

        // Create sessions at different timestamps
        // Session 1: start_time = 1000, inside range [1000, 2000)
        let id1 = db.start_session("game-a", 1000).unwrap();
        db.close_session(id1, 1500, 8).unwrap();

        // Session 2: start_time = 1500, inside range [1000, 2000)
        let id2 = db.start_session("game-b", 1500).unwrap();
        db.close_session(id2, 1800, 5).unwrap();

        // Session 3: start_time = 2000, outside range (at boundary, excluded)
        let id3 = db.start_session("game-a", 2000).unwrap();
        db.close_session(id3, 2500, 8).unwrap();

        // Session 4: start_time = 500, outside range (before)
        let id4 = db.start_session("game-c", 500).unwrap();
        db.close_session(id4, 900, 6).unwrap();

        // Session 5: active (no end_time), inside range but should be excluded
        let _id5 = db.start_session("game-a", 1200).unwrap();

        let sessions = db.get_sessions_in_range(1000, 2000).unwrap();
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].game_id, "game-a");
        assert_eq!(sessions[0].start_time, 1000);
        assert_eq!(sessions[1].game_id, "game-b");
        assert_eq!(sessions[1].start_time, 1500);
    }

    #[test]
    fn test_get_first_session_per_game() {
        let db = test_db();
        ensure_game(&db, "game-a");
        ensure_game(&db, "game-b");
        ensure_game(&db, "game-c");

        // game-a: sessions at 1000 and 2000 => first = 1000
        let id1 = db.start_session("game-a", 1000).unwrap();
        db.close_session(id1, 1500, 8).unwrap();
        let id2 = db.start_session("game-a", 2000).unwrap();
        db.close_session(id2, 2500, 8).unwrap();

        // game-b: session at 3000 => first = 3000
        let id3 = db.start_session("game-b", 3000).unwrap();
        db.close_session(id3, 3500, 8).unwrap();

        // game-c: only an active session (no end_time) => should be excluded
        let _id4 = db.start_session("game-c", 500).unwrap();

        let results = db.get_first_session_per_game().unwrap();
        assert_eq!(results.len(), 2);

        let map: std::collections::HashMap<String, i64> = results.into_iter().collect();
        assert_eq!(map.get("game-a"), Some(&1000));
        assert_eq!(map.get("game-b"), Some(&3000));
        assert!(!map.contains_key("game-c"));
    }

    // ── AI Personality Tests ────────────────────────────────────────

    #[test]
    fn test_list_ai_personalities_returns_builtin() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        // v1.12.5: 6 legacy (custom) + 8 new tones (builtin) = 14
        assert_eq!(personalities.len(), 14);
        let builtin_count = personalities.iter().filter(|p| p.is_builtin).count();
        assert_eq!(builtin_count, 8);
    }

    #[test]
    fn test_create_ai_personality() {
        let db = test_db();
        let p = db
            .create_ai_personality("Test Bot", "You are a test bot")
            .unwrap();
        assert_eq!(p.name, "Test Bot");
        assert!(!p.is_builtin);
        let all = db.list_ai_personalities().unwrap();
        assert_eq!(all.len(), 15); // 14 existing + 1 custom
    }

    // ── AI Avatar Tests ─────────────────────────────────────────────

    #[test]
    fn test_create_and_list_avatars() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let pid = &personalities[0].id;
        let avatar = db
            .create_ai_avatar("TestAvatar", pid, None, None, None)
            .unwrap();
        assert_eq!(avatar.name, "TestAvatar");
        assert!(!avatar.is_active);
        let avatars = db.list_ai_avatars().unwrap();
        assert_eq!(avatars.len(), 1);
    }

    #[test]
    fn test_switch_avatar() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let pid = &personalities[0].id;
        let a1 = db
            .create_ai_avatar("Avatar1", pid, None, None, None)
            .unwrap();
        let a2 = db
            .create_ai_avatar("Avatar2", pid, None, None, None)
            .unwrap();

        db.switch_ai_avatar(&a1.id).unwrap();
        let active = db.get_active_ai_avatar().unwrap().unwrap();
        assert_eq!(active.id, a1.id);

        db.switch_ai_avatar(&a2.id).unwrap();
        let active = db.get_active_ai_avatar().unwrap().unwrap();
        assert_eq!(active.id, a2.id);
    }

    #[test]
    fn test_get_active_avatar_none() {
        let db = test_db();
        assert!(db.get_active_ai_avatar().unwrap().is_none());
    }

    #[test]
    fn test_create_avatar_invalid_personality() {
        let db = test_db();
        let result = db.create_ai_avatar("Test", "nonexistent-id", None, None, None);
        assert!(result.is_err());
    }

    // ── AI Memory Tests ─────────────────────────────────────────────

    #[test]
    fn test_insert_and_get_memories() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("MemBot", &personalities[0].id, None, None, None)
            .unwrap();

        let id = db
            .insert_ai_memory_raw(&avatar.id, "encrypted_content", 5, "general", None, false)
            .unwrap();
        assert!(!id.is_empty());

        let memories = db.get_all_active_memories_raw(&avatar.id).unwrap();
        assert_eq!(memories.len(), 1);
        assert_eq!(memories[0].content, "encrypted_content");
        assert_eq!(memories[0].importance, 5);
    }

    #[test]
    fn test_soft_delete_memory() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("DelBot", &personalities[0].id, None, None, None)
            .unwrap();
        let id = db
            .insert_ai_memory_raw(&avatar.id, "content", 5, "general", None, false)
            .unwrap();

        db.soft_delete_memory(&id).unwrap();
        let memories = db.get_all_active_memories_raw(&avatar.id).unwrap();
        assert!(memories.is_empty());
    }

    #[test]
    fn test_system_memories_separate_from_vault() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("SysBot", &personalities[0].id, None, None, None)
            .unwrap();

        db.insert_ai_memory_raw(&avatar.id, "system_mem", 10, "system", None, true)
            .unwrap();
        db.insert_ai_memory_raw(&avatar.id, "regular_mem", 5, "general", None, false)
            .unwrap();

        let system = db.get_active_system_memories_raw(&avatar.id).unwrap();
        assert_eq!(system.len(), 1);
        assert!(system[0].is_system);

        let vault = db.get_active_vault_memories_raw(&avatar.id, 50).unwrap();
        assert_eq!(vault.len(), 1);
        assert!(!vault[0].is_system);
    }

    #[test]
    fn test_mark_memory_superseded() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("SupBot", &personalities[0].id, None, None, None)
            .unwrap();
        let old_id = db
            .insert_ai_memory_raw(&avatar.id, "old", 5, "general", None, false)
            .unwrap();
        let new_id = db
            .insert_ai_memory_raw(&avatar.id, "new", 7, "general", None, false)
            .unwrap();

        db.mark_memory_superseded(&old_id, &new_id).unwrap();
        let memories = db.get_all_active_memories_raw(&avatar.id).unwrap();
        assert_eq!(memories.len(), 1);
        assert_eq!(memories[0].id, new_id);
    }

    #[test]
    fn test_count_avatar_journal_entries() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("JournalBot", &personalities[0].id, None, None, None)
            .unwrap();

        // Need a conversation for FK constraint
        let conv = db.create_ai_conversation(&avatar.id).unwrap();
        let conv_id = conv.id;

        // Insert some daily log entries
        for i in 0..3 {
            db.conn
                .execute(
                    "INSERT INTO ai_daily_log (id, avatar_id, conversation_id, log_date, summary, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        format!("log_{}", i),
                        avatar.id,
                        conv_id,
                        format!("2026-01-0{}", i + 1),
                        format!("Day {} summary", i + 1),
                        "2026-01-01T00:00:00Z",
                    ],
                )
                .unwrap();
        }

        assert_eq!(db.count_avatar_journal_entries(&avatar.id).unwrap(), 3);
        // Different avatar should have 0
        let avatar2 = db
            .create_ai_avatar("Other", &personalities[0].id, None, None, None)
            .unwrap();
        assert_eq!(db.count_avatar_journal_entries(&avatar2.id).unwrap(), 0);
    }

    #[test]
    fn test_count_active_vault_memories() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("CountBot", &personalities[0].id, None, None, None)
            .unwrap();

        for i in 0..5 {
            db.insert_ai_memory_raw(&avatar.id, &format!("mem_{}", i), 5, "general", None, false)
                .unwrap();
        }
        // System memory should NOT be counted
        db.insert_ai_memory_raw(&avatar.id, "sys", 10, "system", None, true)
            .unwrap();

        assert_eq!(db.count_active_vault_memories(&avatar.id).unwrap(), 5);
    }

    #[test]
    fn test_cross_avatar_memories() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let a1 = db
            .create_ai_avatar("Avatar1", &personalities[0].id, None, None, None)
            .unwrap();
        let a2 = db
            .create_ai_avatar("Avatar2", &personalities[0].id, None, None, None)
            .unwrap();

        // High importance memory on avatar2 — should be visible to avatar1
        db.insert_ai_memory_raw(&a2.id, "shared_high", 8, "general", None, false)
            .unwrap();
        // Low importance — should NOT be visible
        db.insert_ai_memory_raw(&a2.id, "shared_low", 3, "general", None, false)
            .unwrap();

        let cross = db.get_cross_avatar_memories_raw(&a1.id, 20).unwrap();
        assert_eq!(cross.len(), 1);
        assert_eq!(cross[0].1, "Avatar2");
    }

    // ── AI Journal Tests ────────────────────────────────────────────

    #[test]
    fn test_insert_and_get_journal() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("JournalBot", &personalities[0].id, None, None, None)
            .unwrap();
        // Need a conversation for FK
        db.create_ai_conversation_stub("conv-1", &avatar.id)
            .unwrap();

        let id = db
            .insert_ai_journal_raw(&avatar.id, "conv-1", "2026-02-27", "encrypted_summary")
            .unwrap();
        assert!(!id.is_empty());

        let entries = db.get_ai_journal_raw(&avatar.id).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].summary, "encrypted_summary");
    }

    #[test]
    fn test_delete_journal_entry() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("DelJBot", &personalities[0].id, None, None, None)
            .unwrap();
        db.create_ai_conversation_stub("conv-2", &avatar.id)
            .unwrap();

        let id = db
            .insert_ai_journal_raw(&avatar.id, "conv-2", "2026-02-27", "summary")
            .unwrap();
        db.delete_ai_journal_entry(&id).unwrap();
        let entries = db.get_ai_journal_raw(&avatar.id).unwrap();
        assert!(entries.is_empty());
    }

    // ── Wipe Test ───────────────────────────────────────────────────

    #[test]
    fn test_wipe_ai_data() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("WipeBot", &personalities[0].id, None, None, None)
            .unwrap();
        db.insert_ai_memory_raw(&avatar.id, "mem", 5, "general", None, false)
            .unwrap();

        db.wipe_ai_data().unwrap();

        // Memories gone
        let memories = db.get_all_active_memories_raw(&avatar.id).unwrap();
        assert!(memories.is_empty());
        // But avatars and personalities remain
        assert!(!db.list_ai_avatars().unwrap().is_empty());
        assert!(!db.list_ai_personalities().unwrap().is_empty());
    }

    #[test]
    fn test_delete_ai_avatar_cascades() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let pid = &personalities[0].id;
        let a1 = db
            .create_ai_avatar("Avatar1", pid, None, None, None)
            .unwrap();
        let a2 = db
            .create_ai_avatar("Avatar2", pid, None, None, None)
            .unwrap();

        // Add data to both avatars
        db.insert_ai_memory_raw(&a1.id, "mem1", 5, "general", None, false)
            .unwrap();
        db.insert_ai_memory_raw(&a2.id, "mem2", 5, "general", None, false)
            .unwrap();
        db.create_ai_conversation_stub("conv-a1", &a1.id).unwrap();
        db.create_ai_conversation_stub("conv-a2", &a2.id).unwrap();
        db.insert_ai_journal_raw(&a1.id, "conv-a1", "2026-01-01", "journal1")
            .unwrap();
        db.insert_ai_journal_raw(&a2.id, "conv-a2", "2026-01-02", "journal2")
            .unwrap();

        // Delete a1
        db.delete_ai_avatar(&a1.id).unwrap();

        // a1 gone, a2 still present
        let avatars = db.list_ai_avatars().unwrap();
        assert_eq!(avatars.len(), 1);
        assert_eq!(avatars[0].id, a2.id);

        // a1 memories gone
        let mems1 = db.get_all_active_memories_raw(&a1.id).unwrap();
        assert!(mems1.is_empty());
        // a2 memories intact
        let mems2 = db.get_all_active_memories_raw(&a2.id).unwrap();
        assert_eq!(mems2.len(), 1);

        // a2 journal intact
        let journal2 = db.get_ai_journal_raw(&a2.id).unwrap();
        assert_eq!(journal2.len(), 1);
    }

    #[test]
    fn test_wipe_avatar_data_keeps_avatar() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let pid = &personalities[0].id;
        let a1 = db
            .create_ai_avatar("WipeMe", pid, None, None, None)
            .unwrap();
        let a2 = db
            .create_ai_avatar("KeepMe", pid, None, None, None)
            .unwrap();

        // Add data to both
        db.insert_ai_memory_raw(&a1.id, "mem1", 5, "general", None, false)
            .unwrap();
        db.insert_ai_memory_raw(&a2.id, "mem2", 5, "general", None, false)
            .unwrap();
        db.create_ai_conversation_stub("conv-w1", &a1.id).unwrap();
        db.insert_ai_journal_raw(&a1.id, "conv-w1", "2026-01-01", "journal1")
            .unwrap();

        // Wipe a1's data
        db.wipe_avatar_data(&a1.id).unwrap();

        // Avatar still exists
        let avatars = db.list_ai_avatars().unwrap();
        assert_eq!(avatars.len(), 2);

        // a1 data gone
        let mems1 = db.get_all_active_memories_raw(&a1.id).unwrap();
        assert!(mems1.is_empty());
        let journal1 = db.get_ai_journal_raw(&a1.id).unwrap();
        assert!(journal1.is_empty());

        // a2 data intact
        let mems2 = db.get_all_active_memories_raw(&a2.id).unwrap();
        assert_eq!(mems2.len(), 1);
    }

    #[test]
    fn test_count_ai_avatars() {
        let db = test_db();
        assert_eq!(db.count_ai_avatars().unwrap(), 0);

        let personalities = db.list_ai_personalities().unwrap();
        let pid = &personalities[0].id;
        db.create_ai_avatar("One", pid, None, None, None).unwrap();
        assert_eq!(db.count_ai_avatars().unwrap(), 1);

        let a2 = db.create_ai_avatar("Two", pid, None, None, None).unwrap();
        assert_eq!(db.count_ai_avatars().unwrap(), 2);

        db.delete_ai_avatar(&a2.id).unwrap();
        assert_eq!(db.count_ai_avatars().unwrap(), 1);
    }

    // ── AI Conversation Tests ──────────────────────────────────────────

    #[test]
    fn test_get_active_conversation_returns_none_when_empty() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let result = db.get_active_conversation(&avatar.id).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_get_active_conversation_returns_none_after_ended() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();
        db.end_ai_conversation(&conv.id).unwrap();
        let result = db.get_active_conversation(&avatar.id).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_create_ai_conversation_fields() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();
        assert!(!conv.id.is_empty());
        assert_eq!(conv.avatar_id, avatar.id);
        assert_eq!(conv.message_count, 0);
        assert_eq!(conv.compacted, 0);
        assert!(conv.ended_at.is_none());
        assert!(conv.summary.is_none());
        assert!(!conv.started_at.is_empty());
    }

    #[test]
    fn test_complete_ai_conversation_sets_fields() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();
        db.complete_ai_conversation(&conv.id, "encrypted_summary")
            .unwrap();
        // Verify via get_active_conversation (should return None since it's now ended)
        assert!(db.get_active_conversation(&avatar.id).unwrap().is_none());
        // Verify the conversation was properly completed by checking orphaned
        let orphans = db.get_orphaned_conversations(&avatar.id).unwrap();
        assert!(orphans.is_empty()); // Should not be orphaned since compacted=1
    }

    #[test]
    fn test_complete_ai_conversation_preserves_ended_at() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();
        // First end it
        db.end_ai_conversation(&conv.id).unwrap();
        // Then complete it (simulating retry_compaction)
        db.complete_ai_conversation(&conv.id, "encrypted_summary")
            .unwrap();
        // Verify it's fully completed (not orphaned, not active)
        assert!(db.get_active_conversation(&avatar.id).unwrap().is_none());
        assert!(db
            .get_orphaned_conversations(&avatar.id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn test_delete_ai_messages_by_ids_selective() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();
        let id1 = db
            .insert_ai_message(&conv.id, "user", "msg1", 10, None)
            .unwrap();
        let id2 = db
            .insert_ai_message(&conv.id, "assistant", "msg2", 20, None)
            .unwrap();
        let id3 = db
            .insert_ai_message(&conv.id, "user", "msg3", 10, None)
            .unwrap();
        // Delete only first two
        db.delete_ai_messages_by_ids(&[id1, id2]).unwrap();
        let remaining = db.get_ai_messages_raw(&conv.id).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, id3);
    }

    #[test]
    fn test_get_personality_prompt_found() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        assert!(!personalities.is_empty());
        let prompt = db.get_personality_prompt(&personalities[0].id).unwrap();
        assert!(!prompt.is_empty());
    }

    #[test]
    fn test_get_personality_prompt_not_found() {
        let db = test_db();
        let result = db.get_personality_prompt("nonexistent-id");
        assert!(result.is_err());
    }

    // ── Transaction Method Tests ────────────────────────────────────────

    #[test]
    fn test_store_message_pair_atomic() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();

        db.store_message_pair(&conv.id, "user_enc", 10, "asst_enc", 20, false, None)
            .unwrap();

        let msgs = db.get_ai_messages_raw(&conv.id).unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].role, "user");
        assert_eq!(msgs[0].content, "user_enc");
        assert_eq!(msgs[1].role, "assistant");
        assert_eq!(msgs[1].content, "asst_enc");
    }

    #[test]
    fn test_complete_compaction_atomic() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();

        // Insert some messages first
        db.insert_ai_message(&conv.id, "user", "msg1", 10, None)
            .unwrap();
        db.insert_ai_message(&conv.id, "assistant", "msg2", 20, None)
            .unwrap();

        // Insert a memory to supersede
        let old_mem_id = db
            .insert_ai_memory_raw(&avatar.id, "old_mem", 3, "general", None, false)
            .unwrap();

        let memories = vec![("new_mem_enc".to_string(), 7u32, "preference".to_string())];

        db.complete_compaction(
            &conv.id,
            &avatar.id,
            "summary_enc",
            "journal_enc",
            &memories,
            std::slice::from_ref(&old_mem_id),
        )
        .unwrap();

        // Messages should be deleted
        let msgs = db.get_ai_messages_raw(&conv.id).unwrap();
        assert!(msgs.is_empty());

        // Journal should exist
        let journal = db.get_ai_journal_raw(&avatar.id).unwrap();
        assert_eq!(journal.len(), 1);
        assert_eq!(journal[0].summary, "journal_enc");

        // New memory should exist
        let active_mems = db.get_active_vault_memories_raw(&avatar.id, 50).unwrap();
        assert_eq!(active_mems.len(), 1);
        assert_eq!(active_mems[0].content, "new_mem_enc");

        // Conversation should be completed (not active, not orphaned)
        assert!(db.get_active_conversation(&avatar.id).unwrap().is_none());
        assert!(db
            .get_orphaned_conversations(&avatar.id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn test_store_message_pair_skip_user() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();

        db.store_message_pair(&conv.id, "user_enc", 10, "asst_enc", 20, true, None)
            .unwrap();

        let msgs = db.get_ai_messages_raw(&conv.id).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "assistant");
        assert_eq!(msgs[0].content, "asst_enc");

        // message_count should be 1
        let active = db.get_active_conversation(&avatar.id).unwrap().unwrap();
        assert_eq!(active.message_count, 1);
    }

    #[test]
    fn test_abandon_conversation() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv1 = db.create_ai_conversation(&avatar.id).unwrap();
        let conv2 = db.create_ai_conversation(&avatar.id).unwrap();

        // Insert messages in both conversations
        db.insert_ai_message(&conv1.id, "user", "msg1", 5, None)
            .unwrap();
        db.insert_ai_message(&conv1.id, "assistant", "msg2", 5, None)
            .unwrap();
        db.insert_ai_message(&conv2.id, "user", "msg3", 5, None)
            .unwrap();

        // Set message_count on conv1 so we can verify it gets reset
        db.update_ai_conversation_message_count(&conv1.id, 2)
            .unwrap();

        db.abandon_conversation(&conv1.id).unwrap();

        // conv1 messages should be deleted
        let msgs1 = db.get_ai_messages_raw(&conv1.id).unwrap();
        assert!(msgs1.is_empty());

        // conv1 message_count should be reset to 0
        let conv1_count: u32 = db
            .conn
            .query_row(
                "SELECT message_count FROM ai_conversations WHERE id = ?1",
                params![conv1.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(conv1_count, 0);

        // conv2 messages should be unaffected
        let msgs2 = db.get_ai_messages_raw(&conv2.id).unwrap();
        assert_eq!(msgs2.len(), 1);
        assert_eq!(msgs2[0].content, "msg3");

        // conv1 should no longer be active (ended_at is set)
        // It was already not the "active" one since conv2 was created after, but verify ended_at
        let active = db.get_active_conversation(&avatar.id).unwrap();
        // conv2 should still be active
        assert!(active.is_some());
        assert_eq!(active.unwrap().id, conv2.id);
    }

    #[test]
    fn test_abandon_conversation_already_ended() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();

        // End it first
        db.end_ai_conversation(&conv.id).unwrap();

        // Abandon should be a no-op (no error)
        db.abandon_conversation(&conv.id).unwrap();
    }

    #[test]
    fn test_has_user_messages_empty() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();

        assert!(!db.has_user_messages(&conv.id).unwrap());
    }

    #[test]
    fn test_has_user_messages_assistant_only() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();

        db.insert_ai_message(&conv.id, "assistant", "hello", 5, None)
            .unwrap();

        assert!(!db.has_user_messages(&conv.id).unwrap());
    }

    #[test]
    fn test_has_user_messages_with_user() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();

        db.insert_ai_message(&conv.id, "user", "hi", 2, None)
            .unwrap();

        assert!(db.has_user_messages(&conv.id).unwrap());
    }

    #[test]
    fn test_get_conversation_started_at() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();

        let started_at = db.get_conversation_started_at(&conv.id).unwrap();
        assert!(!started_at.is_empty());
        // Should be a valid datetime string
        chrono::NaiveDateTime::parse_from_str(&started_at, "%Y-%m-%d %H:%M:%S").unwrap();
    }

    #[test]
    fn test_get_conversation_started_at_not_found() {
        let db = test_db();
        let result = db.get_conversation_started_at("nonexistent-id");
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::NotFound(msg) => assert!(msg.contains("Conversation not found")),
            other => panic!("Expected NotFound, got: {:?}", other),
        }
    }

    // ── Phase 10: Pending Compaction Tests ──────────────────────────

    #[test]
    fn test_pending_compaction_empty_when_no_conversations() {
        let db = test_db();
        let result = db.get_pending_compaction_conversations().unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_pending_compaction_empty_when_all_compacted() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();
        // End and mark as compacted via complete_compaction
        db.end_ai_conversation(&conv.id).unwrap();
        let key = [0u8; 32];
        let summary_enc = crate::services::ai::encryption::encrypt_field("summary", &key).unwrap();
        let journal_enc = crate::services::ai::encryption::encrypt_field("journal", &key).unwrap();
        // Insert a message so compaction has something to process
        let msg_enc = crate::services::ai::encryption::encrypt_field("hello", &key).unwrap();
        db.insert_ai_message(&conv.id, "user", &msg_enc, 2, None)
            .unwrap();
        db.complete_compaction(&conv.id, &avatar.id, &summary_enc, &journal_enc, &[], &[])
            .unwrap();

        let result = db.get_pending_compaction_conversations().unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_pending_compaction_returns_ended_uncompacted_with_messages() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();

        // Insert a message
        let key = [0u8; 32];
        let msg_enc = crate::services::ai::encryption::encrypt_field("hello", &key).unwrap();
        db.insert_ai_message(&conv.id, "user", &msg_enc, 2, None)
            .unwrap();

        // End the conversation (but don't compact — simulates compaction failure)
        db.end_ai_conversation(&conv.id).unwrap();

        let result = db.get_pending_compaction_conversations().unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].0, conv.id);
        assert_eq!(result[0].1, avatar.id);
    }

    #[test]
    fn test_pending_compaction_skips_ended_uncompacted_without_messages() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();

        // End the conversation with no messages (short conversation, no compaction needed)
        db.end_ai_conversation(&conv.id).unwrap();

        let result = db.get_pending_compaction_conversations().unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_pending_compaction_returns_multiple() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let key = [0u8; 32];

        let conv1 = db.create_ai_conversation(&avatar.id).unwrap();
        let msg_enc = crate::services::ai::encryption::encrypt_field("msg1", &key).unwrap();
        db.insert_ai_message(&conv1.id, "user", &msg_enc, 2, None)
            .unwrap();
        db.end_ai_conversation(&conv1.id).unwrap();

        let conv2 = db.create_ai_conversation(&avatar.id).unwrap();
        let msg_enc2 = crate::services::ai::encryption::encrypt_field("msg2", &key).unwrap();
        db.insert_ai_message(&conv2.id, "user", &msg_enc2, 2, None)
            .unwrap();
        db.end_ai_conversation(&conv2.id).unwrap();

        let result = db.get_pending_compaction_conversations().unwrap();
        assert_eq!(result.len(), 2);
    }

    // ── Phase 10: Compaction Conversation Data Tests ────────────────

    #[test]
    fn test_compaction_data_returns_avatar_and_messages() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("Bot", &personalities[0].id, None, None, None)
            .unwrap();
        let conv = db.create_ai_conversation(&avatar.id).unwrap();

        let key = [0u8; 32];
        let msg1 = crate::services::ai::encryption::encrypt_field("hello", &key).unwrap();
        let msg2 = crate::services::ai::encryption::encrypt_field("world", &key).unwrap();
        db.insert_ai_message(&conv.id, "user", &msg1, 2, None)
            .unwrap();
        db.insert_ai_message(&conv.id, "assistant", &msg2, 2, None)
            .unwrap();

        let (returned_avatar_id, messages) = db.get_compaction_conversation_data(&conv.id).unwrap();
        assert_eq!(returned_avatar_id, avatar.id);
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[1].role, "assistant");
    }

    #[test]
    fn test_compaction_data_not_found() {
        let db = test_db();
        let result = db.get_compaction_conversation_data("nonexistent-id");
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::NotFound(msg) => assert!(msg.contains("Conversation not found")),
            other => panic!("Expected NotFound, got: {:?}", other),
        }
    }

    // ── v25 FK constraint tests ─────────────────────────────────────

    #[test]
    fn test_v25_fk_cascade_delete() {
        let db = test_db();
        let game_id = db.register_game("Steam", "12345", "Test Game").unwrap();

        // Insert child rows in multiple FK-constrained tables
        db.add_game_executable(&game_id, "/path/to/game.exe", "game.exe")
            .unwrap();
        db.set_favorite(&game_id, true).unwrap();
        db.conn
            .execute(
                "INSERT INTO hidden_games (game_id) VALUES (?1)",
                params![game_id],
            )
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO playtime_snapshots (game_id, playtime_minutes, snapshot_at) VALUES (?1, 60, 1000)",
                params![game_id],
            )
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO game_sessions (game_id, start_time) VALUES (?1, 1000)",
                params![game_id],
            )
            .unwrap();
        db.save_game_note(&game_id, "Test note").unwrap();

        // Verify data exists
        let exes = db.get_all_game_executables().unwrap();
        assert!(exes.iter().any(|(gid, _, _)| gid == &game_id));

        // Delete the game — CASCADE should clean up all FK-constrained tables
        db.delete_game(&game_id).unwrap();

        // Verify all child rows are gone
        let count: u32 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM game_executables WHERE game_id = ?1",
                params![game_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0, "game_executables should be cascaded");

        let count: u32 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM favorites WHERE game_id = ?1",
                params![game_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0, "favorites should be cascaded");

        let count: u32 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM hidden_games WHERE game_id = ?1",
                params![game_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0, "hidden_games should be cascaded");

        let count: u32 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM playtime_snapshots WHERE game_id = ?1",
                params![game_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0, "playtime_snapshots should be cascaded");

        let count: u32 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM game_sessions WHERE game_id = ?1",
                params![game_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0, "game_sessions should be cascaded");

        // game_notes should also be deleted (manual delete in delete_game)
        let note = db.get_game_note(&game_id).unwrap();
        assert!(note.is_none(), "game_notes should be manually deleted");
    }

    #[test]
    fn test_v25_fk_rejects_orphan_insert() {
        let db = test_db();
        let fake_id = "nonexistent-game-id";

        // Inserting into an FK-constrained table with a nonexistent game_id should fail
        let result = db.conn.execute(
            "INSERT INTO favorites (game_id) VALUES (?1)",
            params![fake_id],
        );
        assert!(
            result.is_err(),
            "FK should reject orphan insert into favorites"
        );

        let result = db.conn.execute(
            "INSERT INTO game_executables (game_id, exe_path, exe_name, discovered_at) VALUES (?1, '/x', 'x', 0)",
            params![fake_id],
        );
        assert!(
            result.is_err(),
            "FK should reject orphan insert into game_executables"
        );

        let result = db.conn.execute(
            "INSERT INTO store_metadata (game_id, name, cached_at) VALUES (?1, 'X', 0)",
            params![fake_id],
        );
        assert!(
            result.is_err(),
            "FK should reject orphan insert into store_metadata"
        );
    }

    #[test]
    fn test_v25_general_note_survives() {
        let db = test_db();

        // The __general__ sentinel has no entry in games — it should still work
        // because game_notes has no FK constraint
        db.save_game_note("__general__", "My general note").unwrap();
        let note = db.get_game_note("__general__").unwrap();
        assert!(note.is_some());
        assert_eq!(note.unwrap().content, "My general note");
    }

    #[test]
    fn test_v25_game_executables_game_id_index() {
        let db = test_db();
        let indexes: Vec<String> = db
            .conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'game_executables'")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<String>, _>>()
            .unwrap();

        assert!(
            indexes.contains(&"idx_game_executables_game_id".to_string()),
            "game_executables should have game_id index, found: {:?}",
            indexes
        );
        assert!(
            indexes.contains(&"idx_game_exe_name".to_string()),
            "game_executables should still have exe_name index, found: {:?}",
            indexes
        );
    }

    #[test]
    fn test_v25_fk_constraints_exist() {
        let db = test_db();

        // Verify FK constraints are present on all 13 rebuilt tables
        let tables_with_fk = [
            "store_metadata",
            "favorites",
            "hidden_games",
            "game_ratings",
            "game_achievement_freshness",
            "playtime_snapshots",
            "game_sessions",
            "game_executables",
            "game_images",
            "game_achievements",
            "game_news",
            "game_tags",
            "news_read",
        ];

        for table in tables_with_fk {
            let fk_count: u32 = db
                .conn
                .query_row(
                    &format!("SELECT COUNT(*) FROM pragma_foreign_key_list('{}')", table),
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(
                fk_count > 0,
                "Table '{}' should have at least one FK constraint",
                table
            );
        }

        // game_notes should NOT have an FK constraint
        let notes_fk: u32 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_foreign_key_list('game_notes')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            notes_fk, 0,
            "game_notes should NOT have FK (due to __general__ sentinel)"
        );
    }
}
