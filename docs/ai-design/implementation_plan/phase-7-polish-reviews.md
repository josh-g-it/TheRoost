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

### 3. `src-tauri/src/services/process_monitor.rs` — Post-Session Review Trigger

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
| `src-tauri/src/lib.rs` | Modified (register notification plugin) |
| `src-tauri/src/services/process_monitor.rs` | Modified (add post-session review trigger) |
| Settings component (SettingsView.tsx or AI tab) | Modified (add review toggle, encryption, wipe) |
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

### 4. Active Game Session Context

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
