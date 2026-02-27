# Phase 7: Post-Session Reviews + Settings + Polish

> Final integration phase. Wires the conversation system into the rest of the app: toast notifications, review saving, settings UI, error recovery, and crash recovery. No new architectural concepts — everything connects to what already exists.

**Dependencies**: Phases 1-6 all complete
**Design docs**: [11-post-session-review.md](../11-post-session-review.md), [08-error-handling.md](../08-error-handling.md)

---

## Goal

Complete the feature by connecting the AI assistant to the process monitor (post-session reviews), the settings UI (new toggles), and the error recovery flows (orphan conversations, compaction retry, clipboard failsafe).

---

## Rust Changes

### 1. `src-tauri/Cargo.toml` — Notification Plugin

Add (if not already done in Phase 1):
```toml
[dependencies]
tauri-plugin-notification = "2"
```

### 2. `src-tauri/src/lib.rs` — Plugin Registration

```rust
.plugin(tauri_plugin_notification::init())
```

### 3. Backend Conversation Inactivity Timer

The 1-hour inactivity timeout currently lives in a frontend React hook (`useInactivityTimer`). This is wrong — it must run in the Rust backend so it works even when the user isn't on the chat page, has the main window minimized, or is on a different route.

**Architecture**:
- New service: `src-tauri/src/services/ai/conversation_timer.rs`
- Manages a per-conversation inactivity timer using `tokio::time::sleep` in a background task
- State: `Arc<Mutex<ConversationTimerState>>` registered as Tauri managed state
  - `conversation_id: Option<String>`
  - `avatar_id: Option<String>`
  - `remaining_seconds: u64`
  - `is_paused: bool` (paused during game sessions)
  - `cancel_handle: Option<tokio::task::JoinHandle<()>>`

**Timer lifecycle**:
- `start_timer(conv_id, avatar_id)` — spawns a tokio task that ticks every second
- `reset_timer()` — called when user sends a message (resets to 3600s)
- `pause_timer()` / `resume_timer()` — called by process monitor on session start/end
- `stop_timer()` — called when conversation ends manually
- On expiry: calls `end_conversation` directly (compaction happens in Rust, no frontend needed)

**Frontend changes**:
- `useInactivityTimer` hook becomes a **display-only** subscriber — listens for `"conversation-timer-tick"` Tauri events to show remaining time in the UI
- The hook no longer owns the countdown logic, just reflects backend state
- If the user isn't on the chat page, no events are consumed (no wasted work)

**Integration with process monitor**:
- Process monitor already emits `"session-update"` events — the conversation timer subscribes to these directly in Rust (no frontend round-trip needed for pause/resume)

**Emitted events** (for frontend display):
```rust
// Emitted every ~10 seconds (not every second — avoid event spam)
app_handle.emit("conversation-timer-tick", TimerTickPayload {
    remaining_seconds: u64,
    is_paused: bool,
});

// Emitted once when timer expires and compaction starts
app_handle.emit("conversation-auto-ended", AutoEndedPayload {
    conversation_id: String,
});
```

**Settings toggle** (in AI Assistant Settings):
```
Conversation Auto-End
  [Toggle] Automatically end conversations after 1 hour of inactivity  [ON/OFF]
  When enabled, inactive conversations are saved and ended after 1 hour.
  The timer pauses while you're playing a game.
```

Default: ON. When disabled, conversations stay open indefinitely until the user manually ends them.

### 4. `src-tauri/src/services/process_monitor.rs` — Post-Session Review Trigger

After the existing `session-update` event with type `"ended"` is emitted:

```rust
// Spawn as a background task — NEVER block the scan cycle
let app = app_handle.clone();
let game_id = game_id.clone();
tokio::spawn(async move {
    // Check all 4 conditions
    if should_notify(&app, &game_id, duration_minutes) {
        // Check throttle: max 1 notification per hour
        if !is_throttled() {
            send_review_notification(&app, &game_name, duration_minutes);
            record_notification_time();
        }
    }
});
```

