# Phase 9: UX Polish

> Three targeted frontend-focused improvements to the chat experience: a more prominent End Conversation button, a "journaling" splash screen during compaction, and active game session context in the AI system prompt. Minimal backend work — one small Rust addition, the rest is CSS/JSX/state management.

**Dependencies**: Phases 1-7 complete; Phase 8 (Backend Timer) recommended but not strictly required
**Design docs**: [05-chat-interface.md](../05-chat-interface.md), [03-conversation-lifecycle.md](../03-conversation-lifecycle.md)

---

## Goal

After this phase, (1) the End Conversation button is clearly visible and distinct from other controls, (2) ending a conversation shows a polished "Storing memories..." splash instead of stale messages during compaction, and (3) the AI knows what game the user is actively playing when they send a message — enabling contextual responses especially from the overlay panel.

---

## Rust Changes

### 1. `src-tauri/src/services/cache_db.rs` — New `get_active_game_session_context` Method

Query the `game_sessions` table for the most recent session with no end time, joined with the game name:

```rust
/// Returns the active game session context (game_name, start_time) if a game is currently running.
/// Used by the conversation service to inject "Currently Playing" context into the AI system prompt.
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
```

**Pattern**: Matches the existing `get_active_session` and `get_active_sessions_with_names` methods already in `cache_db.rs`. Returns `Option` so the caller can skip context injection when no game is running.

### 2. `src-tauri/src/services/ai/conversation.rs` — Inject Active Game Context into `assemble_context`

After Layer 3 (memory context) and before Layer 4 (conversation history), append active game session info to the system prompt:

```rust
// After Layer 3: Memory context (existing code)
// ...

// Layer 3.5: Active game session context
if let Ok(Some((game_name, start_time))) = db.get_active_game_session_context() {
    let now = chrono::Utc::now().timestamp();
    let duration_minutes = ((now - start_time) / 60).max(0);

    // Format start time as human-readable
    let start_str = chrono::DateTime::from_timestamp(start_time, 0)
        .map(|dt| dt.format("%H:%M").to_string())
        .unwrap_or_else(|| "unknown".to_string());

    system_prompt.push_str(&format!(
        "\n\n## Current Activity\nThe user is currently playing {}. Session started at {}, {} minutes ago.",
        game_name, start_str, duration_minutes
    ));
}
```

This is appended to the `system_prompt` string — NOT as a separate chat message. The AI sees it as part of its system instructions, enabling contextual responses like "How's your Elden Ring session going?" without the user needing to mention what they're playing.

**Important**: This runs inside the existing `db` lock scope in `assemble_context` (the lock is already held for Layer 1-3), so no additional lock acquisition is needed. The `get_active_game_session_context` call is a single lightweight SQL query.

---

## Frontend Changes

### 1. `src/components/assistant/AssistantChat.tsx` — End Button Redesign

Move the End Conversation button out of the input bar and into a new top bar above the messages area. Give it a distinct danger-styled background with a text label:

```tsx
return (
  <div className={`assistant-chat ${compact ? "assistant-chat--compact" : ""}`}>
    {/* NEW: Top bar with End Conversation button */}
    {conversationId && !hideEndButton && (
      <div className="assistant-chat__top-bar">
        <button
          className="assistant-chat__end-btn"
          onClick={endConversation}
          disabled={isStreaming}
        >
          <AppIcon name="close" size={14} />
          <span>End Conversation</span>
        </button>
      </div>
    )}

    <div className="assistant-chat__messages">
      {/* ...existing messages rendering... */}
    </div>

    {/* ...existing error bar... */}

    <div className="assistant-chat__input-bar">
      {/* Input, mic button, send button — END BUTTON REMOVED FROM HERE */}
    </div>
  </div>
);
```

The `hideEndButton` prop (used by `OverlayAssistant` in compact mode) continues to work — the overlay has its own End button in the "More" dropdown and the standalone End button at the bottom.

**Disable during streaming**: The button is disabled while `isStreaming` is true, preventing the user from ending a conversation mid-response which would lose the in-flight message.

### 2. `src/components/assistant/AssistantChat.css` — End Button Styling

Remove the old `.assistant-chat__end-btn` styles from the shared button group (`.assistant-chat__send-btn, .assistant-chat__mic-btn, .assistant-chat__end-btn`) and add new dedicated styles:

