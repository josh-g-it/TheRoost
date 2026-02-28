use base64::Engine;
use tauri::{Emitter, Manager, State};

use crate::models::ai::{CloudAiUsage, CloudProvider, ResolvedIntent};
use crate::models::assistant::{
    AiAvatar, AiDailyLog, AiMemory, AiMessage, AiPersonality, CompactionResult,
};
use crate::services::ai::action_resolver;
use crate::services::ai::action_validator::{self, RawAiAction};
use crate::services::ai::cloud_config::CloudConfigHandle;
use crate::services::ai::cloud_resolver::CloudResolver;
use crate::services::ai::context_builder;
use crate::services::ai::conversation;
use crate::services::ai::conversation_timer::{
    self, ConversationEndedPayload, ConversationTimerHandle, TimerTickPayload,
};
use crate::services::ai::encryption;
use crate::services::ai::memory;
use crate::services::ai::orchestrator::AiOrchestrator;
use crate::services::ai::pattern_matcher::PatternMatcher;
use crate::services::cache_db::CacheDbHandle;
use crate::services::credential_store;
use crate::services::settings_store;
use crate::utils::error::{AppError, MutexExt};

/// Validate and resolve AI actions in a single IPC round-trip.
/// Validates tiers (rejects blacklisted/unknown) and fuzzy-resolves game names to UUIDs.
#[tauri::command]
pub fn validate_and_resolve_ai_actions(
    actions: Vec<RawAiAction>,
    db: State<'_, CacheDbHandle>,
) -> Result<action_resolver::ResolvedActionSet, AppError> {
    // Step 1: Validate tiers
    let (validated, rejected_count) = action_validator::validate_actions(actions);

    // Step 2: Resolve game names to UUIDs
    let game_library = {
        let db_guard = db.lock_or_err("DB")?;
        db_guard.get_all_game_names()?
    };

    Ok(action_resolver::resolve_actions(
        validated,
        &game_library,
        rejected_count,
    ))
}

/// Pattern-matcher-only AI resolution (instant, local, always available).
/// Called automatically by the frontend for every qualifying search query.
#[tauri::command]
pub fn ai_resolve_intent(
    query: String,
    db: State<'_, CacheDbHandle>,
) -> Result<Option<ResolvedIntent>, AppError> {
    let ctx = {
        let db = db.lock_or_err("DB")?;
        AiOrchestrator::build_context(&db)?
    };

    Ok(PatternMatcher::resolve(&query, &ctx))
}

/// Explicit cloud AI resolution (user-initiated via "Ask Assistant" button).
/// Only called when the user deliberately clicks to send their query.
#[tauri::command]
pub async fn ai_cloud_resolve(
    query: String,
    db: State<'_, CacheDbHandle>,
    cloud: State<'_, CloudConfigHandle>,
    app_handle: tauri::AppHandle,
) -> Result<Option<ResolvedIntent>, AppError> {
    // Read scope settings from disk (infrequent — only on explicit user click)
    let settings = settings_store::load_settings(&app_handle)?;
    let scope = settings.cloud_ai_context_scope;
    let excluded = settings.cloud_ai_excluded_games;
    let included = settings.cloud_ai_included_games;

    // Build context with a short DB lock scope
    let (ctx, library_summary) = {
        let db = db.lock_or_err("DB")?;
        let ctx = AiOrchestrator::build_context(&db)?;
        let summary =
            context_builder::build_filtered_library_summary(&db, &scope, &excluded, &included)?;
        (ctx, summary)
    }; // DB lock dropped

    // Check cloud config
    let can_cloud = {
        let mut config = cloud.lock_or_err("CloudConfig")?;
        config.maybe_reset_daily();
        config.enabled && config.can_request()
    };

    if !can_cloud {
        return Ok(None);
    }

    let config_snapshot = {
        let config = cloud.lock_or_err("CloudConfig")?;
        config.clone()
    };

    let result = CloudResolver::resolve(&query, &ctx, &library_summary, &config_snapshot).await;

    // Record the request and handle rate limiting
    match &result {
        Ok(Some(_)) => {
            let mut config = cloud.lock_or_err("CloudConfig")?;
            config.record_request();
        }
        Err(e) => {
            if let AppError::StoreApi(ref msg) = e {
                if msg.contains("429") {
                    let mut config = cloud.lock_or_err("CloudConfig")?;
                    config.set_rate_limited(60);
                    config.record_request();
                    return Ok(None);
                }
            }
            tracing::warn!(error = %e, "Cloud AI request failed, degrading gracefully");
            return Ok(None);
        }
        Ok(None) => {}
    }

    result
}