**Notification details** (from `11-post-session-review.md`):
```
Title: "The Roost"
Body: "You just played {GameName} for {duration}! Want to leave a quick review?"
Action: "Open Assistant"
Auto-dismiss: 30 seconds
```

**On toast click** → emit Tauri event to frontend:
```rust
app_handle.emit("post-session-review", PostSessionReviewPayload {
    game_id: game_id.clone(),
    game_name: game_name.clone(),
    duration_minutes,
});
```

**Throttle**: Store last notification timestamp in `CloudConfig` or a simple `Arc<Mutex<Option<Instant>>>`. Reject if < 1 hour since last notification.

---

## Frontend Changes

### 1. Settings Tab — AI Assistant Section

Add to the Cloud AI settings tab (or create a dedicated "Assistant" tab):

```
AI Assistant Settings
─────────────────────

Post-Session Reviews
  [Toggle] Ask me to review games after playing     [ON/OFF]
  Only triggers for sessions over 30 minutes and
  games you haven't reviewed yet.

AI Memory Encryption
  Your encryption key is stored in Windows Credential Manager.
  [Enter Key] ← for migration to new machine
  (Input field, only shown when key is missing or user clicks "Change Key")

Danger Zone
  [Wipe All AI Memory]
  Permanently delete all AI memories, journals, and conversation
  history for ALL avatars. This cannot be undone.
  (Double-confirm: first dialog + type DELETE confirmation)

### 5. Avatar Management — Delete Avatar

Add a delete button to each avatar card in `AssistantAvatars.tsx` (except the currently active avatar — you must switch away before deleting).

**Flow**:
1. User clicks [Delete] on an avatar card
2. Confirmation dialog: "Delete {avatar.name}? All conversations, memories, and journal entries for this avatar will be permanently deleted. This cannot be undone."
3. On confirm: call `delete_avatar(avatarId)` command
4. Backend cascades: `DELETE FROM ai_avatars WHERE id = ?` → FK cascades remove `ai_conversations` → `ai_messages`, plus explicit delete of `ai_memories` and `ai_daily_log` for that avatar
5. Frontend refreshes avatar list

**Rust changes needed**:
- New `delete_avatar(avatar_id)` Tauri command in `commands/ai.rs`
- New `delete_ai_avatar(avatar_id)` method in `cache_db.rs` — hard delete with explicit cleanup of `ai_memories` and `ai_daily_log` (FK cascade handles conversations/messages)
- Guard: cannot delete the currently active avatar (return error)
- Guard: must have at least 1 avatar remaining (return error)

### 6. Per-Avatar Memory/Data Wipe (Without Deletion)

Add a "Clear all data for this avatar" option in the avatar detail view. This wipes all memories, journals, and conversations for a specific avatar without deleting the avatar itself.

**Flow**:
1. User clicks [Clear Data] on an avatar
2. Confirmation dialog: "Clear all data for {avatar.name}? This will delete all memories, journal entries, and conversation history for this avatar. The avatar itself will be kept. This cannot be undone."
3. On confirm: call `wipe_avatar_data(avatarId)` command
4. Backend: delete from `ai_messages`, `ai_daily_log`, `ai_memories`, `ai_conversations` WHERE avatar_id matches (or via conversation FK)
5. Re-seed system memories for the avatar

**Rust changes needed**:
- New `wipe_avatar_data(avatar_id)` Tauri command
- New `wipe_avatar_data(avatar_id)` method in `cache_db.rs` — transactional delete + re-seed
```

### 2. `src/components/assistant/AssistantView.tsx` — Error Recovery UI

**Orphan Recovery Banner** (shown on mount when orphaned conversation detected):

```
┌──────────────────────────────────────────────────────┐
│  Welcome back! We were in the middle of a conversation.│
│                                        [Resume] [New] │
└──────────────────────────────────────────────────────┘
```

- On startup: call backend to check for orphaned conversations
- [Resume]: load the orphaned conversation's messages, continue
- [New]: end the orphaned conversation (trigger compaction), start fresh

**Compaction Retry Banner** (shown when conversation has `compacted=0` + `ended_at IS NOT NULL`):

