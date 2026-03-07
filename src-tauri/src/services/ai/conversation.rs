use crate::models::assistant::{AiMemory, AiMessage, CompactionResult};
use crate::models::settings::AppSettings;
use crate::services::ai::cloud_provider::{ChatMessage, ChatRole, StreamChunk};
use crate::services::ai::context_builder;
use crate::services::ai::encryption::{decrypt_field, encrypt_field};
use crate::services::ai::memory;
use crate::services::ai::providers;
use crate::services::cache_db::{CacheDb, CacheDbHandle};
use crate::services::credential_store;
use crate::utils::error::{AppError, MutexExt};
use tauri::Emitter;

use serde::Serialize;
use std::collections::HashMap;
use std::sync::OnceLock;

/// Payload broadcast via `ai-user-message` for cross-window conversation sync.
/// Both the main window and overlay receive this; the sender deduplicates by timestamp.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserMessagePayload {
    pub conversation_id: String,
    pub content: String,
    /// Unix timestamp (seconds) — used by the frontend to deduplicate messages
    /// that originated from the local window.
    pub timestamp: i64,
}

const CHARS_PER_TOKEN: usize = 3;
const TOKEN_BUDGET_LAYER4: usize = 4000; // ~12000 chars
#[allow(dead_code)]
const MID_SESSION_THRESHOLD: usize = 20;
/// Maximum messages (user + assistant) per conversation before auto-ending.
/// Prevents unbounded message table growth. Token budget already limits what's
/// sent to the LLM, but old messages remain in the DB. 200 messages ≈ 100 turns.
const MAX_MESSAGES_PER_CONVERSATION: usize = 200;

/// Per-conversation async mutex to serialize send_message_and_stream calls.
type ConversationLocks = std::sync::Mutex<HashMap<String, std::sync::Arc<tokio::sync::Mutex<()>>>>;

fn conversation_locks() -> &'static ConversationLocks {
    static LOCKS: OnceLock<ConversationLocks> = OnceLock::new();
    LOCKS.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

fn acquire_conversation_lock(conv_id: &str) -> std::sync::Arc<tokio::sync::Mutex<()>> {
    let mut map = conversation_locks()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    std::sync::Arc::clone(map.entry(conv_id.to_string()).or_default())
}

fn release_conversation_lock(conv_id: &str) {
    let mut map = conversation_locks()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    map.remove(conv_id);
}

fn build_conversation_system_prompt(personality_prompt: &str) -> String {
    let actions_prompt = context_builder::build_actions_system_prompt();
    format!(
        r#"You are a personal gaming companion in The Roost — a PC game launcher app that manages games from Steam, Epic, GOG, EA, Ubisoft, and Battle.net.

You have deep knowledge of the user's gaming library, playtime, and preferences through context provided with each message. Use this to give personalized, thoughtful responses.

## Your Personality
{}

## Important Guidelines
- If you don't have enough information to answer a question, say so honestly. It's better to say "I don't have that information" than to guess or make something up. You only know what's in the library context and memory vault provided to you.
- The library context you receive is a snapshot taken when the conversation started. If the user makes changes to their library mid-conversation (installing games, adding favorites, etc.), your context will not reflect those changes until the next conversation.
- When executing filter or sort actions across multiple turns, always include action:reset-filters before new filter/sort actions — even if the previous turn already set filters. Each turn's filters should be a fresh set, not additive on top of whatever the previous turn applied.

{}

Keep your responses conversational and engaging. You can reference specific games, stats, and patterns from the user's library to make the conversation feel personal."#,
        personality_prompt, actions_prompt
    )
}

fn build_compaction_prompt(vault_context: &str) -> String {
    format!(
        r#"You are a memory manager for The Roost, a gaming library assistant.
A conversation has just ended. Your job is to create a structured summary.

## Current Memory Vault
{}

## Instructions

Analyze the conversation and produce a JSON object with:

1. `summary` (string): A concise technical summary of the conversation topics.
   Include the main topics, decisions, and recommendations. Keep under 300 chars.

2. `journalEntry` (string): A more personal, narrative account written from
   the assistant's perspective, as if writing a diary entry about the conversation.
   Mention the user's mood, interests discussed, and any fun moments.
   Keep under 500 characters.

3. `memories` (array): Key facts learned about the user or noteworthy
   discussion points. Each memory is an object with:
   - `content` (string): The memory, 1-2 sentences max.
   - `importance` (integer 1-10): How important is this for future conversations?
     10 = critical preference or strong opinion
     7-9 = useful preference or notable fact
     4-6 = interesting but situational
     1-3 = minor detail, okay to forget eventually
   - `category` (string): One of "preference", "opinion", "fact", "general"

4. `supersededMemories` (array of strings): Short IDs (e.g., "mem-1", "mem-3")
   of existing memories from the vault that are contradicted or outdated based
   on this conversation. Only include IDs that should be replaced.

## Rules
- Maximum 10 memories per conversation (focus on quality over quantity)
- If nothing meaningful was discussed, return empty memories array
- Be specific: "User likes Elden Ring" is better than "User likes games"
- Capture opinions WITH reasoning when available
- Do NOT modify, supersede, or reference any memory marked as [SYSTEM]
- Respond ONLY with the JSON object, no other text."#,
        vault_context
    )
}

#[allow(dead_code)]
const MID_SESSION_SUMMARIZE_PROMPT: &str =
    "Summarize this conversation so far in under 300 tokens. \
     Preserve key decisions, questions asked, and action items.";