```css
/* ── Top Bar (End Conversation) ─────────────────────────────── */
.assistant-chat__top-bar {
  display: flex;
  justify-content: flex-end;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--color-border-subtle);
}

.assistant-chat__end-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  background: color-mix(in srgb, var(--color-danger, #ef4444) 15%, transparent);
  color: var(--color-danger, #ef4444);
  border: 1px solid color-mix(in srgb, var(--color-danger, #ef4444) 30%, transparent);
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast), opacity var(--transition-fast);
}

.assistant-chat__end-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-danger, #ef4444) 25%, transparent);
}

.assistant-chat__end-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Compact mode — smaller top bar */
.assistant-chat--compact .assistant-chat__top-bar {
  padding: 0.35rem 0.65rem;
}
```

Update the shared icon-button rule to only target send and mic:

```css
/* BEFORE: */
.assistant-chat__send-btn,
.assistant-chat__mic-btn,
.assistant-chat__end-btn { ... }

/* AFTER: */
.assistant-chat__send-btn,
.assistant-chat__mic-btn { ... }
```

### 3. `src/hooks/useConversation.ts` — Add `isCompacting` State

Add a new `isCompacting` boolean to signal when the conversation is ending and compaction is running:

```typescript
export function useConversation({ avatarId, conversationId }: UseConversationOptions) {
  // ...existing state...
  const [isCompacting, setIsCompacting] = useState(false);

  // Clear isCompacting when conversationId changes (new conversation started)
  useEffect(() => {
    convIdRef.current = conversationId;
    setMessages([]);
    setCurrentStreamText("");
    setError(null);
    setIsEnded(false);
    setIsCompacting(false);  // NEW: reset on new conversation
  }, [conversationId]);

  // ...existing effects...

  const endConversation = useCallback(async () => {
    if (!conversationId) return;
    isLocalEndRef.current = true;
    setIsCompacting(true);  // NEW: show splash immediately
    try {
      await assistantApi.endConversation(conversationId, avatarId);
      logger.info("useConversation", "api", "Conversation ended", { conversationId });
    } catch (err) {
      isLocalEndRef.current = false;
      setIsCompacting(false);  // NEW: hide splash on error
      setError(getErrorMessage(err));
      logger.error("useConversation", "api", "Failed to end conversation", {
        error: getErrorMessage(err),
      });
    }
  }, [conversationId, avatarId]);

  return {
    messages,
    isStreaming,
    error,
    currentStreamText,
    isEnded,
    isCompacting,  // NEW: expose to components
    sendMessage,
    retry,
    endConversation,
    loadHistory,
  };
}
```

**Flow**:
1. User clicks "End Conversation" -> `endConversation` is called
2. `isCompacting` is set to `true` immediately (before the async `endConversation` API call)
3. The Rust backend runs compaction (which involves a cloud API call to Gemini for memory extraction)
4. On completion (success or failure), the Rust backend emits `ai-conversation-ended`
5. The existing `ai-conversation-ended` listener in `useConversation` clears messages and sets `isEnded = true`
6. The parent component (`AssistantView` or `OverlayAssistant`) reacts to `ai-conversation-ended` by setting `conversationId = null`
7. The `conversationId` change triggers the `useEffect` that resets `isCompacting = false`

**Important**: `isCompacting` is set to `true` before the await — this ensures the splash appears immediately, even if the cloud API call takes several seconds.

### 4. `src/components/assistant/AssistantChat.tsx` — Journaling Splash Screen

Render a splash overlay when `isCompacting` is true, covering the messages area:

```tsx
const {
  messages,
  isStreaming,
  error,
  currentStreamText,
  isCompacting,  // NEW
  sendMessage,
  retry,
  endConversation,
  loadHistory,
} = useConversation({ avatarId, conversationId });

// ...existing code...

return (
  <div className={`assistant-chat ${compact ? "assistant-chat--compact" : ""}`}>
    {/* Top bar — hide during compaction */}
    {conversationId && !hideEndButton && !isCompacting && (
      <div className="assistant-chat__top-bar">
        {/* ...end button... */}
      </div>
    )}

    <div className="assistant-chat__messages">
      {isCompacting ? (
        <div className="assistant-chat__compacting">
          <div className="assistant-chat__compacting-icon">
            <AppIcon name="assistant" size={48} />
          </div>
          <p className="assistant-chat__compacting-text">Storing memories...</p>
          <span className="assistant-chat__compacting-spinner" />
        </div>
      ) : (
        <>
          {messages.length === 0 && !isStreaming && (
            <div className="assistant-chat__empty">
              <AppIcon name="assistant" size={48} />
              <p>Start a conversation with your assistant.</p>
            </div>
          )}
          {messages.map((msg) => (
            /* ...existing message rendering... */
          ))}
          {isStreaming && (
            /* ...existing streaming bubble... */
          )}
          <div ref={messagesEndRef} />
        </>
      )}
    </div>

    {/* Hide error bar and input bar during compaction */}
    {!isCompacting && (
      <>
        {error && (
          <div className="assistant-chat__error">
            {/* ...existing error bar... */}
          </div>
        )}
        <div className="assistant-chat__input-bar">
          {/* ...existing input bar... */}
        </div>
      </>
    )}
  </div>
);
```