```
┌──────────────────────────────────────────────────────────┐
│  A previous conversation needs to be processed.           │
│            [Compact Now] [Copy Raw Data] [Paste Response] │
└──────────────────────────────────────────────────────────┘
```

- [Compact Now]: call `retryCompaction(convId)` → retry the Gemini compaction call
- [Copy Raw Data]: copies the full compaction request (system prompt + all messages) to clipboard as raw text. User can paste into any external AI to generate the compaction JSON.
- [Paste Response]: accepts pasted JSON, validates it has `summary`/`memories`/`superseded_memories` structure, processes it as if the built-in AI produced it.

### 3. Post-Session Review Flow

**Frontend listener** (in `AssistantView.tsx` or `App.tsx`):

```typescript
listen<PostSessionReviewPayload>('post-session-review', async (event) => {
  const { gameId, gameName, durationMinutes } = event.payload;

  // Double-check review doesn't already exist (race condition guard)
  // Navigate to /assistant
  // Check for active conversation, start new if needed
  // Insert a normal assistant message:
  //   "You just finished playing {gameName}! What did you think of it?
  //    Let me know and I'll write a review for you so I remember!"
  // This message is stored as role: "assistant" — no special flags
});
```

**Review saving** (from `ReviewConfirmation.tsx`):

- [Save Review]: calls existing `ratings.saveGameRating(gameId, stars, reviewText)`
- [Edit]: makes review text editable inline, user modifies, then saves
- [Skip]: dismisses card, continues conversation normally

The AI's system prompt has a standing instruction (from `11-post-session-review.md`) to draft reviews whenever the user shares game opinions, so this works whether toast-triggered or spontaneous.

### 4. App Startup — Orphan Check

In `App.tsx` or the root component, on mount:

```typescript
useEffect(() => {
  // Check for orphaned conversations
  assistantApi.getActiveAvatar().then(avatar => {
    if (avatar) {
      // backend check_orphaned_conversations()
      // Set flag in local state if orphans exist
    }
  });
}, []);
```

---

## Edge Cases (from design doc)

- **User already in conversation when session ends**: Review prompt injected into active conversation
- **User doesn't respond**: No action, message stays in chat, gets compacted normally
- **Multiple sessions in quick succession**: Throttle ensures max 1 toast/hour; queue reviews for next conversation
- **Game reviewed between session end and toast click**: Re-check on click, skip if review now exists
- **Vague response** ("it was fine"): AI follows up naturally before drafting (standing prompt instruction)
- **User declines to review**: AI respects, conversation continues normally

---

## Tests

### Rust Tests

```
check_post_session_review:
- Returns false when ai_post_session_review_enabled = false
- Returns false when duration < 30 minutes
- Returns false when game already has a rating in game_ratings
- Returns false when no active avatar exists
- Returns true when all 4 conditions are met

Throttle:
- Second notification within 1 hour returns false
- Notification after 1 hour returns true

conversation_timer:
- Timer starts and counts down when conversation is active
- Timer pauses on game session start
- Timer resumes and resets on game session end
- Timer resets on user message send
- Timer triggers end_conversation (compaction) on expiry
- Timer does not run when disabled in settings
- Timer stops when conversation is manually ended

delete_avatar:
- Deletes avatar and cascades to conversations/messages/memories/journals
- Returns error when trying to delete active avatar
- Returns error when only 1 avatar exists

wipe_avatar_data:
- Clears all data for specific avatar without deleting the avatar
- Re-seeds system memories after wipe
- Does not affect other avatars' data

abandon_conversation:
- Marks conversation ended without compaction
- Deletes all messages for the conversation
- Does not create memories or journal entries

store_message_pair with skip_user_message:
- When skip_user_message=false, stores both user and assistant messages
- When skip_user_message=true, stores only assistant message
```

### Frontend Tests