// ── Public API ──────────────────────────────────────────────────────

/// Start a new conversation or resume an existing one.
pub fn start_or_resume(db: &CacheDb, avatar_id: &str) -> Result<String, AppError> {
    if let Some(conv) = db.get_active_conversation(avatar_id)? {
        let started = chrono::NaiveDateTime::parse_from_str(&conv.started_at, "%Y-%m-%d %H:%M:%S")
            .map_err(|e| AppError::Parse(format!("Invalid conversation timestamp: {}", e)))?;
        let now = chrono::Utc::now().naive_utc();
        let age = now.signed_duration_since(started);
        if age.num_hours() < 1 {
            return Ok(conv.id); // Resume existing
        }
        // Stale — just end it (no compaction for auto-timeout)
        db.end_ai_conversation(&conv.id)?;
        release_conversation_lock(&conv.id);
    }
    let new_conv = db.create_ai_conversation(avatar_id)?;
    Ok(new_conv.id)
}

/// Build the full 4-layer request context.
pub fn assemble_context(
    db: &CacheDb,
    conv_id: &str,
    avatar_id: &str,
    key: &[u8; 32],
    settings: &AppSettings,
) -> Result<(String, Vec<ChatMessage>), AppError> {
    // Layer 1: System prompt with personality
    let avatar = db
        .get_active_ai_avatar()?
        .ok_or_else(|| AppError::NotFound("No active avatar".into()))?;
    let personality_prompt = db.get_personality_prompt(&avatar.personality_id)?;
    let mut system_prompt = build_conversation_system_prompt(&personality_prompt);

    // Layer 2: Library context
    let library_ctx = context_builder::build_filtered_library_summary(
        db,
        &settings.cloud_ai_context_scope,
        &settings.cloud_ai_excluded_games,
        &settings.cloud_ai_included_games,
    )?;
    if !library_ctx.is_empty() {
        system_prompt
            .push_str("\n\n## Your Knowledge of the User's Library\n<user-library-data>\n");
        system_prompt.push_str(&library_ctx);
        system_prompt.push_str("\n</user-library-data>");
    }

    // Layer 3: Memory context — rank by keyword relevance from recent conversation
    let system_mems = memory::load_system_memories(db, avatar_id, key)?;
    // Extract keywords from recent user messages for relevance ranking
    let recent_keywords = extract_recent_keywords(db, conv_id, key);
    let vault_mems = memory::load_vault_memories_ranked(db, avatar_id, key, 50, &recent_keywords)?;
    let cross_mems = memory::load_cross_avatar_memories(db, avatar_id, key, 20)?;
    let journal = memory::load_recent_journal(db, avatar_id, key, 7)?;
    let memory_ctx =
        memory::format_memory_context(&system_mems, &vault_mems, &cross_mems, &journal);
    if memory_ctx.len() > 50 {
        // More than just the header
        system_prompt.push_str("\n\n");
        system_prompt.push_str(&memory_ctx);
    }

    // Layer 3.5: Active game session context
    if let Ok(Some((game_name, start_time))) = db.get_active_game_session_context() {
        let now = chrono::Utc::now().timestamp();
        let duration_minutes = ((now - start_time) / 60).max(0);
        let start_str = chrono::DateTime::from_timestamp(start_time, 0)
            .map(|dt| dt.format("%H:%M").to_string())
            .unwrap_or_else(|| "unknown".to_string());
        // Sanitize game name: collapse to single line, cap length, defang injection
        let safe_name = context_builder::sanitize_for_prompt_context(
            &game_name
                .chars()
                .filter(|c| *c != '\n' && *c != '\r')
                .take(200)
                .collect::<String>(),
        );
        system_prompt.push_str(&format!(
            "\n\n## Current Activity\nThe user is currently playing \"{}\". Session started at {}, {} minutes ago.",
            safe_name, start_str, duration_minutes
        ));
    }

    // Layer 4: Conversation history
    let raw_msgs = db.get_ai_messages_raw(conv_id)?;
    let mut decrypted: Vec<(AiMessage, usize)> = Vec::with_capacity(raw_msgs.len());
    for row in &raw_msgs {
        let content = decrypt_field(&row.content, key)?;
        let token_est = content.len() / CHARS_PER_TOKEN;
        decrypted.push((
            AiMessage {
                id: row.id.clone(),
                conversation_id: row.conversation_id.clone(),
                role: row.role.clone(),
                content,
                created_at: row.created_at.clone(),
                token_estimate: row.token_estimate,
            },
            token_est,
        ));
    }

    // Budget: include most recent messages until TOKEN_BUDGET_LAYER4
    let char_budget = TOKEN_BUDGET_LAYER4 * CHARS_PER_TOKEN;
    let mut total_chars = 0;
    let mut included_indices: Vec<usize> = Vec::new();

    // Always include system messages (mid-session summaries) first
    for (i, (msg, _)) in decrypted.iter().enumerate() {
        if msg.role == "system" {
            total_chars += msg.content.len();
            included_indices.push(i);
        }
    }

    // Then include most recent non-system messages within budget
    for (i, (msg, _)) in decrypted.iter().enumerate().rev() {
        if msg.role == "system" {
            continue;
        }
        if total_chars + msg.content.len() > char_budget {
            break;
        }
        total_chars += msg.content.len();
        included_indices.push(i);
    }

    included_indices.sort();
    let messages: Vec<ChatMessage> = included_indices
        .iter()
        .map(|&i| {
            let (msg, _) = &decrypted[i];
            ChatMessage {
                role: match msg.role.as_str() {
                    "user" => ChatRole::User,
                    "assistant" => ChatRole::Assistant,
                    "system" => ChatRole::System,
                    _ => ChatRole::User,
                },
                content: msg.content.clone(),
                timestamp: msg.created_at.clone(),
            }
        })
        .collect();

    Ok((system_prompt, messages))
}

