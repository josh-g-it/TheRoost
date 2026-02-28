use std::sync::{Arc, Mutex};

use tauri::Emitter;

use crate::services::ai::conversation;
use crate::services::ai::encryption;
use crate::services::cache_db::CacheDbHandle;
use crate::services::settings_store;
use crate::utils::error::{AppError, MutexExt};

const DEFAULT_TIMEOUT_SECONDS: u64 = 3600;
/// Emit a tick event to the frontend every N seconds (avoids event spam).
const TICK_EMIT_INTERVAL: u64 = 10;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerTickPayload {
    pub remaining_seconds: u64,
    pub is_paused: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoEndedPayload {
    pub conversation_id: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationEndedPayload {
    pub conversation_id: String,
    pub reason: String, // "manual" | "timer"
}

pub struct ConversationTimerState {
    pub conversation_id: Option<String>,
    pub avatar_id: Option<String>,
    pub remaining_seconds: u64,
    pub is_paused: bool,
    cancel_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

impl Default for ConversationTimerState {
    fn default() -> Self {
        Self {
            conversation_id: None,
            avatar_id: None,
            remaining_seconds: DEFAULT_TIMEOUT_SECONDS,
            is_paused: false,
            cancel_tx: None,
        }
    }
}

pub type ConversationTimerHandle = Arc<Mutex<ConversationTimerState>>;

/// Start (or restart) the conversation inactivity timer.
/// Cancels any existing timer, then spawns a new tokio background task.
pub fn start_timer(
    timer: &ConversationTimerHandle,
    conversation_id: &str,
    avatar_id: &str,
    app_handle: &tauri::AppHandle,
    db: &CacheDbHandle,
) -> Result<(), AppError> {
    let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel::<()>();

    {
        let mut state = timer.lock_or_err("ConversationTimer")?;

        // Cancel any existing timer task
        if let Some(tx) = state.cancel_tx.take() {
            let _ = tx.send(());
        }

        state.conversation_id = Some(conversation_id.to_string());
        state.avatar_id = Some(avatar_id.to_string());
        state.remaining_seconds = DEFAULT_TIMEOUT_SECONDS;
        state.is_paused = true;
        state.cancel_tx = Some(cancel_tx);
    }

    let timer_clone = Arc::clone(timer);
    let conv_id = conversation_id.to_string();
    let av_id = avatar_id.to_string();
    let app = app_handle.clone();
    let db_clone = Arc::clone(db);

    tauri::async_runtime::spawn(async move {
        timer_loop(timer_clone, conv_id, av_id, app, db_clone, cancel_rx).await;
    });

    Ok(())
}

/// Background timer loop. Ticks every second, emits events periodically,
/// pauses when games are active, and auto-ends the conversation on expiry.
async fn timer_loop(
    timer: ConversationTimerHandle,
    conversation_id: String,
    avatar_id: String,
    app_handle: tauri::AppHandle,
    db: CacheDbHandle,
    mut cancel_rx: tokio::sync::oneshot::Receiver<()>,
) {
    let mut tick_counter: u64 = 0;

    loop {
        tokio::select! {
            _ = tokio::time::sleep(std::time::Duration::from_secs(1)) => {},
            _ = &mut cancel_rx => {
                tracing::debug!("Conversation timer cancelled");
                return;
            }
        }

        tick_counter += 1;

        // Read and update state under a short lock
        let (remaining, is_paused, should_emit, expired) = {
            let mut state = match timer.lock() {
                Ok(s) => s,
                Err(_) => {
                    tracing::warn!("Conversation timer lock poisoned, stopping timer");
                    return;
                }
            };

            // Only decrement if not paused
            if !state.is_paused && state.remaining_seconds > 0 {
                state.remaining_seconds -= 1;
            }

            let remaining = state.remaining_seconds;
            let is_paused = state.is_paused;
            let expired = remaining == 0 && !is_paused;

            // Emit on first tick, every TICK_EMIT_INTERVAL ticks, and on expiry
            let should_emit =
                tick_counter == 1 || tick_counter.is_multiple_of(TICK_EMIT_INTERVAL) || expired;

            (remaining, is_paused, should_emit, expired)
        }; // Lock dropped here

        // Emit tick event outside of lock
        if should_emit {
            let payload = TimerTickPayload {
                remaining_seconds: remaining,
                is_paused,
            };
            let _ = app_handle.emit("conversation-timer-tick", &payload);
        }

        if expired {
            tracing::info!(
                conversation_id = %conversation_id,
                "Conversation inactivity timer expired, auto-ending"
            );

            // Attempt auto-end
            let auto_end_succeeded =
                auto_end_conversation(&db, &conversation_id, &avatar_id, &app_handle)
                    .await
                    .is_ok();
            if !auto_end_succeeded {
                tracing::warn!(
                    conversation_id = %conversation_id,
                    "Failed to auto-end conversation on timer expiry"
                );
            }

            // Always emit auto-ended so timer UI clears
            let auto_payload = AutoEndedPayload {
                conversation_id: conversation_id.clone(),
            };
            let _ = app_handle.emit("conversation-auto-ended", &auto_payload);

            // Only emit conversation-ended if the conversation was actually ended in DB
            if auto_end_succeeded {
                let ended_payload = ConversationEndedPayload {
                    conversation_id: conversation_id.clone(),
                    reason: "timer".to_string(),
                };
                let _ = app_handle.emit("ai-conversation-ended", &ended_payload);
            }

            // Clear timer state
            if let Ok(mut state) = timer.lock() {
                state.conversation_id = None;
                state.avatar_id = None;
                state.remaining_seconds = DEFAULT_TIMEOUT_SECONDS;
                state.is_paused = false;
                state.cancel_tx = None;
            }

            return;
        }
    }
}

/// Auto-end a conversation when the inactivity timer expires.
/// Loads settings and encryption key, then delegates to conversation::end_conversation.
async fn auto_end_conversation(
    db: &CacheDbHandle,
    conversation_id: &str,
    avatar_id: &str,
    app_handle: &tauri::AppHandle,
) -> Result<(), AppError> {
    let settings = settings_store::load_settings(app_handle)?;
    let key = encryption::load_encryption_key()?;

    // end_conversation returns whether compaction happened (we don't need to track usage here
    // since compaction requests are already tracked inside end_conversation via the cloud config)
    let _compacted =
        conversation::end_conversation(db, conversation_id, avatar_id, &key, &settings).await?;

    Ok(())
}

/// Reset the timer back to the default timeout and unpause it (called when user sends a message).
pub fn reset_timer(timer: &ConversationTimerHandle) -> Result<(), AppError> {
    let mut state = timer.lock_or_err("ConversationTimer")?;
    if state.conversation_id.is_some() {
        state.remaining_seconds = DEFAULT_TIMEOUT_SECONDS;
        state.is_paused = false;
    }
    Ok(())
}

/// Pause the timer (called when a game session starts).
pub fn pause_timer(timer: &ConversationTimerHandle) -> Result<(), AppError> {
    let mut state = timer.lock_or_err("ConversationTimer")?;
    if state.conversation_id.is_some() && !state.is_paused {
        state.is_paused = true;
    }
    Ok(())
}

/// Resume the timer and reset to default timeout (called when all game sessions end).
pub fn resume_timer(timer: &ConversationTimerHandle) -> Result<(), AppError> {
    let mut state = timer.lock_or_err("ConversationTimer")?;
    if state.conversation_id.is_some() && state.is_paused {
        state.is_paused = false;
        state.remaining_seconds = DEFAULT_TIMEOUT_SECONDS;
    }
    Ok(())
}

/// Stop the timer entirely (called when the user manually ends a conversation).
pub fn stop_timer(timer: &ConversationTimerHandle) -> Result<(), AppError> {
    let mut state = timer.lock_or_err("ConversationTimer")?;
    if let Some(tx) = state.cancel_tx.take() {
        let _ = tx.send(());
    }
    state.conversation_id = None;
    state.avatar_id = None;
    state.remaining_seconds = DEFAULT_TIMEOUT_SECONDS;
    state.is_paused = false;
    Ok(())
}

/// Get the current timer state, or None if no timer is active.
pub fn get_timer_state(
    timer: &ConversationTimerHandle,
) -> Result<Option<TimerTickPayload>, AppError> {
    let state = timer.lock_or_err("ConversationTimer")?;
    if state.conversation_id.is_some() {
        Ok(Some(TimerTickPayload {
            remaining_seconds: state.remaining_seconds,
            is_paused: state.is_paused,
        }))
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_timer() -> ConversationTimerHandle {
        Arc::new(Mutex::new(ConversationTimerState::default()))
    }

    fn make_active_timer() -> ConversationTimerHandle {
        let timer = make_timer();
        {
            let mut state = timer.lock().unwrap();
            state.conversation_id = Some("conv-1".to_string());
            state.avatar_id = Some("avatar-1".to_string());
            state.remaining_seconds = DEFAULT_TIMEOUT_SECONDS;
        }
        timer
    }

    #[test]
    fn default_state_has_correct_values() {
        let state = ConversationTimerState::default();
        assert!(state.conversation_id.is_none());
        assert!(state.avatar_id.is_none());
        assert_eq!(state.remaining_seconds, DEFAULT_TIMEOUT_SECONDS);
        assert!(!state.is_paused);
        assert!(state.cancel_tx.is_none());
    }

    #[test]
    fn reset_timer_resets_remaining_and_unpauses() {
        let timer = make_active_timer();
        {
            let mut state = timer.lock().unwrap();
            state.remaining_seconds = 100;
            state.is_paused = true;
        }
        reset_timer(&timer).unwrap();
        let state = timer.lock().unwrap();
        assert_eq!(state.remaining_seconds, DEFAULT_TIMEOUT_SECONDS);
        assert!(!state.is_paused);
    }

    #[test]
    fn reset_timer_unpauses_initial_paused_state() {
        let timer = make_active_timer();
        {
            let mut state = timer.lock().unwrap();
            // Simulate start_timer's initial paused state
            state.is_paused = true;
        }
        reset_timer(&timer).unwrap();
        let state = timer.lock().unwrap();
        assert!(!state.is_paused);
        assert_eq!(state.remaining_seconds, DEFAULT_TIMEOUT_SECONDS);
    }

    #[test]
    fn reset_timer_noop_when_no_conversation() {
        let timer = make_timer();
        {
            let mut state = timer.lock().unwrap();
            state.remaining_seconds = 500;
            state.is_paused = true;
        }
        reset_timer(&timer).unwrap();
        let state = timer.lock().unwrap();
        // Should not have changed since there's no active conversation
        assert_eq!(state.remaining_seconds, 500);
        assert!(state.is_paused);
    }

    #[test]
    fn pause_timer_sets_is_paused() {
        let timer = make_active_timer();
        pause_timer(&timer).unwrap();
        let state = timer.lock().unwrap();
        assert!(state.is_paused);
    }

    #[test]
    fn pause_timer_noop_when_no_conversation() {
        let timer = make_timer();
        pause_timer(&timer).unwrap();
        let state = timer.lock().unwrap();
        assert!(!state.is_paused);
    }

    #[test]
    fn pause_timer_noop_when_already_paused() {
        let timer = make_active_timer();
        {
            let mut state = timer.lock().unwrap();
            state.is_paused = true;
        }
        pause_timer(&timer).unwrap();
        let state = timer.lock().unwrap();
        assert!(state.is_paused);
    }

    #[test]
    fn resume_timer_sets_is_paused_false_and_resets_remaining() {
        let timer = make_active_timer();
        {
            let mut state = timer.lock().unwrap();
            state.is_paused = true;
            state.remaining_seconds = 100;
        }
        resume_timer(&timer).unwrap();
        let state = timer.lock().unwrap();
        assert!(!state.is_paused);
        assert_eq!(state.remaining_seconds, DEFAULT_TIMEOUT_SECONDS);
    }

    #[test]
    fn resume_timer_noop_when_not_paused() {
        let timer = make_active_timer();
        {
            let mut state = timer.lock().unwrap();
            state.remaining_seconds = 100;
        }
        resume_timer(&timer).unwrap();
        let state = timer.lock().unwrap();
        // Should not reset since it was not paused
        assert_eq!(state.remaining_seconds, 100);
        assert!(!state.is_paused);
    }

    #[test]
    fn stop_timer_clears_all_fields() {
        let timer = make_active_timer();
        {
            let mut state = timer.lock().unwrap();
            state.is_paused = true;
            state.remaining_seconds = 500;
        }
        stop_timer(&timer).unwrap();
        let state = timer.lock().unwrap();
        assert!(state.conversation_id.is_none());
        assert!(state.avatar_id.is_none());
        assert_eq!(state.remaining_seconds, DEFAULT_TIMEOUT_SECONDS);
        assert!(!state.is_paused);
        assert!(state.cancel_tx.is_none());
    }

    #[test]
    fn stop_timer_noop_when_no_timer() {
        let timer = make_timer();
        stop_timer(&timer).unwrap();
        let state = timer.lock().unwrap();
        assert!(state.conversation_id.is_none());
        assert!(state.avatar_id.is_none());
    }

    #[test]
    fn get_timer_state_returns_some_when_active() {
        let timer = make_active_timer();
        let result = get_timer_state(&timer).unwrap();
        assert!(result.is_some());
        let payload = result.unwrap();
        assert_eq!(payload.remaining_seconds, DEFAULT_TIMEOUT_SECONDS);
        assert!(!payload.is_paused);
    }

    #[test]
    fn get_timer_state_returns_none_when_inactive() {
        let timer = make_timer();
        let result = get_timer_state(&timer).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn resume_timer_noop_when_no_conversation() {
        let timer = make_timer();
        {
            let mut state = timer.lock().unwrap();
            state.is_paused = true;
            state.remaining_seconds = 100;
        }
        resume_timer(&timer).unwrap();
        let state = timer.lock().unwrap();
        // Should not change since there's no active conversation
        assert!(state.is_paused);
        assert_eq!(state.remaining_seconds, 100);
    }

    #[test]
    fn pause_timer_preserves_remaining_when_already_paused() {
        let timer = make_active_timer();
        {
            let mut state = timer.lock().unwrap();
            state.is_paused = true;
            state.remaining_seconds = 500;
        }
        pause_timer(&timer).unwrap();
        let state = timer.lock().unwrap();
        assert!(state.is_paused);
        assert_eq!(state.remaining_seconds, 500);
    }

    #[test]
    fn conversation_ended_payload_serializes_to_camel_case() {
        let payload = ConversationEndedPayload {
            conversation_id: "conv-123".to_string(),
            reason: "manual".to_string(),
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"conversationId\""));
        assert!(json.contains("\"reason\""));
        assert!(!json.contains("\"conversation_id\""));
    }

    #[test]
    fn auto_ended_payload_serializes_to_camel_case() {
        let payload = AutoEndedPayload {
            conversation_id: "conv-123".to_string(),
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"conversationId\""));
        assert!(!json.contains("\"conversation_id\""));
    }
}