```
AssistantView orphan recovery:
- Banner renders when orphan flag is set
- Banner not shown when no orphans
- [Resume] loads orphaned conversation messages
- [New] ends orphaned conversation

Compaction retry:
- Banner renders for pending_compaction state
- [Compact Now] calls retryCompaction
- Banner hidden when compaction succeeds

Post-session review:
- Listener navigates to /assistant on event
- Review prompt message inserted into conversation
- ReviewConfirmation [Save] calls ratings API
- ReviewConfirmation [Skip] dismisses without saving

Avatar deletion:
- Delete button visible on non-active avatars
- Delete button hidden on active avatar
- Confirmation dialog appears on click
- Avatar removed from list after deletion

Stale conversation auto-reset:
- Conversation with no user messages older than 24h triggers abandon + restart
- Conversation with user messages is never auto-reset
- Fresh conversation (< 24h) is not auto-reset
```

### Full Regression

All 758+ tests pass (280 Rust + 478+ frontend).

---

## Verification

```bash
cd src-tauri && /c/Users/joshg/.cargo/bin/cargo.exe test
npx vitest run
npm run tauri dev
# Manual: play a game > 30 min (or mock), verify toast, click Open Assistant,
# respond with review, verify Save/Edit/Skip card, confirm save, check game_ratings
```

---

## Files Changed

| File | Action |
|------|--------|
| `src-tauri/Cargo.toml` | Modified (add tauri-plugin-notification) |
| `src-tauri/src/lib.rs` | Modified (register notification plugin + new commands) |
| `src-tauri/src/services/ai/conversation_timer.rs` | **New** (backend inactivity timer — tokio background task, pause/resume, auto-compaction) |
| `src-tauri/src/services/process_monitor.rs` | Modified (add post-session review trigger + conversation timer pause/resume integration) |
| `src-tauri/src/commands/ai.rs` | Modified (add `delete_avatar`, `wipe_avatar_data`, `abandon_conversation` commands; add `hidden` param to `send_message`) |
| `src-tauri/src/services/ai/conversation.rs` | Modified (pass `hidden` through `send_message_and_stream`) |
| `src-tauri/src/services/cache_db.rs` | Modified (add `delete_ai_avatar`, `wipe_avatar_data`, `abandon_conversation` methods; update `store_message_pair` with `skip_user_message`) |
| `src/services/tauri.ts` | Modified (add `hidden` param to `sendMessage`, add `deleteAvatar`, `wipeAvatarData`, `abandonConversation` API wrappers) |
| `src/components/assistant/AssistantChat.tsx` | Modified (stale conversation check, ephemeral prompt integration) |
| `src/components/assistant/AssistantAvatars.tsx` | Modified (add delete avatar button + confirmation) |
| Settings component (SettingsView.tsx or AI tab) | Modified (add review toggle, auto-end toggle, encryption, wipe, per-avatar wipe) |
| `src/hooks/useInactivityTimer.ts` | Modified (refactored to display-only subscriber of backend timer events) |
| `src/components/assistant/AssistantView.tsx` | Modified (add orphan + compaction banners) |
| `src/App.tsx` | Modified (add startup orphan check, post-session-review listener) |

---

## User Testing Feedback Items

Items identified during Phase 5 user testing, to be addressed in Phase 7:

### 1. End Conversation Button Visibility

The current end conversation button (X icon) is too subtle. Make it more prominent:
- Add label text "End Conversation" alongside the icon, or
- Give the button a distinct background color to differentiate it from other controls

### 2. End Conversation "Journaling" Splash

When a conversation ends, the stale messages remain visible during compaction. Instead:
- Show a "Storing memories..." loading state in the chat area immediately after ending
- Keep the loading state visible while compaction runs in the background
- Once compaction completes, refresh to a blank chat (ready for a new conversation)

### 3. Written Reviews in AI Context

Update `context_builder.rs` to include `review_text` from the `game_ratings` table alongside the star rating when building game context for the AI. Currently only hours played and star rating are included. The AI should know what the user has written about their games, not just the numeric score.

### 4. Ephemeral Greeting Prompt (Hidden Message Fix)