/// The core send + stream function.
#[allow(clippy::too_many_arguments)]
pub async fn send_message_and_stream(
    db: &CacheDbHandle,
    conv_id: &str,
    avatar_id: &str,
    user_message: &str,
    app_handle: &tauri::AppHandle,
    key: &[u8; 32],
    settings: &AppSettings,
    skip_user_persist: bool,
    action_feedback: Option<&str>,
    max_output_tokens: Option<u32>,
) -> Result<(), AppError> {
    // Serialize concurrent calls to the same conversation
    let conv_lock = acquire_conversation_lock(conv_id);
    let _guard = conv_lock.lock().await;

    // Step 0: Check message count cap + prevent duplicate auto-greetings
    {
        let db_guard = db.lock_or_err("DB")?;
        let msg_count = db_guard.get_ai_messages_raw(conv_id)?.len();
        if msg_count >= MAX_MESSAGES_PER_CONVERSATION {
            return Err(AppError::Validation(
                "Conversation has reached the message limit. Please end this conversation and start a new one.".into(),
            ));
        }
        // When both windows start a conversation simultaneously, both may try
        // to send the initial hidden auto-greeting. The per-conversation lock
        // serializes these calls, so the second one sees the first's stored
        // messages and returns early — preventing duplicate greetings.
        if skip_user_persist && msg_count > 0 {
            tracing::debug!(conv_id, "Skipping duplicate auto-greeting (conversation already has messages)");
            return Ok(());
        }
    }

    // Broadcast user message to all windows for cross-window sync EARLY,
    // before streaming begins. The frontend deduplicates by timestamp, so
    // this must fire within 2s of the frontend setting lastSentTimestampRef.
    // Only for visible (non-hidden) messages — hidden messages (auto-greetings,
    // system prompts) are not displayed in chat and don't need syncing.
    if !skip_user_persist {
        let payload = UserMessagePayload {
            conversation_id: conv_id.to_string(),
            content: user_message.to_string(),
            timestamp: chrono::Utc::now().timestamp(),
        };
        if let Err(e) = app_handle.emit("ai-user-message", &payload) {
            tracing::warn!(error = %e, "Failed to emit ai-user-message");
        }
    }

    // Step 1: Build context (under lock)
    let (system_prompt, mut messages) = {
        let db_guard = db.lock_or_err("DB")?;
        assemble_context(&db_guard, conv_id, avatar_id, key, settings)?
    }; // lock dropped

    // Inject action feedback as ephemeral context (not stored in DB)
    if let Some(feedback) = action_feedback {
        messages.push(ChatMessage {
            role: ChatRole::User,
            content: feedback.to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        });
    }

    // Add the new user message to the messages list
    messages.push(ChatMessage {
        role: ChatRole::User,
        content: user_message.to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    });

    // Load API key (keyring I/O, no lock)
    let api_key = credential_store::load_cloud_key(&settings.cloud_ai_provider)?
        .ok_or_else(|| AppError::Credential("No cloud API key configured".into()))?;

    // Step 2: Stream response (no lock held)
    let provider = providers::get_provider(&settings.cloud_ai_provider);
    let (tx, mut rx) = tokio::sync::mpsc::channel::<StreamChunk>(32);
    let conv_id_owned = conv_id.to_string();

    let handle = tokio::spawn(async move {
        provider
            .send_conversation_stream(
                &system_prompt,
                &messages,
                &api_key,
                tx,
                &conv_id_owned,
                max_output_tokens,
            )
            .await
    });

    let mut full_response = String::new();
    while let Some(chunk) = rx.recv().await {
        full_response.push_str(&chunk.text);
        if let Err(e) = app_handle.emit("ai-stream-chunk", &chunk) {
            tracing::warn!(error = %e, "Failed to emit ai-stream-chunk");
        }
    }

    // Check if the streaming task failed
    match handle.await {
        Ok(Ok(_)) => {} // Stream completed successfully
        Ok(Err(e)) => {
            if full_response.is_empty() {
                return Err(e);
            }
            // If we got partial response, log the error but continue with what we have
            tracing::warn!(error = %e, "Streaming completed with error but partial response received");
        }
        Err(e) => {
            if full_response.is_empty() {
                return Err(AppError::StoreApi(format!(
                    "Streaming task panicked: {}",
                    e
                )));
            }
            tracing::warn!(error = %e, "Streaming task panicked but partial response received");
        }
    }

    if full_response.is_empty() {
        return Err(AppError::StoreApi("AI returned an empty response".into()));
    }

    // Step 3: Store both messages atomically (re-acquire lock)
    let user_enc = encrypt_field(user_message, key)?;
    let asst_enc = encrypt_field(&full_response, key)?;
    let user_tokens = (user_message.len() / CHARS_PER_TOKEN) as u32;
    let asst_tokens = (full_response.len() / CHARS_PER_TOKEN) as u32;

    {
        let db_guard = db.lock_or_err("DB")?;
        db_guard.store_message_pair(
            conv_id,
            &user_enc,
            user_tokens,
            &asst_enc,
            asst_tokens,
            skip_user_persist,
        )?;
    } // DB lock dropped

    Ok(())
}

