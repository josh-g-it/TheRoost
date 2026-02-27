use crate::models::assistant::{AiDailyLog, AiMemory};
use crate::services::ai::encryption::{decrypt_field, encrypt_field};
use crate::services::cache_db::{AiMemoryRow, CacheDb};
use crate::utils::error::AppError;

/// Load active system memories (decrypted) for an avatar.
#[allow(dead_code)]
pub fn load_system_memories(
    db: &CacheDb,
    avatar_id: &str,
    key: &[u8; 32],
) -> Result<Vec<AiMemory>, AppError> {
    let rows = db.get_active_system_memories_raw(avatar_id)?;
    rows_to_memories(rows, key)
}

/// Load top vault memories (decrypted) by importance.
#[allow(dead_code)]
pub fn load_vault_memories(
    db: &CacheDb,
    avatar_id: &str,
    key: &[u8; 32],
    limit: u32,
) -> Result<Vec<AiMemory>, AppError> {
    let rows = db.get_active_vault_memories_raw(avatar_id, limit)?;
    rows_to_memories(rows, key)
}

/// Load cross-avatar memories (decrypted) — returns (memory, avatar_name) pairs.
#[allow(dead_code)]
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
#[allow(dead_code)]
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
#[allow(dead_code)]
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
    db.insert_ai_memory_raw(avatar_id, &encrypted, importance, category, conversation_id, is_system)
}

/// Prune vault if active non-system memories exceed 100.
/// Returns the number of memories pruned.
#[allow(dead_code)]
pub fn prune_vault_if_needed(db: &CacheDb, avatar_id: &str) -> Result<u32, AppError> {
    let count = db.count_active_vault_memories(avatar_id)?;
    if count <= 100 {
        return Ok(0);
    }
    let to_prune = db.get_lowest_importance_memories(avatar_id, 20)?;
    let pruned = to_prune.len() as u32;
    db.soft_delete_memories_batch(&to_prune)?;
    Ok(pruned)
}

/// Seed the 5 static system memories for a new avatar.
pub fn seed_system_memories(
    db: &CacheDb,
    avatar_id: &str,
    avatar_name: &str,
    username: &str,
    key: &[u8; 32],
) -> Result<(), AppError> {
    let system_memories = [
        format!(
            "Your name is {}. You are the user's AI gaming companion in The Roost.",
            avatar_name
        ),
        format!(
            "The user's name is {}. Always address them by name when appropriate.",
            username
        ),
        "You have access to the user's game library, playtime data, and gaming preferences through context provided with each message.".to_string(),
        "When the user asks you to perform actions (like filtering games, adding favorites, etc.), respond with the appropriate action format so the system can execute it.".to_string(),
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

#[allow(dead_code)]
fn rows_to_memories(rows: Vec<AiMemoryRow>, key: &[u8; 32]) -> Result<Vec<AiMemory>, AppError> {
    let mut memories = Vec::with_capacity(rows.len());
    for row in rows {
        let content = decrypt_field(&row.content, key)?;
        memories.push(row_to_memory(row, content));
    }
    Ok(memories)
}

#[allow(dead_code)]
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
            .create_ai_avatar("TestBot", &personalities[0].id)
            .unwrap();
        avatar.id
    }

    #[test]
    fn test_seed_system_memories() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        seed_system_memories(&db, &avatar_id, "TestBot", "Josh", &TEST_KEY).unwrap();
        let mems = load_system_memories(&db, &avatar_id, &TEST_KEY).unwrap();
        assert_eq!(mems.len(), 5);
        assert!(mems.iter().all(|m| m.is_system));
        assert!(mems.iter().all(|m| m.importance == 10));
        // Check personalization
        assert!(mems.iter().any(|m| m.content.contains("TestBot")));
        assert!(mems.iter().any(|m| m.content.contains("Josh")));
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
        seed_system_memories(&db, &avatar_id, "Bot", "User", &TEST_KEY).unwrap();
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
        assert_eq!(system.len(), 5); // All 5 system memories intact
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
            .create_ai_avatar("Bot1", &personalities[0].id)
            .unwrap();
        let a2 = db
            .create_ai_avatar("Bot2", &personalities[0].id)
            .unwrap();

        // High-importance on a2
        insert_memory(
            &db, &a2.id, "Shared fact", 8, "fact", None, false, &TEST_KEY,
        )
        .unwrap();
        // Low-importance on a2 — should not appear
        insert_memory(
            &db, &a2.id, "Low fact", 3, "fact", None, false, &TEST_KEY,
        )
        .unwrap();

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
}