### 5. `src/components/assistant/AssistantChat.css` — Compacting Splash Styles

```css
/* ── Compacting Splash ──────────────────────────────────────── */
.assistant-chat__compacting {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  flex: 1;
  padding: 3rem 1rem;
}

.assistant-chat__compacting-icon {
  color: var(--color-accent-primary);
  animation: pulse 2s ease-in-out infinite;
}

.assistant-chat__compacting-text {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.assistant-chat__compacting-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-border-subtle);
  border-top-color: var(--color-accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.95); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

### 6. `src/components/assistant/AssistantView.tsx` — Handle Compaction End

The existing `ai-conversation-ended` listener already sets `conversationId` to `null` and `hasConversation` to `false`. When the user wants to chat again, they naturally trigger a new conversation via the existing `load()` flow or by typing a message.

No changes needed here for the compacting splash — the existing event flow handles the transition:
1. `endConversation` called -> `isCompacting = true` in hook
2. Rust runs compaction -> emits `ai-conversation-ended`
3. `AssistantView` listener fires -> sets `conversationId = null`, `hasConversation = false`
4. `useConversation` resets `isCompacting = false` via the `conversationId` change effect

However, to provide a smoother UX, auto-start a new conversation after compaction completes:

```typescript
// Existing ai-conversation-ended listener in AssistantView — update to auto-restart
useEffect(() => {
  const unlisten = listen<string>("ai-conversation-ended", async (event) => {
    const endedConvId = event.payload;
    if (endedConvId === conversationId) {
      setHasConversation(false);
      // Auto-start a fresh conversation so the user sees a clean chat
      if (activeAvatar) {
        try {
          const newConvId = await assistantApi.startConversation(activeAvatar.id);
          setConversationId(newConvId);
          setHasConversation(true);
        } catch (err) {
          setConversationId(null);
          logger.error("AssistantView", "api", "Failed to start new conversation after end", {
            error: getErrorMessage(err),
          });
        }
      } else {
        setConversationId(null);
      }
    }
  });
  return () => {
    unlisten.then((fn) => fn());
  };
}, [conversationId, activeAvatar]);
```

### 7. `src/components/overlay/OverlayAssistant.tsx` — Same Auto-Restart

Apply the same auto-start pattern to the overlay's `ai-conversation-ended` listener:

```typescript
useEffect(() => {
  const unlisten = listen<string>("ai-conversation-ended", async (event) => {
    const endedConvId = event.payload;
    if (endedConvId === conversationId) {
      // Auto-start a fresh conversation
      if (activeAvatar) {
        try {
          const newConvId = await assistantApi.startConversation(activeAvatar.id);
          setConversationId(newConvId);
        } catch {
          setConversationId(null);
        }
      } else {
        setConversationId(null);
      }
    }
  });
  return () => {
    unlisten.then((fn) => fn());
  };
}, [conversationId, activeAvatar]);
```

---

## Edge Cases

- **Compaction fails**: The Rust `end_conversation` function still emits `ai-conversation-ended` even when compaction fails (it marks the conversation ended with `compacted=0`). The splash disappears normally — the user is never stuck on the splash screen.
- **User closes the app during compaction**: The async compaction task runs to completion in the Rust backend (tokio runtime). When the user reopens, `start_or_resume` will find the ended conversation and start a new one.
- **End button during streaming**: The End button is disabled while `isStreaming` is true. This prevents losing an in-flight AI response. The user must wait for the response to complete before ending.
- **Overlay vs main window**: Both windows listen for `ai-conversation-ended`. If the user ends from the overlay, the main window's splash (if visible) also clears. The `isLocalEndRef` guard prevents the window that triggered the end from double-processing the event.
- **No active game session**: `get_active_game_session_context` returns `None`, and `assemble_context` skips the "Current Activity" section entirely. No change to the existing prompt when no game is running.
- **Multiple games running simultaneously**: The query uses `LIMIT 1` with `ORDER BY start_time DESC`, so the most recently started game is reported. This matches the user's most likely focus.
- **Game session just started (0 minutes ago)**: The `max(0)` guard handles the edge case where `start_time` equals `now`. The AI sees "0 minutes ago" which is fine — it indicates the game just launched.
- **hideEndButton prop**: The overlay's `hideEndButton` continues to hide the top bar entirely. The overlay has its own End controls in the More dropdown and the standalone End button below the chat.

---

## Tests

### Rust Tests

```
get_active_game_session_context:
- Returns None when no active sessions exist
- Returns Some((game_name, start_time)) when an active session exists
- Returns the most recent session when multiple games are running
- Returns None after all sessions are closed