/// End conversation + compaction.
pub async fn end_conversation(
    db: &CacheDbHandle,
    conv_id: &str,
    avatar_id: &str,
    key: &[u8; 32],
    settings: &AppSettings,
) -> Result<bool, AppError> {
    // Step 1: Check eligibility and load data (under lock)
    let all_messages_decrypted = {
        let db_guard = db.lock_or_err("DB")?;
        let raw = db_guard.get_ai_messages_raw(conv_id)?;
        if raw.len() < 3 {
            db_guard.end_ai_conversation(conv_id)?;
            release_conversation_lock(conv_id);
            return Ok(false); // Too short
        }
        let mut decrypted = Vec::with_capacity(raw.len());
        for row in raw {
            let content = decrypt_field(&row.content, key)?;
            decrypted.push(AiMessage {
                id: row.id,
                conversation_id: row.conversation_id,
                role: row.role,
                content,
                created_at: row.created_at,
                token_estimate: row.token_estimate,
            });
        }
        decrypted
    }; // lock dropped

    // Load vault for contradiction check (needs lock)
    let vault_for_compaction = {
        let db_guard = db.lock_or_err("DB")?;
        memory::load_vault_memories(&db_guard, avatar_id, key, 100)?
    }; // lock dropped

    // Step 2: Build compaction prompt (no lock)
    let vault_context = format_vault_for_compaction(&vault_for_compaction);
    let id_map = build_compaction_id_map(&vault_for_compaction);
    let compaction_prompt = build_compaction_prompt(&vault_context);
    let transcript = format_conversation_transcript(&all_messages_decrypted);

    let api_key = credential_store::load_cloud_key(&settings.cloud_ai_provider)?
        .ok_or_else(|| AppError::Credential("No cloud API key configured".into()))?;
    let provider = providers::get_provider(&settings.cloud_ai_provider);

    // Step 3: Call compaction with auto-retry (no lock)
    let result = try_compaction(&*provider, &compaction_prompt, &transcript, &api_key).await;

    // Step 4: Store results (re-acquire lock)
    match result {
        None => {
            // Compaction failed — end conversation and mark as failed (compacted=2)
            // so retry logic can distinguish from never-attempted (compacted=0)
            let db_guard = db.lock_or_err("DB")?;
            db_guard.end_ai_conversation(conv_id)?;
            db_guard.mark_compaction_failed(conv_id)?;
            release_conversation_lock(conv_id);
            Ok(false)
        }
        Some(cr) => {
            // Encrypt content for storage
            let summary_enc = encrypt_field(&cr.summary, key)?;
            // Use dedicated journal entry if provided, otherwise fall back to summary
            let journal_text = cr.journal_entry.as_deref().unwrap_or(&cr.summary);
            let journal_enc = encrypt_field(journal_text, key)?;
            let memories: Vec<(String, u32, String)> = cr
                .memories
                .iter()
                .map(|mem| {
                    encrypt_field(&mem.content, key)
                        .map(|enc| (enc, mem.importance, mem.category.clone()))
                })
                .collect::<Result<Vec<_>, _>>()?;

            // Map short IDs (mem-1, mem-2, ...) back to real UUIDs
            let real_superseded: Vec<String> = cr
                .superseded_memories
                .iter()
                .filter_map(|short_id| {
                    id_map.get(short_id).cloned().or_else(|| {
                        // Also accept raw UUIDs for backwards compatibility
                        if short_id.len() > 8 {
                            Some(short_id.clone())
                        } else {
                            tracing::warn!(short_id, "Unknown memory ID in supersededMemories");
                            None
                        }
                    })
                })
                .collect();

            {
                let db_guard = db.lock_or_err("DB")?;
                db_guard.complete_compaction(
                    conv_id,
                    avatar_id,
                    &summary_enc,
                    &journal_enc,
                    &memories,
                    &real_superseded,
                )?;
                // Prune vault (separate — OK outside transaction, it's independent cleanup)
                memory::prune_vault_if_needed(&db_guard, avatar_id)?;
            }

            release_conversation_lock(conv_id);
            Ok(true)
        }
    }
}

/// Check for orphaned (un-ended, non-compacted) conversations for a specific avatar.
pub fn check_orphaned_conversations(
    db: &CacheDb,
    avatar_id: &str,
) -> Result<Vec<String>, AppError> {
    db.get_orphaned_conversations(avatar_id)
}

/// Public wrapper for format_vault_for_compaction (used by compaction raw data export).
pub fn format_vault_for_compaction_public(vault: &[AiMemory]) -> String {
    format_vault_for_compaction(vault)
}

/// Public wrapper for build_compaction_prompt (used by compaction raw data export).
pub fn build_compaction_prompt_public(vault_context: &str) -> String {
    build_compaction_prompt(vault_context)
}

/// Public wrapper for format_conversation_transcript (used by compaction raw data export).
pub fn format_transcript_public(messages: &[AiMessage]) -> String {
    format_conversation_transcript(messages)
}

// ── Internal Helpers ────────────────────────────────────────────────

