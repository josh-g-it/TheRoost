use crate::models::assistant::{AiDailyLog, AiMemory};
use crate::services::ai::encryption::{decrypt_field, encrypt_field};
use crate::services::cache_db::{AiMemoryRow, CacheDb};
use crate::utils::error::AppError;

/// Load active system memories (decrypted) for an avatar.
pub fn load_system_memories(
    db: &CacheDb,
    avatar_id: &str,
    key: &[u8; 32],
) -> Result<Vec<AiMemory>, AppError> {
    let rows = db.get_active_system_memories_raw(avatar_id)?;
    rows_to_memories(rows, key)
}

/// Load top vault memories (decrypted) by importance.
pub fn load_vault_memories(
    db: &CacheDb,
    avatar_id: &str,
    key: &[u8; 32],
    limit: u32,
) -> Result<Vec<AiMemory>, AppError> {
    let rows = db.get_active_vault_memories_raw(avatar_id, limit)?;
    rows_to_memories(rows, key)
}

/// Load vault memories ranked by combined importance and keyword relevance.
/// Fetches more than needed, scores by keyword overlap, and returns top `limit`.
/// Keywords are matched case-insensitively against decrypted memory content.
pub fn load_vault_memories_ranked(
    db: &CacheDb,
    avatar_id: &str,
    key: &[u8; 32],
    limit: u32,
    keywords: &[String],
) -> Result<Vec<AiMemory>, AppError> {
    if keywords.is_empty() {
        return load_vault_memories(db, avatar_id, key, limit);
    }

    // Fetch 2x the limit to have candidates for re-ranking
    let fetch_count = limit.saturating_mul(2).max(50);
    let rows = db.get_active_vault_memories_raw(avatar_id, fetch_count)?;
    let mut memories = rows_to_memories(rows, key)?;

    // Score each memory: importance (0-10) + keyword bonus (0-5)
    let lower_keywords: Vec<String> = keywords.iter().map(|k| k.to_lowercase()).collect();
    memories.sort_by(|a, b| {
        let score_a = rank_memory(a, &lower_keywords);
        let score_b = rank_memory(b, &lower_keywords);
        score_b
            .partial_cmp(&score_a)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    memories.truncate(limit as usize);
    Ok(memories)
}

/// Compute a combined score for a memory based on importance and keyword relevance.
fn rank_memory(mem: &AiMemory, keywords: &[String]) -> f64 {
    let importance_score = f64::from(mem.importance);
    let content_lower = mem.content.to_lowercase();
    let keyword_hits = keywords
        .iter()
        .filter(|kw| kw.len() >= 3 && content_lower.contains(kw.as_str()))
        .count();
    // Keyword bonus: up to 5 points (each hit adds 2.5, capped at 2 hits)
    let keyword_bonus = (keyword_hits as f64 * 2.5).min(5.0);
    importance_score + keyword_bonus
}

/// Load cross-avatar memories (decrypted) — returns (memory, avatar_name) pairs.
///
/// # Cross-avatar sharing semantics
/// Memories are avatar-scoped by default. Cross-avatar sharing surfaces high-importance
/// memories (importance >= 6) from OTHER avatars into the current avatar's context.
/// This lets a new avatar benefit from preferences learned by a previous avatar
/// (e.g., "user loves RPGs") without inheriting low-value or avatar-specific context.
/// System memories are excluded — they are avatar-specific by design.
/// Shared memories are read-only: the receiving avatar cannot modify or supersede them.
pub fn load_cross_avatar_memories(
    db: &CacheDb,
    avatar_id: &str,
    key: &[u8; 32],
    limit: u32,
) -> Result<Vec<(AiMemory, String)>, AppError> {
    let rows = db.get_cross_avatar_memories_raw(avatar_id, limit)?;
    let mut result = Vec::with_capacity(rows.len());
    for (row, avatar_name) in rows {
        let content = decrypt_field(&row.content, key)?;
        result.push((row_to_memory(row, content), avatar_name));
    }
    Ok(result)
}

/// Load recent journal entries (decrypted).
pub fn load_recent_journal(
    db: &CacheDb,
    avatar_id: &str,
    key: &[u8; 32],
    limit: u32,
) -> Result<Vec<AiDailyLog>, AppError> {
    let rows = db.get_recent_journal_raw(avatar_id, limit)?;
    let mut entries = Vec::with_capacity(rows.len());
    for row in rows {
        let summary = decrypt_field(&row.summary, key)?;
        entries.push(AiDailyLog {
            id: row.id,
            avatar_id: row.avatar_id,
            conversation_id: row.conversation_id,
            log_date: row.log_date,
            summary,
            created_at: row.created_at,
        });
    }
    Ok(entries)
}

/// Format all memory data into the Layer 3 context string for the AI prompt.
pub fn format_memory_context(
    system: &[AiMemory],
    vault: &[AiMemory],
    cross: &[(AiMemory, String)],
    journal: &[AiDailyLog],
) -> String {
    let mut out = String::from("## What You Remember About This User\n");

    if !system.is_empty() {
        out.push_str("\n### Core Instructions\n");
        for mem in system {
            out.push_str(&format!("- {}\n", mem.content));
        }
    }

    if !vault.is_empty() {
        out.push_str("\n### Key Memories (from most to least important)\n");
        for mem in vault {
            out.push_str(&format!("- [{}] {}\n", mem.importance, mem.content));
        }
    }

    if !cross.is_empty() {
        out.push_str("\n### From Other Avatars (shared memories)\n");
        for (mem, avatar_name) in cross {
            out.push_str(&format!(
                "- [From \"{}\"] [{}]: {}\n",
                avatar_name, mem.importance, mem.content
            ));
        }
    }

    if !journal.is_empty() {
        out.push_str("\n### Recent Conversations\n");
        for entry in journal {
            out.push_str(&format!("- **{}**: {}\n", entry.log_date, entry.summary));
        }
    }

    out
}

/// Insert a new memory (encrypts content before storage).
#[allow(clippy::too_many_arguments)]
pub fn insert_memory(
    db: &CacheDb,
    avatar_id: &str,
    content: &str,
    importance: u32,
    category: &str,
    conversation_id: Option<&str>,
    is_system: bool,
    key: &[u8; 32],
) -> Result<String, AppError> {
    let encrypted = encrypt_field(content, key)?;
    db.insert_ai_memory_raw(
        avatar_id,
        &encrypted,
        importance,
        category,
        conversation_id,
        is_system,
    )
}

/// Prune vault if active non-system memories exceed 100.
/// Also hard-deletes inactive memories and journal entries older than 90 days
/// to prevent unbounded table growth.
/// Returns the number of active memories soft-deleted.
///
/// # Future improvements
/// - **Smarter pruning**: Factor in recency (`last_referenced`), frequency of
///   reference, and semantic clustering to avoid losing memories that are low-
///   importance but recently relevant.
/// - **Compaction meta-learning**: Track which memories get superseded most often
///   and auto-adjust importance, reducing churn and the need for pruning.
pub fn prune_vault_if_needed(db: &CacheDb, avatar_id: &str) -> Result<u32, AppError> {
    // 1. Soft-delete lowest-importance active memories if vault exceeds cap
    let count = db.count_active_vault_memories(avatar_id)?;
    let pruned = if count > 100 {
        let to_prune = db.get_lowest_importance_memories(avatar_id, 20)?;
        let n = to_prune.len() as u32;
        db.soft_delete_memories_batch(&to_prune)?;
        n
    } else {
        0
    };

    // 2. Hard-delete old inactive (superseded) memories and journal entries
    //    to prevent unbounded table growth. 90-day retention is generous for
    //    data that has already been compacted into newer memories.
    let cutoff = (chrono::Utc::now() - chrono::Duration::days(90))
        .format("%Y-%m-%dT%H:%M:%S")
        .to_string();

    let old_mems = db.hard_delete_old_inactive_memories(avatar_id, &cutoff)?;
    let old_journal = db.prune_old_journal_entries(avatar_id, &cutoff)?;

    if old_mems > 0 || old_journal > 0 {
        tracing::info!(
            avatar_id,
            inactive_deleted = old_mems,
            journal_deleted = old_journal,
            "Cleaned up old AI data"
        );
    }

    Ok(pruned)
}

/// Seed the static system memories for a new avatar.
pub fn seed_system_memories(
    db: &CacheDb,
    avatar_id: &str,
    avatar_name: &str,
    companion_role_id: Option<&str>,
    companion_role_custom: Option<&str>,
    key: &[u8; 32],
) -> Result<(), AppError> {
    let role_text = db.resolve_companion_role_prompt(companion_role_id, companion_role_custom);

    let system_memories = [
        format!(
            "Your name is {}. You are {} in The Roost.",
            avatar_name, role_text
        ),
        "You have access to the user's game library, playtime data, and gaming preferences through context provided with each message.".to_string(),
        "When the user asks you to perform actions (like filtering games, adding favorites, etc.), respond with the appropriate action format so the system can execute it. Always clear existing filters first (action:reset-filters) before applying new filter or sort actions.".to_string(),
        "Keep your responses conversational and gaming-focused. You're a companion, not a generic assistant.".to_string(),
    ];

    for content in &system_memories {
        insert_memory(db, avatar_id, content, 10, "system", None, true, key)?;
    }

    Ok(())
}

/// Insert a journal entry (encrypts summary before storage).
#[allow(dead_code)]
pub fn insert_journal_entry(
    db: &CacheDb,
    avatar_id: &str,
    conversation_id: &str,
    summary: &str,
    key: &[u8; 32],
) -> Result<String, AppError> {
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let encrypted = encrypt_field(summary, key)?;
    db.insert_ai_journal_raw(avatar_id, conversation_id, &today, &encrypted)
}

// ── Internal helpers ────────────────────────────────────────────────

fn rows_to_memories(rows: Vec<AiMemoryRow>, key: &[u8; 32]) -> Result<Vec<AiMemory>, AppError> {
    let mut memories = Vec::with_capacity(rows.len());
    for row in rows {
        let content = decrypt_field(&row.content, key)?;
        memories.push(row_to_memory(row, content));
    }
    Ok(memories)
}

fn row_to_memory(row: AiMemoryRow, decrypted_content: String) -> AiMemory {
    AiMemory {
        id: row.id,
        avatar_id: row.avatar_id,
        conversation_id: row.conversation_id,
        content: decrypted_content,
        importance: row.importance,
        category: row.category,
        is_system: row.is_system,
        created_at: row.created_at,
        last_referenced: row.last_referenced,
        superseded_by: row.superseded_by,
        active: row.active,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::cache_db::CacheDb;

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

    const TEST_KEY: [u8; 32] = [0u8; 32];

    fn setup_avatar(db: &CacheDb) -> String {
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("TestBot", &personalities[0].id, None, None, None)
            .unwrap();
        avatar.id
    }

    #[test]
    fn test_seed_system_memories() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        seed_system_memories(&db, &avatar_id, "TestBot", None, None, &TEST_KEY).unwrap();
        let mems = load_system_memories(&db, &avatar_id, &TEST_KEY).unwrap();
        assert_eq!(mems.len(), 4);
        assert!(mems.iter().all(|m| m.is_system));
        assert!(mems.iter().all(|m| m.importance == 10));
        // Check personalization
        assert!(mems.iter().any(|m| m.content.contains("TestBot")));
    }

    #[test]
    fn test_insert_and_load_vault_memories() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);

        insert_memory(
            &db,
            &avatar_id,
            "I love RPGs",
            7,
            "preference",
            None,
            false,
            &TEST_KEY,
        )
        .unwrap();
        insert_memory(
            &db,
            &avatar_id,
            "Favorite game is Elden Ring",
            9,
            "fact",
            None,
            false,
            &TEST_KEY,
        )
        .unwrap();

        let vault = load_vault_memories(&db, &avatar_id, &TEST_KEY, 50).unwrap();
        assert_eq!(vault.len(), 2);
        // Should be ordered by importance DESC
        assert_eq!(vault[0].importance, 9);
        assert_eq!(vault[0].content, "Favorite game is Elden Ring");
    }

    #[test]
    fn test_prune_vault_if_needed_no_op_when_under_limit() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        for i in 0..50 {
            insert_memory(
                &db,
                &avatar_id,
                &format!("mem {}", i),
                5,
                "general",
                None,
                false,
                &TEST_KEY,
            )
            .unwrap();
        }
        let pruned = prune_vault_if_needed(&db, &avatar_id).unwrap();
        assert_eq!(pruned, 0);
    }

    #[test]
    fn test_prune_vault_if_needed_prunes_when_over_limit() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        for i in 0..105 {
            insert_memory(
                &db,
                &avatar_id,
                &format!("mem {}", i),
                (i % 10) as u32,
                "general",
                None,
                false,
                &TEST_KEY,
            )
            .unwrap();
        }
        let pruned = prune_vault_if_needed(&db, &avatar_id).unwrap();
        assert_eq!(pruned, 20);
        // Should now have 85 active vault memories
        let count = db.count_active_vault_memories(&avatar_id).unwrap();
        assert_eq!(count, 85);
    }

    #[test]
    fn test_prune_never_touches_system_memories() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        seed_system_memories(&db, &avatar_id, "Bot", None, None, &TEST_KEY).unwrap();
        for i in 0..105 {
            insert_memory(
                &db,
                &avatar_id,
                &format!("mem {}", i),
                1,
                "general",
                None,
                false,
                &TEST_KEY,
            )
            .unwrap();
        }
        prune_vault_if_needed(&db, &avatar_id).unwrap();
        let system = load_system_memories(&db, &avatar_id, &TEST_KEY).unwrap();
        assert_eq!(system.len(), 4); // All 4 system memories intact
    }

    #[test]
    fn test_format_memory_context_all_sections() {
        let system = vec![AiMemory {
            id: "s1".into(),
            avatar_id: "a".into(),
            conversation_id: None,
            content: "System instruction".into(),
            importance: 10,
            category: "system".into(),
            is_system: true,
            created_at: "2026-02-27".into(),
            last_referenced: None,
            superseded_by: None,
            active: true,
        }];
        let vault = vec![AiMemory {
            id: "v1".into(),
            avatar_id: "a".into(),
            conversation_id: None,
            content: "Loves RPGs".into(),
            importance: 8,
            category: "preference".into(),
            is_system: false,
            created_at: "2026-02-27".into(),
            last_referenced: None,
            superseded_by: None,
            active: true,
        }];
        let cross = vec![(
            AiMemory {
                id: "c1".into(),
                avatar_id: "b".into(),
                conversation_id: None,
                content: "Prefers dark themes".into(),
                importance: 7,
                category: "preference".into(),
                is_system: false,
                created_at: "2026-02-27".into(),
                last_referenced: None,
                superseded_by: None,
                active: true,
            },
            "Luna".to_string(),
        )];
        let journal = vec![AiDailyLog {
            id: "j1".into(),
            avatar_id: "a".into(),
            conversation_id: "c".into(),
            log_date: "2026-02-27".into(),
            summary: "Played Elden Ring for 2 hours".into(),
            created_at: "2026-02-27".into(),
        }];

        let ctx = format_memory_context(&system, &vault, &cross, &journal);
        assert!(ctx.contains("## What You Remember About This User"));
        assert!(ctx.contains("System instruction"));
        assert!(ctx.contains("[8] Loves RPGs"));
        assert!(ctx.contains("Luna"));
        assert!(ctx.contains("Played Elden Ring"));
    }

    #[test]
    fn test_format_memory_context_empty_sections_omitted() {
        let ctx = format_memory_context(&[], &[], &[], &[]);
        assert!(ctx.contains("## What You Remember About This User"));
        // Should not contain section headers for empty sections
        assert!(!ctx.contains("### Core Instructions"));
        assert!(!ctx.contains("### Key Memories"));
    }

    #[test]
    fn test_insert_journal_entry() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        // Create a conversation for FK
        db.create_ai_conversation_stub("conv-test", &avatar_id)
            .unwrap();

        let id = insert_journal_entry(
            &db,
            &avatar_id,
            "conv-test",
            "Had a great chat about RPGs",
            &TEST_KEY,
        )
        .unwrap();
        assert!(!id.is_empty());

        let entries = load_recent_journal(&db, &avatar_id, &TEST_KEY, 7).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].summary, "Had a great chat about RPGs");
    }

    #[test]
    fn test_load_cross_avatar_memories() {
        let db = test_db();
        let personalities = db.list_ai_personalities().unwrap();
        let a1 = db
            .create_ai_avatar("Bot1", &personalities[0].id, None, None, None)
            .unwrap();
        let a2 = db
            .create_ai_avatar("Bot2", &personalities[0].id, None, None, None)
            .unwrap();

        // High-importance on a2
        insert_memory(
            &db,
            &a2.id,
            "Shared fact",
            8,
            "fact",
            None,
            false,
            &TEST_KEY,
        )
        .unwrap();
        // Low-importance on a2 — should not appear
        insert_memory(&db, &a2.id, "Low fact", 3, "fact", None, false, &TEST_KEY).unwrap();

        let cross = load_cross_avatar_memories(&db, &a1.id, &TEST_KEY, 20).unwrap();
        assert_eq!(cross.len(), 1);
        assert_eq!(cross[0].0.content, "Shared fact");
        assert_eq!(cross[0].1, "Bot2");
    }

    #[test]
    fn test_prune_vault_at_exactly_100_no_prune() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        for i in 0..100 {
            insert_memory(
                &db,
                &avatar_id,
                &format!("mem {}", i),
                5,
                "general",
                None,
                false,
                &TEST_KEY,
            )
            .unwrap();
        }
        let pruned = prune_vault_if_needed(&db, &avatar_id).unwrap();
        assert_eq!(pruned, 0);
        assert_eq!(db.count_active_vault_memories(&avatar_id).unwrap(), 100);
    }

    #[test]
    fn test_prune_vault_at_101_triggers_prune() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        for i in 0..101 {
            insert_memory(
                &db,
                &avatar_id,
                &format!("mem {}", i),
                5,
                "general",
                None,
                false,
                &TEST_KEY,
            )
            .unwrap();
        }
        let pruned = prune_vault_if_needed(&db, &avatar_id).unwrap();
        assert_eq!(pruned, 20);
        assert_eq!(db.count_active_vault_memories(&avatar_id).unwrap(), 81);
    }

    #[test]
    fn test_stored_content_is_encrypted_not_plaintext() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        insert_memory(
            &db,
            &avatar_id,
            "my secret preference",
            5,
            "general",
            None,
            false,
            &TEST_KEY,
        )
        .unwrap();
        let raw = db.get_all_active_memories_raw(&avatar_id).unwrap();
        assert_ne!(raw[0].content, "my secret preference"); // Must be ciphertext in DB
    }

    // ── load_vault_memories_ranked tests ────────────────────────────────

    #[test]
    fn test_ranked_memories_empty_keywords_falls_back() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);

        insert_memory(
            &db,
            &avatar_id,
            "Alpha memory",
            8,
            "general",
            None,
            false,
            &TEST_KEY,
        )
        .unwrap();
        insert_memory(
            &db,
            &avatar_id,
            "Beta memory",
            5,
            "general",
            None,
            false,
            &TEST_KEY,
        )
        .unwrap();

        let ranked = load_vault_memories_ranked(&db, &avatar_id, &TEST_KEY, 10, &[]).unwrap();
        let plain = load_vault_memories(&db, &avatar_id, &TEST_KEY, 10).unwrap();

        assert_eq!(ranked.len(), plain.len());
        for (r, p) in ranked.iter().zip(plain.iter()) {
            assert_eq!(r.id, p.id);
            assert_eq!(r.content, p.content);
        }
    }

    #[test]
    fn test_ranked_memories_keyword_boost() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);

        // High importance but no keyword match
        insert_memory(
            &db,
            &avatar_id,
            "I enjoy puzzle games a lot",
            7,
            "preference",
            None,
            false,
            &TEST_KEY,
        )
        .unwrap();
        // Lower importance but matches keyword "skyrim"
        insert_memory(
            &db,
            &avatar_id,
            "Loves playing Skyrim every evening",
            5,
            "preference",
            None,
            false,
            &TEST_KEY,
        )
        .unwrap();

        let keywords = vec!["skyrim".to_string()];
        let ranked = load_vault_memories_ranked(&db, &avatar_id, &TEST_KEY, 10, &keywords).unwrap();

        assert_eq!(ranked.len(), 2);
        // "Skyrim" memory (5 + 2.5 = 7.5) should rank above "puzzle" memory (7 + 0 = 7)
        assert!(ranked[0].content.contains("Skyrim"));
        assert!(ranked[1].content.contains("puzzle"));
    }

    #[test]
    fn test_ranked_memories_respects_limit() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);

        for i in 0..20 {
            insert_memory(
                &db,
                &avatar_id,
                &format!("Memory number {}", i),
                5,
                "general",
                None,
                false,
                &TEST_KEY,
            )
            .unwrap();
        }

        let ranked =
            load_vault_memories_ranked(&db, &avatar_id, &TEST_KEY, 5, &["number".to_string()])
                .unwrap();

        assert_eq!(ranked.len(), 5);
    }

    #[test]
    fn test_ranked_memories_keyword_bonus_caps_at_5() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);

        // This memory matches 3 keywords but bonus should cap at 5 (2 hits x 2.5)
        insert_memory(
            &db,
            &avatar_id,
            "I love skyrim and witcher and fallout",
            3,
            "preference",
            None,
            false,
            &TEST_KEY,
        )
        .unwrap();
        // This memory has high importance and matches 2 keywords (gets max +5)
        insert_memory(
            &db,
            &avatar_id,
            "RPG games like skyrim and witcher are the best",
            4,
            "preference",
            None,
            false,
            &TEST_KEY,
        )
        .unwrap();

        let keywords = vec![
            "skyrim".to_string(),
            "witcher".to_string(),
            "fallout".to_string(),
        ];
        let ranked = load_vault_memories_ranked(&db, &avatar_id, &TEST_KEY, 10, &keywords).unwrap();

        assert_eq!(ranked.len(), 2);
        // Both get +5 bonus (capped at 2 hits). Scores: first = 3+5=8, second = 4+5=9
        // So the second memory (importance 4) should rank first
        assert!(ranked[0].content.contains("RPG games"));
        assert!(ranked[1].content.contains("I love skyrim"));
    }

    #[test]
    fn test_ranked_memories_skips_short_keywords() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);

        // Memory that contains "an" and "or" — short keywords that should be ignored
        insert_memory(
            &db,
            &avatar_id,
            "an old or new adventure game",
            3,
            "preference",
            None,
            false,
            &TEST_KEY,
        )
        .unwrap();
        // Higher importance memory with no keyword relevance
        insert_memory(
            &db,
            &avatar_id,
            "Prefers strategy titles",
            6,
            "preference",
            None,
            false,
            &TEST_KEY,
        )
        .unwrap();

        // All keywords are < 3 chars, so they should be ignored (no boost applied)
        let keywords = vec!["an".to_string(), "or".to_string()];
        let ranked = load_vault_memories_ranked(&db, &avatar_id, &TEST_KEY, 10, &keywords).unwrap();

        assert_eq!(ranked.len(), 2);
        // With no valid keywords, ranking is by importance alone
        assert_eq!(ranked[0].importance, 6);
        assert_eq!(ranked[1].importance, 3);
    }

    // ── prune_vault_if_needed: 90-day hard-delete test ──────────────────

    #[test]
    fn test_prune_hard_deletes_old_inactive_memories() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);

        // Insert some memories and then soft-delete them
        let mut ids = Vec::new();
        for i in 0..5 {
            let id = insert_memory(
                &db,
                &avatar_id,
                &format!("Old mem {}", i),
                3,
                "general",
                None,
                false,
                &TEST_KEY,
            )
            .unwrap();
            ids.push(id);
        }
        db.soft_delete_memories_batch(&ids).unwrap();

        // Run prune — these are freshly created (not 90 days old), so hard-delete
        // should return 0 but the path still executes without error
        let pruned = prune_vault_if_needed(&db, &avatar_id).unwrap();
        assert_eq!(pruned, 0); // No active vault memories over 100, so no soft-deletes either
    }

    // ── seed_system_memories edge-case tests ────────────────────────────

    #[test]
    fn test_seed_system_memories_custom_name() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        seed_system_memories(&db, &avatar_id, "PixelPal", None, None, &TEST_KEY).unwrap();

        let mems = load_system_memories(&db, &avatar_id, &TEST_KEY).unwrap();
        // The first memory should contain the custom avatar name
        let has_name = mems.iter().any(|m| m.content.contains("PixelPal"));
        assert!(has_name);
        // Should NOT contain the default "TestBot" name from setup_avatar
        let has_testbot_in_content = mems.iter().any(|m| m.content.contains("TestBot"));
        assert!(!has_testbot_in_content);
    }

    #[test]
    fn test_seed_system_memories_all_importance_10() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        seed_system_memories(&db, &avatar_id, "Bot", None, None, &TEST_KEY).unwrap();

        let mems = load_system_memories(&db, &avatar_id, &TEST_KEY).unwrap();
        assert_eq!(mems.len(), 4);
        for mem in &mems {
            assert_eq!(
                mem.importance, 10,
                "Memory '{}' should have importance 10",
                mem.content
            );
        }
    }

    #[test]
    fn test_seed_system_memories_all_marked_system() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        seed_system_memories(&db, &avatar_id, "Bot", None, None, &TEST_KEY).unwrap();

        let mems = load_system_memories(&db, &avatar_id, &TEST_KEY).unwrap();
        assert_eq!(mems.len(), 4);
        for mem in &mems {
            assert!(
                mem.is_system,
                "Memory '{}' should be marked as system",
                mem.content
            );
        }
    }
}