#[tauri::command]
pub fn store_cloud_api_key(provider: String, key: String) -> Result<(), AppError> {
    credential_store::store_cloud_key(&provider, &key)
}

#[tauri::command]
pub fn delete_cloud_api_key(provider: String) -> Result<(), AppError> {
    credential_store::delete_cloud_key(&provider)
}

#[tauri::command]
pub fn get_cloud_api_key_status(provider: String) -> Result<bool, AppError> {
    Ok(credential_store::load_cloud_key(&provider)?.is_some())
}

#[tauri::command]
pub async fn test_cloud_api_key(provider: String) -> Result<bool, AppError> {
    let api_key = match credential_store::load_cloud_key(&provider)? {
        Some(key) => key,
        None => return Ok(false),
    };

    let cloud_provider = CloudProvider::from_str(&provider)
        .ok_or_else(|| AppError::Parse(format!("Unknown provider: {provider}")))?;

    use crate::services::ai::cloud_provider::CloudProviderApi;
    use crate::services::ai::gemini_provider::GeminiProvider;

    match cloud_provider {
        CloudProvider::OpenAi | CloudProvider::Claude => {
            return Err(AppError::Parse(format!(
                "{} support coming soon",
                cloud_provider.display_name()
            )));
        }
        CloudProvider::Gemini => {}
    }

    let provider_impl = GeminiProvider;
    match provider_impl
        .send_query(
            "You are a test. Respond with exactly: {\"actions\":[],\"summary\":\"ok\",\"confidence\":1.0}",
            "test",
            &api_key,
        )
        .await
    {
        Ok(_) => Ok(true),
        Err(e) => {
            tracing::warn!(error = %e, "Cloud API key test failed");
            Ok(false)
        }
    }
}

#[tauri::command]
pub fn get_cloud_ai_usage(cloud: State<'_, CloudConfigHandle>) -> Result<CloudAiUsage, AppError> {
    let mut config = cloud.lock_or_err("CloudConfig")?;
    config.maybe_reset_daily();
    Ok(CloudAiUsage {
        requests_today: config.requests_today,
        daily_limit: config.daily_limit,
        provider: config.provider.display_name().to_string(),
        last_reset_date: config.last_reset_date.clone(),
    })
}

#[tauri::command]
pub fn update_cloud_ai_settings(
    enabled: bool,
    provider: String,
    daily_limit: u32,
    cloud: State<'_, CloudConfigHandle>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    let cloud_provider = CloudProvider::from_str(&provider).unwrap_or(CloudProvider::Gemini);

    let clamped_limit = daily_limit.max(1);

    {
        let mut config = cloud.lock_or_err("CloudConfig")?;
        config.enabled = enabled;
        config.provider = cloud_provider;
        config.daily_limit = clamped_limit;
    } // drop lock before disk I/O

    // Persist cloud AI fields to settings.json so they survive app restart
    let mut settings = settings_store::load_settings(&app_handle)?;
    settings.cloud_ai_enabled = enabled;
    settings.cloud_ai_provider = provider.clone();
    settings.cloud_ai_daily_limit = clamped_limit;
    settings_store::save_settings(&app_handle, &settings)?;

    tracing::info!(
        enabled,
        provider = provider.as_str(),
        daily_limit = clamped_limit,
        "Cloud AI settings updated and persisted"
    );
    Ok(())
}

// ── Personality Commands ────────────────────────────────────────────

#[tauri::command]
pub fn list_personalities(db: State<'_, CacheDbHandle>) -> Result<Vec<AiPersonality>, AppError> {
    let db = db.lock_or_err("DB")?;
    db.list_ai_personalities()
}