/// Format vault memories for compaction prompt.
/// Uses sequential short IDs (mem-1, mem-2, ...) instead of raw UUIDs to save tokens
/// and reduce LLM confusion. Caller must use `build_compaction_id_map()` to map back.
fn format_vault_for_compaction(vault: &[AiMemory]) -> String {
    let mut out = String::new();
    let mut idx = 1;
    for mem in vault {
        if mem.is_system {
            out.push_str(&format!("[SYSTEM] [{}] {}\n", mem.importance, mem.content));
        } else {
            out.push_str(&format!(
                "[mem-{}] [{}] {}\n",
                idx, mem.importance, mem.content
            ));
            idx += 1;
        }
    }
    out
}

/// Extract keywords from the last few user messages for memory relevance ranking.
/// Returns lowercased tokens of 3+ characters, excluding common stop words.
fn extract_recent_keywords(db: &CacheDb, conv_id: &str, key: &[u8; 32]) -> Vec<String> {
    let raw = match db.get_ai_messages_raw(conv_id) {
        Ok(msgs) => msgs,
        Err(_) => return Vec::new(),
    };

    // Take last 4 user messages
    let user_msgs: Vec<_> = raw
        .iter()
        .rev()
        .filter(|m| m.role == "user")
        .take(4)
        .collect();

    let stop_words = [
        "the", "and", "for", "are", "but", "not", "you", "all", "can", "her", "was", "one", "our",
        "out", "has", "have", "from", "been", "had", "its", "that", "this", "with", "what", "show",
        "sort", "filter", "most", "any", "some", "more", "than", "like", "about", "which", "would",
        "should", "could", "just", "also", "into", "them", "then", "been", "when", "will", "each",
        "make", "many", "much", "very", "game", "games", "play", "played", "playing",
    ];

    let mut keywords = Vec::new();
    for msg in user_msgs {
        if let Ok(content) = decrypt_field(&msg.content, key) {
            for word in content.split_whitespace() {
                let clean: String = word
                    .to_lowercase()
                    .chars()
                    .filter(|c| c.is_alphanumeric())
                    .collect();
                if clean.len() >= 3 && !stop_words.contains(&clean.as_str()) {
                    keywords.push(clean);
                }
            }
        }
    }

    keywords.dedup();
    // Cap at 20 keywords to avoid excessive matching
    keywords.truncate(20);
    keywords
}

/// Build a map from short compaction IDs (mem-1, mem-2, ...) to real memory UUIDs.
fn build_compaction_id_map(vault: &[AiMemory]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let mut idx = 1;
    for mem in vault {
        if !mem.is_system {
            map.insert(format!("mem-{}", idx), mem.id.clone());
            idx += 1;
        }
    }
    map
}

/// Format conversation messages as a transcript for compaction.
fn format_conversation_transcript(messages: &[AiMessage]) -> String {
    let mut out = String::new();
    for msg in messages {
        if msg.role == "system" {
            continue;
        }
        let role_label = if msg.role == "user" {
            "User"
        } else {
            "Assistant"
        };
        out.push_str(&format!("{}: {}\n\n", role_label, msg.content));
    }
    out
}