assemble_context with active game session:
- System prompt contains "Current Activity" section when a game is running
- System prompt does NOT contain "Current Activity" when no game is running
- Duration is calculated correctly (now - start_time)
```

### Frontend Tests

```
AssistantChat End button redesign:
- End button renders in top bar (not input bar) when conversationId is set
- End button is hidden when hideEndButton prop is true
- End button is disabled while isStreaming
- End button text reads "End Conversation"
- End button has danger styling (class includes "end-btn")

AssistantChat compacting splash:
- Splash screen renders when isCompacting is true
- Splash shows "Storing memories..." text
- Splash shows spinner animation element
- Messages area is hidden during compaction
- Input bar is hidden during compaction
- Top bar (end button) is hidden during compaction
- Splash disappears when conversationId changes (new conversation)

useConversation isCompacting:
- isCompacting is false initially
- isCompacting becomes true when endConversation is called
- isCompacting becomes false when conversationId changes
- isCompacting becomes false on endConversation error
- isCompacting is included in the returned object

AssistantView auto-restart after end:
- Calls startConversation after receiving ai-conversation-ended
- Sets new conversationId in state after auto-restart
- Sets hasConversation to true after auto-restart
- Handles startConversation failure gracefully (sets conversationId to null)
```

### Full Regression

All existing 962 tests + new tests pass.

---

## Verification

```bash
cd src-tauri && /c/Users/joshg/.cargo/bin/cargo.exe test
npx vitest run
npm run tauri dev
# Manual: Start a conversation, verify End Conversation button is visible with text label
# and danger-colored background in the top bar (not buried in the input bar).
# Manual: Click End Conversation, verify "Storing memories..." splash appears immediately,
# spinner animates, then splash clears and a fresh empty chat appears.
# Manual: Launch a game, open overlay assistant, send a message — verify the AI
# acknowledges you're playing the game (check Rust logs for "Current Activity" in system prompt).
# Manual: End conversation while no game is running — verify no "Current Activity" in system prompt.
```

---

### 8. Settings UI — Auto-End Conversations Toggle (from Phase 8)

Phase 8 added the `ai_conversation_auto_end_enabled` backend setting (defaults to `true`) and the corresponding TypeScript type (`aiConversationAutoEndEnabled` in `src/types/settings.ts`). The Settings UI toggle was deferred to this phase.

Add a toggle to the AI settings tab following the same pattern as the existing `ai_post_session_review_enabled` toggle:

```tsx
{/* In the AI settings tab, after the post-session review toggle */}
<SettingsToggle
  label="Auto-end conversations after inactivity"
  description="Automatically end conversations after 1 hour of inactivity. When disabled, conversations stay open until manually ended."
  checked={settings.aiConversationAutoEndEnabled ?? true}
  onChange={(checked) => updateSetting("aiConversationAutoEndEnabled", checked)}
/>
```

**No backend changes needed** — the `ai_conversation_auto_end_enabled` field already exists in `AppSettings` with `#[serde(default = "default_true")]` and the `start_conversation_timer` command already checks this setting before starting the timer.

### Tests for Settings Toggle

```
AI Settings — Auto-end toggle:
- Toggle renders with correct default state (checked)
- Toggle updates setting when clicked
- Toggle shows description text
```

---

## Files Changed

| File | Action |
|------|--------|
| `src-tauri/src/services/cache_db.rs` | Modified (add `get_active_game_session_context` method) |
| `src-tauri/src/services/ai/conversation.rs` | Modified (inject active game session context in `assemble_context` between Layer 3 and Layer 4) |
| `src/hooks/useConversation.ts` | Modified (add `isCompacting` state, set true on end, reset on conversationId change or error) |
| `src/components/assistant/AssistantChat.tsx` | Modified (move End button to top bar with text label, add compacting splash screen, destructure `isCompacting`) |
| `src/components/assistant/AssistantChat.css` | Modified (new `.assistant-chat__top-bar`, redesigned `.assistant-chat__end-btn` with danger styling, new `.assistant-chat__compacting` splash styles, update shared button selector to exclude end-btn) |
| `src/components/assistant/AssistantView.tsx` | Modified (update `ai-conversation-ended` listener to auto-start fresh conversation) |
| `src/components/overlay/OverlayAssistant.tsx` | Modified (update `ai-conversation-ended` listener to auto-start fresh conversation) |
| `src/components/settings/` (AI tab) | Modified (add auto-end conversations toggle) |