#[tauri::command]
pub fn create_personality(
    name: String,
    prompt_text: String,
    db: State<'_, CacheDbHandle>,
) -> Result<AiPersonality, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation(
            "Personality name cannot be empty".into(),
        ));
    }
    let db = db.lock_or_err("DB")?;
    db.create_ai_personality(&name, &prompt_text)
}

// ── Avatar Commands ─────────────────────────────────────────────────

#[tauri::command]
pub fn list_avatars(db: State<'_, CacheDbHandle>) -> Result<Vec<AiAvatar>, AppError> {
    let db = db.lock_or_err("DB")?;
    db.list_ai_avatars()
}

#[tauri::command]
pub fn get_active_avatar(db: State<'_, CacheDbHandle>) -> Result<Option<AiAvatar>, AppError> {
    let db = db.lock_or_err("DB")?;
    db.get_active_ai_avatar()
}

#[tauri::command]
pub fn create_avatar(
    name: String,
    personality_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<AiAvatar, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("Avatar name cannot be empty".into()));
    }

    // Load encryption key BEFORE DB lock (keyring I/O)
    let key = encryption::load_encryption_key().ok();

    let db = db.lock_or_err("DB")?;
    let avatar = db.create_ai_avatar(&name, &personality_id)?;

    // Seed system memories if encryption key is available
    if let Some(key) = &key {
        if let Err(e) = memory::seed_system_memories(&db, &avatar.id, &avatar.name, key) {
            tracing::warn!(error = %e, "Failed to seed system memories for new avatar — they will be seeded later");
        }
    }

    Ok(avatar)
}

#[tauri::command]
pub fn switch_avatar(avatar_id: String, db: State<'_, CacheDbHandle>) -> Result<(), AppError> {
    let db = db.lock_or_err("DB")?;
    db.switch_ai_avatar(&avatar_id)
}

#[tauri::command]
pub fn delete_avatar(avatar_id: String, db: State<'_, CacheDbHandle>) -> Result<(), AppError> {
    let db_guard = db.lock_or_err("DB")?;

    let count = db_guard.count_ai_avatars()?;

    // Guard: cannot delete the active avatar when other avatars exist —
    // must switch away first. But CAN delete the active avatar if it's
    // the last one (returns user to the first-run wizard).
    if count > 1 {
        if let Some(active) = db_guard.get_active_ai_avatar()? {
            if active.id == avatar_id {
                return Err(AppError::Validation(
                    "Cannot delete the active avatar. Switch to a different avatar first.".into(),
                ));
            }
        }
    }

    db_guard.delete_ai_avatar(&avatar_id)?;
    tracing::info!(avatar_id = avatar_id.as_str(), "Avatar deleted");
    Ok(())
}

#[tauri::command]
pub fn wipe_avatar_data(avatar_id: String, db: State<'_, CacheDbHandle>) -> Result<(), AppError> {
    // Load encryption key BEFORE acquiring DB lock (keyring I/O)
    let key = encryption::load_encryption_key()?;

    // First lock scope: get avatar name + wipe data
    let avatar_name = {
        let db_guard = db.lock_or_err("DB")?;
        let avatars = db_guard.list_ai_avatars()?;
        let name = avatars
            .iter()
            .find(|a| a.id == avatar_id)
            .map(|a| a.name.clone())
            .ok_or_else(|| AppError::NotFound("Avatar not found".into()))?;
        db_guard.wipe_avatar_data(&avatar_id)?;
        name
    }; // DB lock dropped

    // Second lock scope: re-seed system memories
    {
        let db_guard = db.lock_or_err("DB")?;
        memory::seed_system_memories(&db_guard, &avatar_id, &avatar_name, &key)?;
    }

    tracing::info!(
        avatar_id = avatar_id.as_str(),
        "Avatar data wiped and system memories re-seeded"
    );
    Ok(())
}

// ── Memory Commands ─────────────────────────────────────────────────