/// Try compaction with one auto-retry on failure.
async fn try_compaction(
    provider: &dyn crate::services::ai::cloud_provider::CloudProviderApi,
    system_prompt: &str,
    transcript: &str,
    api_key: &str,
) -> Option<CompactionResult> {
    for attempt in 0..2 {
        match provider
            .send_query(system_prompt, transcript, api_key)
            .await
        {
            Ok(json_str) => {
                // Try to strip markdown code fences if present
                let clean = json_str.trim();
                let clean = if clean.starts_with("```") {
                    let inner = clean
                        .trim_start_matches("```json")
                        .trim_start_matches("```");
                    inner.trim_end_matches("```").trim()
                } else {
                    clean
                };
                match serde_json::from_str::<CompactionResult>(clean) {
                    Ok(result) => return Some(result),
                    Err(e) => {
                        tracing::warn!(attempt, error = %e, "Compaction JSON parse failed");
                    }
                }
            }
            Err(e) => {
                tracing::warn!(attempt, error = %e, "Compaction API call failed");
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::cache_db::CacheDb;

    const TEST_KEY: [u8; 32] = [0u8; 32];

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

    fn setup_avatar(db: &CacheDb) -> String {
        let personalities = db.list_ai_personalities().unwrap();
        let avatar = db
            .create_ai_avatar("TestBot", &personalities[0].id)
            .unwrap();
        db.switch_ai_avatar(&avatar.id).unwrap();
        avatar.id
    }

    #[test]
    fn test_start_or_resume_creates_new_when_none_exists() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        let conv_id = start_or_resume(&db, &avatar_id).unwrap();
        assert!(!conv_id.is_empty());
        let active = db.get_active_conversation(&avatar_id).unwrap();
        assert!(active.is_some());
        assert_eq!(active.unwrap().id, conv_id);
    }

    #[test]
    fn test_start_or_resume_returns_existing_if_recent() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        let first_id = start_or_resume(&db, &avatar_id).unwrap();
        let second_id = start_or_resume(&db, &avatar_id).unwrap();
        assert_eq!(first_id, second_id);
    }

    #[test]
    fn test_start_or_resume_ends_stale_creates_new() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        // Create a conversation backdated to 2 hours ago
        let two_hours_ago = (chrono::Utc::now() - chrono::Duration::hours(2))
            .naive_utc()
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        let stale_conv = db
            .create_ai_conversation_with_timestamp(&avatar_id, &two_hours_ago)
            .unwrap();

        // start_or_resume should detect it as stale, end it, and create a new one
        let new_id = start_or_resume(&db, &avatar_id).unwrap();
        assert_ne!(new_id, stale_conv.id);

        // Old conversation should be ended
        let active = db.get_active_conversation(&avatar_id).unwrap();
        assert!(active.is_some());
        assert_eq!(active.unwrap().id, new_id);
    }

    #[test]
    fn test_assemble_context_includes_personality() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        memory::seed_system_memories(&db, &avatar_id, "TestBot", &TEST_KEY).unwrap();
        let conv = db.create_ai_conversation(&avatar_id).unwrap();

        // Insert a user message
        let enc = crate::services::ai::encryption::encrypt_field("hello", &TEST_KEY).unwrap();
        db.insert_ai_message(&conv.id, "user", &enc, 2).unwrap();

        let settings = AppSettings::default();
        let (system_prompt, _messages) =
            assemble_context(&db, &conv.id, &avatar_id, &TEST_KEY, &settings).unwrap();

        // Should contain personality text from the first built-in personality
        assert!(system_prompt.contains("gaming companion"));
        assert!(system_prompt.contains("Your Personality"));
    }

    #[test]
    fn test_assemble_context_messages_in_order() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        let conv = db.create_ai_conversation(&avatar_id).unwrap();

        let enc1 = encrypt_field("first", &TEST_KEY).unwrap();
        let enc2 = encrypt_field("second", &TEST_KEY).unwrap();
        let enc3 = encrypt_field("third", &TEST_KEY).unwrap();

        db.insert_ai_message(&conv.id, "user", &enc1, 1).unwrap();
        db.insert_ai_message(&conv.id, "assistant", &enc2, 1)
            .unwrap();
        db.insert_ai_message(&conv.id, "user", &enc3, 1).unwrap();

        let settings = AppSettings::default();
        let (_prompt, messages) =
            assemble_context(&db, &conv.id, &avatar_id, &TEST_KEY, &settings).unwrap();

        assert_eq!(messages.len(), 3);
        assert_eq!(messages[0].content, "first");
        assert_eq!(messages[1].content, "second");
        assert_eq!(messages[2].content, "third");
        assert_eq!(messages[0].role, ChatRole::User);
        assert_eq!(messages[1].role, ChatRole::Assistant);
        assert_eq!(messages[2].role, ChatRole::User);
    }

    #[test]
    fn test_assemble_context_respects_token_budget() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        let conv = db.create_ai_conversation(&avatar_id).unwrap();

        // Insert 30 large messages (each ~1000 chars = ~250 tokens)
        // Budget is 4000 tokens = 16000 chars, so ~16 messages should fit
        let big_text = "x".repeat(1000);
        for i in 0..30 {
            let role = if i % 2 == 0 { "user" } else { "assistant" };
            let enc = encrypt_field(&big_text, &TEST_KEY).unwrap();
            db.insert_ai_message(&conv.id, role, &enc, 250).unwrap();
        }

        let settings = AppSettings::default();
        let (_prompt, messages) =
            assemble_context(&db, &conv.id, &avatar_id, &TEST_KEY, &settings).unwrap();

        // Should not include all 30 messages
        assert!(messages.len() < 30);
        // Should include at least some messages
        assert!(!messages.is_empty());
        // Total chars should be within budget
        let total_chars: usize = messages.iter().map(|m| m.content.len()).sum();
        assert!(total_chars <= TOKEN_BUDGET_LAYER4 * CHARS_PER_TOKEN);
    }

    #[test]
    fn test_assemble_context_includes_active_game_session() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        memory::seed_system_memories(&db, &avatar_id, "TestBot", &TEST_KEY).unwrap();
        let conv = db.create_ai_conversation(&avatar_id).unwrap();

        // Register a game and start an active session
        let game_id = db.register_game("steam", "440", "Team Fortress 2").unwrap();
        let now = chrono::Utc::now().timestamp();
        db.start_session(&game_id, now - 600).unwrap(); // started 10 min ago

        // Insert a user message so assemble_context has something to work with
        let enc = encrypt_field("hello", &TEST_KEY).unwrap();
        db.insert_ai_message(&conv.id, "user", &enc, 2).unwrap();

        let settings = AppSettings::default();
        let (system_prompt, _messages) =
            assemble_context(&db, &conv.id, &avatar_id, &TEST_KEY, &settings).unwrap();

        assert!(system_prompt.contains("Current Activity"));
        assert!(system_prompt.contains("Team Fortress 2"));
    }

    #[test]
    fn test_assemble_context_no_game_session_no_activity() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        memory::seed_system_memories(&db, &avatar_id, "TestBot", &TEST_KEY).unwrap();
        let conv = db.create_ai_conversation(&avatar_id).unwrap();

        let enc = encrypt_field("hello", &TEST_KEY).unwrap();
        db.insert_ai_message(&conv.id, "user", &enc, 2).unwrap();

        let settings = AppSettings::default();
        let (system_prompt, _messages) =
            assemble_context(&db, &conv.id, &avatar_id, &TEST_KEY, &settings).unwrap();

        assert!(!system_prompt.contains("Current Activity"));
    }

    #[test]
    fn test_end_conversation_skips_compaction_under_3() {
        // This tests the sync portion: check count < 3, end, return false
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        let conv = db.create_ai_conversation(&avatar_id).unwrap();

        // Insert only 2 messages
        let enc1 = encrypt_field("hello", &TEST_KEY).unwrap();
        let enc2 = encrypt_field("hi there!", &TEST_KEY).unwrap();
        db.insert_ai_message(&conv.id, "user", &enc1, 2).unwrap();
        db.insert_ai_message(&conv.id, "assistant", &enc2, 3)
            .unwrap();

        // Directly test the eligibility check logic
        let raw = db.get_ai_messages_raw(&conv.id).unwrap();
        assert_eq!(raw.len(), 2);
        assert!(raw.len() < 3); // Would skip compaction
        db.end_ai_conversation(&conv.id).unwrap();

        // Verify conversation is ended
        let active = db.get_active_conversation(&avatar_id).unwrap();
        assert!(active.is_none());

        // Messages should still exist (no compaction happened)
        let msgs = db.get_ai_messages_raw(&conv.id).unwrap();
        assert_eq!(msgs.len(), 2);
    }

    #[test]
    fn test_check_orphaned_finds_open_conversations() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);

        let conv1 = db.create_ai_conversation(&avatar_id).unwrap();
        let conv2 = db.create_ai_conversation(&avatar_id).unwrap();

        // End conv1
        db.end_ai_conversation(&conv1.id).unwrap();

        let orphans = check_orphaned_conversations(&db, &avatar_id).unwrap();
        assert_eq!(orphans.len(), 1);
        assert_eq!(orphans[0], conv2.id);
    }

    #[test]
    fn test_format_vault_for_compaction() {
        let system_mem = AiMemory {
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
        };
        let user_mem = AiMemory {
            id: "u1".into(),
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
        };

        let output = format_vault_for_compaction(&[system_mem.clone(), user_mem.clone()]);
        assert!(output.contains("[SYSTEM] [10] System instruction"));
        assert!(output.contains("[mem-1] [8] Loves RPGs"));

        // Verify ID map
        let id_map = build_compaction_id_map(&[system_mem, user_mem]);
        assert_eq!(id_map.get("mem-1"), Some(&"u1".to_string()));
        assert!(!id_map.contains_key("mem-0")); // system memories not mapped
    }

    #[test]
    fn test_format_conversation_transcript() {
        let messages = vec![
            AiMessage {
                id: "m1".into(),
                conversation_id: "c1".into(),
                role: "user".into(),
                content: "What should I play?".into(),
                created_at: "2026-02-27 10:00:00".into(),
                token_estimate: 5,
            },
            AiMessage {
                id: "m2".into(),
                conversation_id: "c1".into(),
                role: "assistant".into(),
                content: "Try Elden Ring!".into(),
                created_at: "2026-02-27 10:00:01".into(),
                token_estimate: 4,
            },
            AiMessage {
                id: "m3".into(),
                conversation_id: "c1".into(),
                role: "system".into(),
                content: "Summary of earlier messages".into(),
                created_at: "2026-02-27 09:00:00".into(),
                token_estimate: 5,
            },
        ];

        let transcript = format_conversation_transcript(&messages);
        assert!(transcript.contains("User: What should I play?"));
        assert!(transcript.contains("Assistant: Try Elden Ring!"));
        // System messages should be excluded
        assert!(!transcript.contains("Summary of earlier messages"));
    }

    #[test]
    fn test_try_compaction_parses_valid_json() {
        // Test the JSON parsing logic directly by calling serde_json
        let valid_json = r#"{
            "summary": "Discussed RPGs and recommendations.",
            "memories": [
                {"content": "User loves RPGs", "importance": 8, "category": "preference"}
            ],
            "supersededMemories": ["old-mem-1"]
        }"#;

        let result: Result<CompactionResult, _> = serde_json::from_str(valid_json);
        assert!(result.is_ok());
        let cr = result.unwrap();
        assert_eq!(cr.summary, "Discussed RPGs and recommendations.");
        assert!(cr.journal_entry.is_none()); // Optional, defaults to None
        assert_eq!(cr.memories.len(), 1);
        assert_eq!(cr.memories[0].content, "User loves RPGs");
        assert_eq!(cr.memories[0].importance, 8);
        assert_eq!(cr.superseded_memories.len(), 1);
        assert_eq!(cr.superseded_memories[0], "old-mem-1");
    }

    #[test]
    fn test_compaction_result_with_journal_entry() {
        let json = r#"{
            "summary": "Talked about RPGs.",
            "journalEntry": "Had a wonderful chat about the user's love of RPGs today!",
            "memories": [],
            "supersededMemories": []
        }"#;
        let cr: CompactionResult = serde_json::from_str(json).unwrap();
        assert_eq!(cr.summary, "Talked about RPGs.");
        assert_eq!(
            cr.journal_entry.as_deref(),
            Some("Had a wonderful chat about the user's love of RPGs today!")
        );
    }

    #[test]
    fn test_build_conversation_system_prompt() {
        let prompt = build_conversation_system_prompt("You are a friendly guide.");
        assert!(prompt.contains("You are a friendly guide."));
        assert!(prompt.contains("Your Personality"));
        // Phase 13: action instructions
        assert!(prompt.contains("---ACTIONS---"));
        assert!(prompt.contains("CRITICAL RULES"));
        assert!(prompt.contains("AVAILABLE ACTIONS"));
        // REVIEW BEHAVIOR was removed — rule #8 now enforces actions only on explicit request
        assert!(prompt.contains("EXAMPLES"));
        // 02-P1: "I don't know" guidance
        assert!(prompt.contains("I don't have that information"));
        // 02-P3: Context freshness
        assert!(prompt.contains("snapshot"));
        // 02-P2: Multi-turn filter reset
        assert!(prompt.contains("Each turn's filters should be a fresh set"));
    }

    #[test]
    fn test_compaction_result_camelcase_deserialization() {
        // Verify CompactionResult deserializes from camelCase JSON
        let json = r#"{
            "summary": "Test summary",
            "memories": [],
            "supersededMemories": ["id1", "id2"]
        }"#;

        let result: CompactionResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.summary, "Test summary");
        assert_eq!(result.memories.len(), 0);
        assert_eq!(result.superseded_memories.len(), 2);
        assert_eq!(result.superseded_memories[0], "id1");

        // Also verify snake_case does NOT work (since we use camelCase)
        let snake_json = r#"{
            "summary": "Test",
            "memories": [],
            "superseded_memories": ["id1"]
        }"#;
        let snake_result: Result<CompactionResult, _> = serde_json::from_str(snake_json);
        // This should fail because the struct expects camelCase
        assert!(snake_result.is_err());
    }

    #[test]
    fn test_assemble_context_system_messages_always_included() {
        let db = test_db();
        let avatar_id = setup_avatar(&db);
        let conv = db.create_ai_conversation(&avatar_id).unwrap();
        memory::seed_system_memories(&db, &avatar_id, "Bot", &TEST_KEY).unwrap();

        // Insert a system summary message
        let sys_enc = encrypt_field(
            "This is a mid-session summary of the conversation so far.",
            &TEST_KEY,
        )
        .unwrap();
        db.insert_ai_message(&conv.id, "system", &sys_enc, 50)
            .unwrap();

        // Insert many large user/assistant messages to exceed token budget
        for i in 0..30 {
            let role = if i % 2 == 0 { "user" } else { "assistant" };
            let large_msg = "x".repeat(1000); // 1000 chars each
            let enc = encrypt_field(&large_msg, &TEST_KEY).unwrap();
            db.insert_ai_message(&conv.id, role, &enc, 250).unwrap();
        }

        let settings = AppSettings::default();
        let (_, messages) =
            assemble_context(&db, &conv.id, &avatar_id, &TEST_KEY, &settings).unwrap();

        // System message should always be included
        assert!(messages.iter().any(|m| m.role == ChatRole::System));
        // Should have some but not all 30 user/assistant messages (budget exceeded)
        let non_system = messages
            .iter()
            .filter(|m| m.role != ChatRole::System)
            .count();
        assert!(non_system > 0);
        assert!(non_system < 30);
    }

    // ── Phase 10: Public Wrapper Tests ──────────────────────────────

    #[test]
    fn test_format_vault_for_compaction_public_matches_internal() {
        let vault = vec![AiMemory {
            id: "m1".into(),
            avatar_id: "a".into(),
            conversation_id: None,
            content: "Likes RPGs".into(),
            importance: 8,
            category: "preference".into(),
            is_system: false,
            created_at: "2026-02-27".into(),
            last_referenced: None,
            superseded_by: None,
            active: true,
        }];
        let internal = format_vault_for_compaction(&vault);
        let public = format_vault_for_compaction_public(&vault);
        assert_eq!(internal, public);
    }

    #[test]
    fn test_build_compaction_prompt_public_matches_internal() {
        let vault_ctx = "[mem-1] [8] Likes RPGs\n";
        let internal = build_compaction_prompt(vault_ctx);
        let public = build_compaction_prompt_public(vault_ctx);
        assert_eq!(internal, public);
    }

    #[test]
    fn test_format_transcript_public_matches_internal() {
        let messages = vec![AiMessage {
            id: "m1".into(),
            conversation_id: "c1".into(),
            role: "user".into(),
            content: "Hello".into(),
            created_at: "2026-02-27 10:00:00".into(),
            token_estimate: 1,
        }];
        let internal = format_conversation_transcript(&messages);
        let public = format_transcript_public(&messages);
        assert_eq!(internal, public);
    }

    #[test]
    fn acquire_and_release_conversation_lock() {
        let lock = acquire_conversation_lock("test-lock-conv-1");
        assert!(lock.try_lock().is_ok());
        release_conversation_lock("test-lock-conv-1");
        let map = conversation_locks().lock().unwrap();
        assert!(!map.contains_key("test-lock-conv-1"));
    }

    #[test]
    fn separate_conversations_get_separate_locks() {
        let lock_a = acquire_conversation_lock("lock-conv-a");
        let lock_b = acquire_conversation_lock("lock-conv-b");
        assert!(!std::sync::Arc::ptr_eq(&lock_a, &lock_b));
        release_conversation_lock("lock-conv-a");
        release_conversation_lock("lock-conv-b");
    }

    #[test]
    fn same_conversation_gets_same_lock() {
        let lock1 = acquire_conversation_lock("lock-conv-same");
        let lock2 = acquire_conversation_lock("lock-conv-same");
        assert!(std::sync::Arc::ptr_eq(&lock1, &lock2));
        release_conversation_lock("lock-conv-same");
    }
}