The auto-greeting prompt sent on new conversations must be ephemeral — it should not be persisted in the DB. Currently the hidden prompt is stored as a regular user message and reappears when `loadHistory` fetches from the backend.

**Design**:
- Pass a `hidden: bool` flag through the full message pipeline (frontend API → Rust command → conversation service → `store_message_pair`)
- When `hidden = true`, `store_message_pair` stores ONLY the assistant response, not the user prompt
- The AI still sees the prompt during generation (it's in-context), but it's never written to the DB
- When `loadHistory` is called, only the assistant's greeting response is returned — the system prompt that triggered it is gone

**Changes needed**:
- `src/services/tauri.ts`: Add `hidden?: boolean` parameter to `assistantApi.sendMessage`
- `src-tauri/src/commands/ai.rs`: Add `hidden: Option<bool>` to `send_message` command
- `src-tauri/src/services/ai/conversation.rs`: Pass `hidden` through `send_message_and_stream`
- `src-tauri/src/services/cache_db.rs`: Update `store_message_pair` to accept `skip_user_message: bool` — when true, only insert assistant message
- Frontend hook already handles the local state correctly (`{ hidden: true }` skips adding to local messages)

### 5. Stale Conversation Auto-Reset

If the user never responds to the AI's initial greeting within 24 hours, the conversation is considered stale. On the next visit to the chat interface, silently reset to a fresh conversation.

**Critical constraint: Lazy evaluation only.** The stale check MUST only run when the user actively opens the chat UI (main `/assistant` route or overlay panel). There is NO background polling, no timer-based reset, and no proactive API calls. This ensures:
- Zero wasted API tokens while the user isn't looking at the chat
- The new greeting is fresh to the exact moment they open it
- No unnecessary network calls for users who don't visit the assistant for days/weeks

**Design**:
- On `AssistantChat` mount (triggered by user navigating to chat tab or opening overlay chat panel):
  1. Load conversation history via `loadHistory`
  2. If the only messages are system-initiated (assistant greeting, no user messages) AND the conversation's `started_at` is > 24 hours ago:
     - Call `abandonConversation(convId)` — backend silently discards (no compaction, no memory, no journal)
     - Call `startConversation(avatarId)` — get a fresh conversation ID
     - Proceed to normal `loadAndGreet` flow, which will send a new greeting
  3. If conversation is NOT stale → proceed normally with existing history
- This check runs BEFORE the normal `loadAndGreet` logic, within the same `useEffect`

**Backend support needed**:
- New `abandon_conversation(conversation_id)` command — marks `ended_at = NOW()`, deletes all messages for that conversation, does NOT trigger compaction
- OR extend `end_conversation` with a `skip_compaction: bool` flag
- The key distinction: `end_conversation` triggers compaction (memory + journal extraction); `abandon_conversation` silently discards everything since no meaningful user interaction happened

**Frontend changes**:
- `AssistantChat.tsx`: In the `loadAndGreet` effect, before checking empty history, check staleness first → call abandon + start new if stale
- `useConversation.ts`: `loadHistory` must be refactored so the stale check runs BETWEEN the fetch and the `setMessages` call. The old greeting must never be set into React state — this prevents any visual flash of the stale message. Flow: fetch raw history → stale check (synchronous, just array inspection + date comparison) → if stale, abandon + start new without ever calling `setMessages(oldHistory)` → if not stale, `setMessages(history)` as normal
- `useConversation.ts`: May need a `hasUserMessages(history)` helper
- `AssistantView.tsx`: Must propagate the new `conversationId` from the fresh conversation back to state

### 6. Active Game Session Context

When the user sends a message during an active game session (detected by the process monitor), include contextual information in the system prompt:
- Current game name
- Session start time
- Current session duration

This is particularly important for overlay panel usage, where the user is chatting while actively playing. The AI should be aware of what the user is doing right now, not just their historical play data.

---

## After Phase 7: Version Bump

Bump to 1.12.0 in all three files:
- `src-tauri/tauri.conf.json`
- `package.json`
- `src-tauri/Cargo.toml`

Tag `v1.12.0` to trigger CI release build.