#[tauri::command]
pub fn get_memories(
    avatar_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<AiMemory>, AppError> {
    let key = encryption::load_encryption_key()?;
    let db = db.lock_or_err("DB")?;
    let rows = db.get_all_active_memories_raw(&avatar_id)?;
    let mut memories = Vec::with_capacity(rows.len());
    for row in rows {
        let content = encryption::decrypt_field(&row.content, &key)?;
        memories.push(AiMemory {
            id: row.id,
            avatar_id: row.avatar_id,
            conversation_id: row.conversation_id,
            content,
            importance: row.importance,
            category: row.category,
            is_system: row.is_system,
            created_at: row.created_at,
            last_referenced: row.last_referenced,
            superseded_by: row.superseded_by,
            active: row.active,
        });
    }
    Ok(memories)
}

#[tauri::command]
pub fn delete_memory(memory_id: String, db: State<'_, CacheDbHandle>) -> Result<(), AppError> {
    let db = db.lock_or_err("DB")?;
    db.soft_delete_user_memory(&memory_id)
}

// ── Journal Commands ────────────────────────────────────────────────

#[tauri::command]
pub fn get_journal(
    avatar_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<AiDailyLog>, AppError> {
    let key = encryption::load_encryption_key()?;
    let db = db.lock_or_err("DB")?;
    let rows = db.get_ai_journal_raw(&avatar_id)?;
    let mut entries = Vec::with_capacity(rows.len());
    for row in rows {
        let summary = encryption::decrypt_field(&row.summary, &key)?;
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

#[tauri::command]
pub fn delete_journal_entry(
    entry_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    let db = db.lock_or_err("DB")?;
    db.delete_ai_journal_entry(&entry_id)
}

// ── Encryption Key Commands ─────────────────────────────────────────

#[tauri::command]
pub fn generate_encryption_key() -> Result<(), AppError> {
    if encryption::has_encryption_key()? {
        return Err(AppError::Encryption("Encryption key already exists".into()));
    }
    let key = encryption::generate_aes_key();
    encryption::store_encryption_key(&key)?;
    Ok(())
}

#[tauri::command]
pub fn check_encryption_key_exists() -> Result<bool, AppError> {
    encryption::has_encryption_key()
}

#[tauri::command]
pub fn import_encryption_key(key_base64: String) -> Result<(), AppError> {
    if key_base64.trim().is_empty() {
        return Err(AppError::Validation("Key cannot be empty".into()));
    }
    encryption::store_encryption_key_from_base64(&key_base64)?;
    tracing::info!("Encryption key imported successfully");
    Ok(())
}

#[tauri::command]
pub fn export_encryption_key() -> Result<String, AppError> {
    let key = encryption::load_encryption_key()?;
    Ok(base64::engine::general_purpose::STANDARD.encode(*key))
}

// ── Conversation Commands ────────────────────────────────────────────

#[tauri::command]
pub async fn start_conversation(
    avatar_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<String, AppError> {
    let db_guard = db.lock_or_err("DB")?;
    conversation::start_or_resume(&db_guard, &avatar_id)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn send_message(
    conversation_id: String,
    avatar_id: String,
    message: String,
    hidden: Option<bool>,
    action_feedback: Option<String>,
    max_output_tokens: Option<u32>,
    db: State<'_, CacheDbHandle>,
    cloud: State<'_, CloudConfigHandle>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    // Validate message
    let message = message.trim().to_string();
    if message.is_empty() {
        return Err(AppError::Validation("Message cannot be empty".into()));
    }
    if message.len() > 10_000 {
        return Err(AppError::Validation(
            "Message exceeds maximum length of 10,000 characters".into(),
        ));
    }

    let skip_user_persist = hidden.unwrap_or(false);

    // Check daily limit
    {
        let mut config = cloud.lock_or_err("CloudConfig")?;
        config.maybe_reset_daily();
        if !config.can_request() {
            return Err(AppError::StoreApi("Daily AI request limit reached".into()));
        }
    }

    let settings = settings_store::load_settings(&app_handle)?;
    let key = encryption::load_encryption_key()?;

    conversation::send_message_and_stream(
        &db,
        &conversation_id,
        &avatar_id,
        &message,
        &app_handle,
        &key,
        &settings,
        skip_user_persist,
        action_feedback.as_deref(),
        max_output_tokens,
    )
    .await?;

    // Record usage
    {
        let mut config = cloud.lock_or_err("CloudConfig")?;
        config.record_request();
    }

    // Reset inactivity timer only for real user messages — hidden messages
    // (auto-greetings, system prompts) should not start/reset the timer.
    if !skip_user_persist {
        if let Some(timer) = app_handle.try_state::<ConversationTimerHandle>() {
            let _ = conversation_timer::reset_timer(&timer);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn abandon_conversation(
    conversation_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    let db_guard = db.lock_or_err("DB")?;
    db_guard.abandon_conversation(&conversation_id)
}

#[tauri::command]
pub fn check_conversation_stale(
    conversation_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<bool, AppError> {
    let db_guard = db.lock_or_err("DB")?;
    if db_guard.has_user_messages(&conversation_id)? {
        return Ok(false);
    }
    let started_at = db_guard.get_conversation_started_at(&conversation_id)?;
    let started = chrono::NaiveDateTime::parse_from_str(&started_at, "%Y-%m-%d %H:%M:%S")
        .map_err(|e| AppError::Parse(format!("Invalid conversation timestamp: {}", e)))?;
    let age = chrono::Utc::now()
        .naive_utc()
        .signed_duration_since(started);
    Ok(age.num_hours() >= 24)
}

#[tauri::command]
pub async fn end_conversation(
    conversation_id: String,
    avatar_id: String,
    db: State<'_, CacheDbHandle>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    // Stop inactivity timer before ending conversation (safe: try_state returns None in tests)
    if let Some(timer) = app_handle.try_state::<ConversationTimerHandle>() {
        let _ = conversation_timer::stop_timer(&timer);
    }

    let settings = settings_store::load_settings(&app_handle)?;
    let key = encryption::load_encryption_key()?;

    conversation::end_conversation(&db, &conversation_id, &avatar_id, &key, &settings).await?;

    // Note: compaction is an internal system operation — intentionally not counted
    // against the daily request limit or rate limiter to avoid blocking the
    // auto-greeting that fires immediately when the next conversation starts.

    // Notify all windows that this conversation has ended
    let payload = ConversationEndedPayload {
        conversation_id: conversation_id.clone(),
        reason: "manual".to_string(),
    };
    let _ = app_handle.emit("ai-conversation-ended", &payload);

    Ok(())
}

#[tauri::command]
pub fn get_conversation_history(
    conversation_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<AiMessage>, AppError> {
    let key = encryption::load_encryption_key()?;
    let db_guard = db.lock_or_err("DB")?;
    let rows = db_guard.get_ai_messages_raw(&conversation_id)?;
    let mut messages = Vec::with_capacity(rows.len());
    for row in rows {
        let content = encryption::decrypt_field(&row.content, &key)?;
        messages.push(AiMessage {
            id: row.id,
            conversation_id: row.conversation_id,
            role: row.role,
            content,
            created_at: row.created_at,
            token_estimate: row.token_estimate,
        });
    }
    Ok(messages)
}

#[tauri::command]
pub async fn retry_compaction(
    conversation_id: String,
    avatar_id: String,
    db: State<'_, CacheDbHandle>,
    cloud: State<'_, CloudConfigHandle>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    // Verify conversation still has messages (compaction hasn't already completed)
    {
        let db_guard = db.lock_or_err("DB")?;
        let msgs = db_guard.get_ai_messages_raw(&conversation_id)?;
        if msgs.is_empty() {
            return Err(AppError::Validation(
                "Conversation has no messages — compaction may have already completed".into(),
            ));
        }
    }

    let settings = settings_store::load_settings(&app_handle)?;
    let key = encryption::load_encryption_key()?;

    let compacted =
        conversation::end_conversation(&db, &conversation_id, &avatar_id, &key, &settings).await?;

    if compacted {
        let mut config = cloud.lock_or_err("CloudConfig")?;
        config.record_request();
    }

    Ok(())
}

#[tauri::command]
pub fn get_memory_context(
    avatar_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<String, AppError> {
    let key = encryption::load_encryption_key()?;
    let db_guard = db.lock_or_err("DB")?;
    let system_mems = memory::load_system_memories(&db_guard, &avatar_id, &key)?;
    let vault_mems = memory::load_vault_memories(&db_guard, &avatar_id, &key, 50)?;
    let cross_mems = memory::load_cross_avatar_memories(&db_guard, &avatar_id, &key, 20)?;
    let journal = memory::load_recent_journal(&db_guard, &avatar_id, &key, 7)?;
    Ok(memory::format_memory_context(
        &system_mems,
        &vault_mems,
        &cross_mems,
        &journal,
    ))
}

#[tauri::command]
pub fn check_post_session_review(
    game_id: String,
    duration_minutes: u32,
    db: State<'_, CacheDbHandle>,
    app_handle: tauri::AppHandle,
) -> Result<bool, AppError> {
    // 1. Check setting
    let settings = settings_store::load_settings(&app_handle)?;
    if !settings.ai_post_session_review_enabled {
        return Ok(false);
    }
    // 2. Check duration
    if duration_minutes < 30 {
        return Ok(false);
    }
    // 3. Check game has no existing review + active avatar (single lock scope)
    {
        let db_guard = db.lock_or_err("DB")?;
        if db_guard.get_game_rating(&game_id)?.is_some() {
            return Ok(false); // Already rated
        }
        if db_guard.get_active_ai_avatar()?.is_none() {
            return Ok(false);
        }
    }
    let has_key = credential_store::load_cloud_key(&settings.cloud_ai_provider)?;
    if has_key.is_none() {
        return Ok(false);
    }
    Ok(true)
}

// ── Nuclear Wipe ────────────────────────────────────────────────────

#[tauri::command]
pub fn wipe_ai_memory(db: State<'_, CacheDbHandle>) -> Result<(), AppError> {
    // Load key BEFORE lock (keyring I/O)
    let key = encryption::load_encryption_key().ok();

    let db_guard = db.lock_or_err("DB")?;
    db_guard.wipe_ai_data()?;
    // Re-seed system memories for the active avatar if one exists
    if let Some(avatar) = db_guard.get_active_ai_avatar()? {
        if let Some(key) = &key {
            memory::seed_system_memories(&db_guard, &avatar.id, &avatar.name, key)?;
        }
    }
    Ok(())
}

// ── Conversation Timer Commands ─────────────────────────────────────

#[tauri::command]
pub fn start_conversation_timer(
    conversation_id: String,
    avatar_id: String,
    timer: State<'_, ConversationTimerHandle>,
    db: State<'_, CacheDbHandle>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    // Check if auto-end is enabled in settings
    let settings = settings_store::load_settings(&app_handle)?;
    if !settings.ai_conversation_auto_end_enabled {
        return Ok(());
    }

    conversation_timer::start_timer(&timer, &conversation_id, &avatar_id, &app_handle, &db)
}

#[tauri::command]
pub fn stop_conversation_timer(timer: State<'_, ConversationTimerHandle>) -> Result<(), AppError> {
    conversation_timer::stop_timer(&timer)
}

#[tauri::command]
pub fn reset_conversation_timer(timer: State<'_, ConversationTimerHandle>) -> Result<(), AppError> {
    conversation_timer::reset_timer(&timer)
}

#[tauri::command]
pub fn get_conversation_timer_state(
    timer: State<'_, ConversationTimerHandle>,
) -> Result<Option<TimerTickPayload>, AppError> {
    conversation_timer::get_timer_state(&timer)
}

// ── Error Recovery Commands (Phase 10) ──────────────────────────────

#[tauri::command]
pub fn check_orphaned_conversations(
    avatar_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<String>, AppError> {
    let db_guard = db.lock_or_err("DB")?;
    conversation::check_orphaned_conversations(&db_guard, &avatar_id)
}

#[tauri::command]
pub fn get_compaction_pending_conversations(
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<(String, String)>, AppError> {
    let db_guard = db.lock_or_err("DB")?;
    db_guard.get_pending_compaction_conversations()
}

#[tauri::command]
pub fn get_compaction_raw_data(
    conversation_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<String, AppError> {
    let key = encryption::load_encryption_key()?;

    let db_guard = db.lock_or_err("DB")?;
    let (avatar_id, raw_msgs) = db_guard.get_compaction_conversation_data(&conversation_id)?;

    // Build the vault context (same as end_conversation uses)
    let vault_mems = memory::load_vault_memories(&db_guard, &avatar_id, &key, 100)?;
    drop(db_guard); // Release lock before formatting

    // Decrypt messages
    let mut decrypted_msgs = Vec::with_capacity(raw_msgs.len());
    for row in &raw_msgs {
        let content = encryption::decrypt_field(&row.content, &key)?;
        decrypted_msgs.push(AiMessage {
            id: row.id.clone(),
            conversation_id: row.conversation_id.clone(),
            role: row.role.clone(),
            content,
            created_at: row.created_at.clone(),
            token_estimate: row.token_estimate,
        });
    }

    // Format as compaction prompt + transcript
    let vault_context = conversation::format_vault_for_compaction_public(&vault_mems);
    let compaction_prompt = conversation::build_compaction_prompt_public(&vault_context);
    let transcript = conversation::format_transcript_public(&decrypted_msgs);

    Ok(format!(
        "=== SYSTEM PROMPT ===\n{}\n\n=== CONVERSATION ===\n{}",
        compaction_prompt, transcript
    ))
}

#[tauri::command]
pub fn apply_external_compaction(
    conversation_id: String,
    avatar_id: String,
    json_data: String,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    // Parse and validate the JSON
    let result: CompactionResult = serde_json::from_str(json_data.trim()).map_err(|e| {
        AppError::Validation(format!(
            "Invalid compaction JSON: {}. Expected format: {{\"summary\": \"...\", \"memories\": [...], \"supersededMemories\": [...]}}",
            e
        ))
    })?;

    // Validate structural constraints
    if result.summary.is_empty() {
        return Err(AppError::Validation("Summary cannot be empty".into()));
    }
    if result.memories.len() > 10 {
        return Err(AppError::Validation(
            "Too many memories (max 10 per conversation)".into(),
        ));
    }
    const VALID_CATEGORIES: &[&str] = &["preference", "opinion", "fact", "general"];
    for mem in &result.memories {
        if mem.content.is_empty() {
            return Err(AppError::Validation(
                "Memory content cannot be empty".into(),
            ));
        }
        if mem.importance < 1 || mem.importance > 10 {
            return Err(AppError::Validation(
                "Memory importance must be between 1 and 10".into(),
            ));
        }
        if !VALID_CATEGORIES.contains(&mem.category.as_str()) {
            return Err(AppError::Validation(format!(
                "Invalid category '{}'. Must be one of: preference, opinion, fact, general",
                mem.category
            )));
        }
    }

    // Verify conversation belongs to the specified avatar and is pending compaction
    {
        let db_guard = db.lock_or_err("DB")?;
        let (conv_avatar_id, _) = db_guard.get_compaction_conversation_data(&conversation_id)?;
        if conv_avatar_id != avatar_id {
            return Err(AppError::Validation(
                "Avatar ID does not match conversation".into(),
            ));
        }
    }

    let key = encryption::load_encryption_key()?;

    // Encrypt for storage (same as end_conversation)
    let summary_enc = encryption::encrypt_field(&result.summary, &key)?;
    let journal_enc = encryption::encrypt_field(&result.summary, &key)?;
    let memories: Vec<(String, u32, String)> = result
        .memories
        .iter()
        .map(|mem| {
            encryption::encrypt_field(&mem.content, &key)
                .map(|enc| (enc, mem.importance, mem.category.clone()))
        })
        .collect::<Result<Vec<_>, _>>()?;

    let db_guard = db.lock_or_err("DB")?;
    db_guard.complete_compaction(
        &conversation_id,
        &avatar_id,
        &summary_enc,
        &journal_enc,
        &memories,
        &result.superseded_memories,
    )?;

    // Prune vault (same as end_conversation)
    memory::prune_vault_if_needed(&db_guard, &avatar_id)?;

    tracing::info!(
        conversation_id = conversation_id.as_str(),
        memories_count = memories.len(),
        "External compaction applied successfully"
    );
    Ok(())
}
