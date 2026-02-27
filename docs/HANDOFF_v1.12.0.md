# v1.12.0 Handoff — Conversational AI Assistant

> Use this document to get up to speed at the start of a new session.
> Last updated: 2026-02-27 — Phase 7 complete, ready for Phase 8.

---

## Current State

- **Version**: 1.11.0 (synced across `tauri.conf.json`, `package.json`, `Cargo.toml`)
- **Branch**: master — Phase 1+2+3+4+5+6+7 committed and pushed to GitHub
- **Release**: v1.11.0 tag pushed and release built successfully
- **Tests**: 402 Rust + 575 frontend = 977 total (all passing)
- **DB schema**: v24 (29 tables — 23 original + 6 new AI tables, WAL mode, SQLite via rusqlite bundled)
- **Design phase**: Complete — 11 design documents in `docs/ai-design/`
- **Implementation plan**: Complete — 13 phases in `docs/ai-design/implementation_plan/`
- **Phase 1**: COMPLETE — Schema v24 + AES-256-GCM encryption (QA reviewed, all fixes applied)
- **Phase 2**: COMPLETE — Provider refactor + SSE streaming (QA reviewed, all fixes applied)
- **Phase 3**: COMPLETE — Models + CRUD + Memory Vault (QA reviewed, all fixes applied)
- **Phase 4**: COMPLETE — Conversation Service + Core Commands (QA reviewed, all fixes applied)
- **Phase 5**: COMPLETE — Frontend `/assistant` route + chat UI (QA reviewed, all fixes applied)
- **Phase 6**: COMPLETE — Overlay assistant panel + cross-window sync (QA reviewed, all fixes applied)
- **Phase 7**: COMPLETE — Hidden messages + stale conversation reset (QA reviewed, all fixes applied)
- **Next step**: Begin Phase 8 (Backend Inactivity Timer)

---

## Phase 7 Completion Summary

**Hidden Messages + Stale Conversation Reset** — completed 2026-02-27.

### What Was Built
- **Hidden message flag**: Auto-greeting prompts ("Introduce yourself...") are no longer persisted in the database — only the AI's response is stored. The `hidden` flag threads through the full pipeline: frontend hook → Tauri API → command → conversation service → CacheDb `store_message_pair`.
- **Stale conversation reset**: If a user opens chat and the only content is a stale greeting (>24h old, no user messages), the conversation is silently discarded via `abandon_conversation` and a fresh one starts automatically.
- **`abandon_conversation`**: New lightweight "end without compaction" — marks conversation ended, resets message count to 0, deletes all messages in a single transaction. Used for stale conversations with no meaningful user interaction.
- **`check_conversation_stale`**: New Tauri command — checks `has_user_messages` + 24h age threshold in a single DB lock scope.
- **Error-resilient stale check**: `loadAndGreet` effect wraps the stale check in try/catch — if the check fails, falls through to normal flow (load history + greeting).
- **Ref-based effect optimization**: `isFirstConversation` and `onStaleReset` use refs to prevent unnecessary effect re-runs.
- **15 new tests** (962 → 977 total): 8 Rust (store_message_pair skip, abandon, has_user_messages, get_conversation_started_at) + 7 frontend (stale reset flows, error paths, hidden flag forwarding)

### Files Modified (13 files)
| File | Change |
|------|--------|
| `src-tauri/src/services/cache_db.rs` | `store_message_pair` + `skip_user_message` param; new `abandon_conversation`, `has_user_messages`, `get_conversation_started_at` methods; 8 new tests |
| `src-tauri/src/services/ai/conversation.rs` | `send_message_and_stream` + `skip_user_persist` param |
| `src-tauri/src/commands/ai.rs` | `send_message` + `hidden` param; new `abandon_conversation` + `check_conversation_stale` commands |
| `src-tauri/src/lib.rs` | Registered 2 new commands |
| `src/services/tauri.ts` | `sendMessage` + `hidden` param; new `abandonConversation` + `checkConversationStale` methods |
| `src/hooks/useConversation.ts` | Forwards `hidden` flag to API call |
| `src/components/assistant/AssistantChat.tsx` | Stale check on mount, `onStaleReset` prop, ref-based effect deps, try/catch error recovery |
| `src/components/assistant/AssistantView.tsx` | `handleStaleReset` callback |
| `src/components/overlay/OverlayAssistant.tsx` | `handleStaleReset` callback with `mountedRef` guard |
| `src/components/assistant/AssistantChat.test.tsx` | 3 new stale-reset tests + 1 error path test + updated greeting assertions |
| `src/components/assistant/AssistantView.test.tsx` | 1 new stale reset test + updated mocks |
| `src/components/overlay/OverlayAssistant.test.tsx` | 1 new stale reset test + updated mocks |
| `src/hooks/useConversation.test.ts` | 1 new hidden flag test + updated assertions |

### QA Fixes Applied
1. **Effect dependency optimization (MEDIUM)**: Moved `isFirstConversation` and `onStaleReset` to refs synced each render — prevents unnecessary stale-check re-runs when props change identity
2. **Error-resilient stale check (MEDIUM)**: Wrapped stale check in try/catch — if `checkConversationStale` or `abandonConversation` throws, falls through to normal load+greet flow
3. **Data hygiene (LOW)**: `abandon_conversation` now resets `message_count = 0` on the conversation row
4. **Test coverage (HIGH)**: Added stale-reset tests for AssistantView and OverlayAssistant, error path test for AssistantChat

### Architecture Decisions
- **Hidden flag is `Option<bool>`** at the command level — defaults to false, existing callers don't need to change
- **`abandon_conversation` is a CacheDb method** (not on conversation service) — no compaction, no encryption key needed, just DB cleanup
- **Stale check is a Tauri command** (not frontend-only) — single DB lock scope, no round-trip overhead
- **Ref pattern for effect deps** — `onStaleReset` and `isFirstConversation` are stable across renders, preventing the stale-check effect from re-firing unnecessarily

---

## Phase 6 Completion Summary

**Overlay Assistant Panel** — completed 2026-02-27.

### What Was Built
- **6th FloatingPanel**: Compact AI assistant in the overlay — avatar portrait (top 1/3) + chat (bottom 2/3) + controls bar
- **3 render states**: Loading, no-avatar fallback ("Set up your assistant in the main window"), and active chat
- **Panel positioning**: Centered horizontally, below the command center (CC raised 50px to keep balanced)
- **"More" dropdown**: TTS/Screenshot placeholders (disabled, v1.12.5), End Conversation, Open Full Assistant
- **Cross-window conversation sync**: Rust emits `ai-conversation-ended` event on end; both windows listen and reset state
- **Shared conversation**: Both windows call `start_or_resume` and get the same `conversationId`; streaming chunks broadcast to both
- **`hideEndButton` prop**: AssistantChat hides its own End button in compact mode (overlay controls handle ending)
- **17 new OverlayAssistant tests + 3 useConversation sync tests** (548 → 568 total frontend)

### Files Created (3 new files)
| File | Purpose |
|------|---------|
| `src/components/overlay/OverlayAssistant.tsx` | Overlay assistant panel component |
| `src/components/overlay/OverlayAssistant.css` | Compact flexbox layout styling |
| `src/components/overlay/OverlayAssistant.test.tsx` | 17 tests (states, dropdown, sync, guards) |

### Files Modified (9 files)
| File | Change |
|------|--------|
| `src/OverlayApp.tsx` | Added import + IIFE rendering block for assistant panel |
| `src/types/settings.ts` | Added `"assistant"` to `OverlayPanelId` union |
| `src/components/overlay/overlayPanelRegistry.ts` | Added assistant panel entry + raised CC 50px |
| `src/components/assistant/AssistantChat.css` | Replaced `max-height: 400px` with compact padding/gap rules |
| `src/components/assistant/AssistantChat.tsx` | Added `hideEndButton` prop |
| `src/components/assistant/AssistantView.tsx` | Added `ai-conversation-ended` event listener |
| `src/hooks/useConversation.ts` | Added `isEnded` state + `ai-conversation-ended` listener + `isLocalEndRef` self-notification guard |
| `src/hooks/useConversation.test.ts` | Added 3 conversation-ended sync tests |
| `src-tauri/src/commands/ai.rs` | Emits `ai-conversation-ended` event after `end_conversation` succeeds |

### QA Fixes Applied
1. **Dual end-button conflict (HIGH)**: Added `hideEndButton` prop to AssistantChat — overlay controls are the sole End path
2. **Unmount cleanup (HIGH)**: Added `mountedRef` to prevent state updates on unmounted component
3. **Cross-window sync (HIGH)**: Rust emits `ai-conversation-ended`; both windows listen with `conversationId` filter; `isLocalEndRef` prevents self-notification
4. **Double-click guard (MEDIUM)**: Added `isEndingRef` to prevent concurrent end-conversation calls
5. **Non-null assertions (MEDIUM)**: Added explicit `if (!activeAvatar) return null` guard, removed 4 `!` assertions
6. **Dead prop removed (MEDIUM)**: Removed unused `onHideOverlay` prop (YAGNI)
7. **Type annotation (MEDIUM)**: Fixed `MouseEvent` → `Event` on pointerdown handler
8. **Test coverage (HIGH)**: 20 new tests — error paths, state reset, dropdown behaviors, guards, sync events

### Architecture Decisions
- **No first-run in overlay** — if no avatar exists, directs user to main window
- **"Open Full Assistant"** uses existing `show_main_and_navigate` Rust command (shows main, hides overlay, navigates — all in one)
- **Cross-window known limitation**: If both windows are open simultaneously, user messages appear optimistically only in the sending window; streaming responses appear in both; full sync on reload via history load
- **Panel defaults visible** — consistent with other content panels (except media-controls which defaults hidden)

---

## Phase 5 Completion Summary

**Frontend `/assistant` Route + Chat UI** — completed 2026-02-27.

### What Was Built
- **`/assistant` route**: Full page with avatar panel (colored initial circle, name, personality, status) + tabbed content (Chat, Memories, Journals, Avatar)
- **Chat engine**: `AssistantChat.tsx` — streaming message display, markdown rendering (`react-markdown` + `remark-gfm`), speech recognition mic button, error/retry, auto-scroll
- **3 custom hooks**: `useConversation` (streaming, message management, event listener), `useInactivityTimer` (1hr countdown, session-aware pause), `useSpeechRecognition` (Web Speech API)
- **Sub-pages**: `AssistantMemories` (category filters, search, system memory protection), `AssistantJournals` (date-sorted, delete confirmation), `AssistantAvatars` (list/create/switch avatars, personality browser)
- **First-run wizard**: `AssistantFirstRun` — automatic encryption key generation + avatar creation + personality picker
- **Action/Review components**: `ActionConfirmation` (Tier 2 yes/no), `ReviewConfirmation` (star display + editable review text)
- **Navigation**: "Assistant" added to sidebar right after Library (prominent position)
- **66 new frontend tests** (478 → 544 total): 7 hook tests, 8 chat tests, 7 memories tests, 6 first-run tests, 6 view tests, 6 journals tests, 6 avatars tests + 13 streaming/speech/guard tests added during QA
- **New dependencies**: `react-markdown` v10.1.0, `remark-gfm` v4.0.1

### Files Created (27 new files)
| File | Purpose |
|------|---------|
| `src/types/assistant.ts` | 9 TypeScript interfaces mirroring Rust types |
| `src/utils/avatarColors.ts` | Shared avatar color utility (extracted from components) |
| `src/hooks/useConversation.ts` | Chat engine hook (streaming, messages, retry) |
| `src/hooks/useInactivityTimer.ts` | Countdown timer with session-aware pause |
| `src/hooks/useSpeechRecognition.ts` | Web Speech API wrapper |
| `src/components/assistant/AssistantView.tsx` + `.css` | Main `/assistant` route component |
| `src/components/assistant/AssistantChat.tsx` + `.css` | Shared chat engine |
| `src/components/assistant/AssistantMemories.tsx` + `.css` | Memory vault viewer |
| `src/components/assistant/AssistantJournals.tsx` + `.css` | Journal/daily log viewer |
| `src/components/assistant/AssistantAvatars.tsx` + `.css` | Avatar/personality management |
| `src/components/assistant/AssistantFirstRun.tsx` + `.css` | First-time setup wizard |
| `src/components/assistant/ActionConfirmation.tsx` + `.css` | Tier 2 action confirmation |
| `src/components/assistant/ReviewConfirmation.tsx` + `.css` | Review confirmation card |
| 9 test files | Tests for all hooks and components |

### Files Modified
| File | Change |
|------|--------|
| `src/App.tsx` | Added `/assistant` route with `RouteErrorFallback` |
| `src/components/layout/IconRail.tsx` | Added "Assistant" nav item after Library |
| `src/services/tauri.ts` | Added `assistantApi` namespace (20 commands) |
| `src/test/factories.ts` | Added 5 AI factory functions |
| `src/types/index.ts` | Added assistant type re-exports |
| `src/types/settings.ts` | Added `aiPostSessionReviewEnabled` field |
| `src/utils/icons.ts` | Added `"assistant"` icon in all 6 icon sets |
| `package.json` | Added react-markdown, remark-gfm |

### QA Fixes Applied
1. **Timer infinite loop (HIGH)**: Inactivity timer fired `onTimeout` every second after reaching 0 — added `prev <= 0` guard
2. **Streaming guard (HIGH)**: `sendMessage`/`retry` had no `isStreaming` guard at hook level — added `isStreamingRef` guards
3. **Markdown link sanitization (MEDIUM)**: Added custom `components` prop to filter `javascript:`/`vbscript:`/`data:` URIs, add `target="_blank"`, disable image rendering
4. **Timeout race guard (MEDIUM)**: Added `isEndingRef` to prevent multiple concurrent `endConversation` calls
5. **Avatar switch cleanup (MEDIUM)**: Added `endConversation` call before switching avatars
6. **Error handling (MEDIUM)**: Converted `handleFirstRunComplete` from unhandled `.then()` chains to `async/await` with try/catch
7. **StarRating scale (LOW)**: Fixed `ReviewConfirmation` to use `stars * 2` for the 0-10 scale
8. **Message clearing (LOW)**: Clear messages/error/streamText when `conversationId` changes
9. **DRY (LOW)**: Extracted `AVATAR_COLORS`/`getAvatarColor` to shared `avatarColors.ts` utility
10. **Input limit (LOW)**: Added `maxLength={10000}` to chat input
11. **Test coverage (HIGH)**: Fixed streaming tests (captured listen callback), speech recognition tests (captured instances), added AssistantJournals + AssistantAvatars test files

### Architecture Decisions
- **"Assistant" nav position**: Right after Library — prominent placement as a primary feature
- **Avatar panel (Phase 5)**: Colored initial circle with name/personality/status — sprite maps deferred to v1.12.5
- **Markdown rendering**: `react-markdown` + `remark-gfm` with custom link sanitization and disabled images
- **First-run wizard**: Encryption is automatic (key never displayed to user) — simplified to just avatar creation + personality selection
- **Corrected API signatures**: `sendMessage`, `endConversation`, `retryCompaction` all require `avatarId` (not in original plan)

---

## Phase 4 Completion Summary

**Conversation Service + Core Commands** — completed 2026-02-27.

### What Was Built
- **Conversation lifecycle service**: `conversation.rs` — start/resume, 4-layer context assembly, streaming messages via Gemini SSE, compaction into memories, orphan detection
- **Conversation system prompt**: New personality-infused system prompt with standing review instruction (separate from the command palette system prompt in `context_builder.rs`)
- **Compaction system**: Extracts memories + journal entries from conversations, handles superseded memories, auto-retry on failure, markdown code fence stripping
- **11 new CacheDb methods**: Conversation CRUD, message CRUD, orphan detection, personality lookup, transactional `store_message_pair` + `complete_compaction`
- **7 new Tauri commands**: `start_conversation`, `send_message`, `end_conversation`, `get_conversation_history`, `retry_compaction`, `get_memory_context`, `check_post_session_review`
- **`ai_post_session_review_enabled`** setting added to `AppSettings`
- **24 new tests** (370 → 394 total Rust): 13 conversation lifecycle + 10 CacheDb + 1 compaction serde test

### Files Created
| File | Purpose |
|------|---------|
| `src-tauri/src/services/ai/conversation.rs` | Conversation lifecycle service (start/resume, context assembly, streaming, compaction) |

### Files Modified
| File | Change |
|------|--------|
| `src-tauri/src/models/settings.rs` | Added `ai_post_session_review_enabled` field |
| `src-tauri/src/models/assistant.rs` | Removed `#[allow(dead_code)]` from types now in use |
| `src-tauri/src/services/cache_db.rs` | Added `AiMessageRow` struct, 11 new methods, 2 transactional methods, test helper, 10 tests |
| `src-tauri/src/services/ai/mod.rs` | Added `pub mod conversation` |
| `src-tauri/src/services/ai/memory.rs` | Removed `#[allow(dead_code)]` from functions now called |
| `src-tauri/src/services/ai/cloud_provider.rs` | Removed `#[allow(dead_code)]` from trait |
| `src-tauri/src/services/ai/providers/mod.rs` | Removed `#[allow(dead_code)]` from `get_provider()` |
| `src-tauri/src/services/ai/providers/gemini_config.rs` | Added `#[allow(dead_code)]` on `GeminiConfig` struct |
| `src-tauri/src/commands/ai.rs` | Added 7 new Tauri commands with imports |
| `src-tauri/src/lib.rs` | Registered all 7 new commands |

### QA Fixes Applied
1. **Transaction safety (HIGH)**: Compaction storage (journal + memories + supersede + complete + delete messages) wrapped in `complete_compaction()` transaction
2. **Transaction safety (HIGH)**: Message pair insertion (user + assistant + count update) wrapped in `store_message_pair()` transaction
3. **Input validation (MEDIUM)**: `send_message` rejects empty messages and messages over 10,000 characters
4. **Error propagation (MEDIUM)**: Streaming task errors are now captured via JoinHandle and propagated (not silently discarded)
5. **Retry guard (MEDIUM)**: `retry_compaction` checks that messages still exist before attempting re-compaction
6. **Lock efficiency (MEDIUM)**: `check_post_session_review` combines two DB checks into a single lock scope

### Architecture Decisions
- **Conversation system prompt is separate** from the command palette system prompt — conversational mode does not use the action-oriented JSON response format
- **`complete_compaction` is a single CacheDb method** — avoids exposing `conn` to external callers while maintaining transaction safety
- **`avatar_id` passed as parameter** to `send_message_and_stream` and `end_conversation` — avoids extra DB lookup since the command layer already has it
- **CompactionResult uses camelCase** serde — the compaction prompt uses camelCase field names (`supersededMemories`) to match

---

## Phase 1 Completion Summary

**Schema v24 + AES-256-GCM Encryption** — completed 2026-02-27.

### What Was Built
- **6 new AI tables**: `ai_avatars`, `ai_personalities`, `ai_conversations`, `ai_messages`, `ai_memories`, `ai_daily_log`
- **4 indexes**: conversation lookup, memory search, daily log lookup, message ordering
- **6 built-in personality seeds**: Gaming Buddy, Lore Master, Achievement Hunter, Speedrun Coach, Chill Companion, Strategy Advisor (deterministic UUIDs)
- **Encryption module**: `src-tauri/src/services/ai/encryption.rs` — `generate_aes_key`, `encrypt_field`, `decrypt_field`, `store_encryption_key`, `load_encryption_key`, `has_encryption_key`, `delete_encryption_key`
- **22 new tests** (302 total Rust, up from 280): 15 encryption tests + 7 schema/FK/cascade tests

### Files Created
| File | Purpose |
|------|---------|
| `src-tauri/src/services/ai/encryption.rs` | AES-256-GCM encryption + Windows Credential Manager key storage |

### Files Modified
| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Added `aes-gcm = "0.10"`, `zeroize = "1"`, `stream` feature on reqwest |
| `src-tauri/src/utils/error.rs` | Added `AppError::Encryption` variant |
| `src-tauri/src/services/ai/mod.rs` | Added `pub mod encryption` |
| `src-tauri/src/services/cache_db.rs` | Added `apply_v24()` with 6 tables, 4 indexes, 6 personality seeds, 7 tests |
| `src-tauri/src/services/backup_service.rs` | Bumped `CURRENT_SCHEMA_VERSION` 23 → 24 |

### QA Fixes Applied
1. **Transaction wrapping**: `apply_v24()` wrapped in `unchecked_transaction()` — if app crashes mid-migration, DB rolls back cleanly
2. **UTF-8 error safety**: `decrypt_field` uses generic error message instead of forwarding `from_utf8` error details
3. **Key material zeroization**: `store_encryption_key` and `load_encryption_key` wrap key material and intermediate base64 strings in `Zeroizing<>`

### Agent Artifacts
Phase 1 planning and QA documents archived at `docs/ai-design/implementation_plan/completed/phase-1/`:
- `phase-1-expanded-plan.md` — Senior Engineer work breakdown
- `phase-1-security-audit.md` — Security audit (3 High, 4 Medium, 4 Low findings)
- `phase-1-correctness-review.md` — Correctness review (0 Critical, 1 Medium, 4 Low)
- `phase-1-test-recommendations.md` — 22 recommended tests with priority rankings

---

## Phase 3 Completion Summary

**Models + CRUD + Memory Vault** — completed 2026-02-27.

### What Was Built
- **8 domain types**: `AiPersonality`, `AiAvatar`, `AiConversation`, `AiMessage`, `AiMemory`, `AiDailyLog`, `CompactionResult`, `CompactionMemory` in `models/assistant.rs`
- **21 CacheDb methods**: Personality CRUD (2), Avatar CRUD (4), Memory CRUD (9), Journal CRUD (4), Wipe (1), Batch delete (1) in `cache_db.rs`
- **Memory vault service**: `services/ai/memory.rs` — load/format/insert/prune/seed/journal operations with encryption integration
- **13 new Tauri commands**: Personality (2), Avatar (4), Memory (2), Journal (2), Encryption key (2), Wipe (1)
- **31 new tests** (370 total Rust): 16 CacheDb tests, 8 memory service tests, 4 serde round-trip tests, 3 boundary/encryption verification tests

### Files Created
| File | Purpose |
|------|---------|
| `src-tauri/src/models/assistant.rs` | All AI domain types (8 structs) |
| `src-tauri/src/services/ai/memory.rs` | Memory vault service (load, format, insert, prune, seed, journal) |

### Files Modified
| File | Change |
|------|--------|
| `src-tauri/src/models/mod.rs` | Added `pub mod assistant` |
| `src-tauri/src/services/ai/mod.rs` | Added `pub mod memory`, removed `#[allow(dead_code)]` from encryption |
| `src-tauri/src/services/cache_db.rs` | Added `AiMemoryRow`/`AiDailyLogRow` structs + 21 new methods + 16 tests |
| `src-tauri/src/commands/ai.rs` | Added 13 new Tauri commands with imports |
| `src-tauri/src/lib.rs` | Registered all 13 new commands |
| `src-tauri/src/services/ai/encryption.rs` | Added `#[allow(dead_code)]` on `delete_encryption_key` |

### QA Fixes Applied
1. **Encryption key not leaked**: `generate_encryption_key` returns `()` instead of base64 key material
2. **Lock safety**: `wipe_ai_memory` loads encryption key before acquiring DB Mutex (avoids keyring I/O under lock)
3. **Transaction safety**: `prune_vault_if_needed` uses batch `soft_delete_memories_batch` wrapped in transaction
4. **System memory protection**: `delete_memory` command uses `soft_delete_user_memory` with `is_system = 0` guard
5. **Deterministic pruning**: `get_lowest_importance_memories` ORDER BY `importance ASC, created_at ASC`
6. **Username from settings**: `wipe_ai_memory` accepts `app_handle` to load username (falls back to "User")

### Architecture Decisions
- All raw SQL lives in `impl CacheDb` methods (`conn` is private) — `memory.rs` only contains higher-level logic
- Raw encrypted rows (`AiMemoryRow`, `AiDailyLogRow`) vs decrypted domain types (`AiMemory`, `AiDailyLog`) — clean separation
- `AiMessage.role` kept as `String` (not `ChatRole` enum) for simpler DB mapping

---

## Phase 2 Completion Summary

**Provider Refactor + SSE Streaming** — completed 2026-02-27.

### What Was Built
- **Modular provider directory**: `providers/gemini.rs`, `providers/gemini_config.rs`, `providers/mod.rs` — factory pattern for future multi-provider support
- **Extended `CloudProviderApi` trait**: Added `ChatMessage`, `ChatRole`, `StreamChunk` types + `send_conversation_stream` method
- **SSE streaming implementation**: `streamGenerateContent?alt=sse` with line buffering, per-chunk timeouts (60s), graceful degradation on errors
- **Backward-compat shim**: `gemini_provider.rs` re-exports from new location — zero changes to existing commands
- **37 new tests** (339 total Rust, up from 302): SSE parsing (10), type serde (5), URL construction (2), role mapping (3), response extraction (5), provider factory (3), config (2), line buffer flush (2), error sanitization (2), build_contents (3)

### Files Created
| File | Purpose |
|------|---------|
| `src-tauri/src/services/ai/providers/gemini.rs` | Full Gemini provider — single-shot + SSE streaming + SSE parser |
| `src-tauri/src/services/ai/providers/gemini_config.rs` | Config constants (model, endpoint, token limits, temperatures) |
| `src-tauri/src/services/ai/providers/mod.rs` | Provider factory with fallback |

### Files Modified
| File | Change |
|------|--------|
| `src-tauri/src/services/ai/cloud_provider.rs` | Added ChatMessage, ChatRole, StreamChunk types + extended trait + 5 serde tests |
| `src-tauri/src/services/ai/gemini_provider.rs` | Replaced with backward-compat re-export shim |
| `src-tauri/src/services/ai/mod.rs` | Added `pub mod providers` |

### QA Fixes Applied
1. **Line buffer flush**: Added `flush_line_buffer()` helper called in stream-end, timeout, and error branches — prevents silent data loss when final SSE chunk lacks trailing newline
2. **thinkingBudget omitted from streaming**: Chat streaming should not set `thinkingBudget: 0` (only for compact/single-shot)

---

## What v1.12.0 Is

**Full conversational AI assistant** with persistent memory, customizable avatar/personality system, streaming responses, voice features, encrypted storage, and modular multi-provider architecture.

This is the biggest feature yet — evolving the existing single-shot cloud AI into a stateful, personalized companion that remembers the user across sessions.

---

## Implementation Plan (READ THIS FIRST)

The build is broken into 13 sequential phases in `docs/ai-design/implementation_plan/`. The original Phase 7 was split into Phases 7-13 for better scoping and detailed planning.

| Phase | Focus | Layer | Status |
|-------|-------|-------|--------|
| [1](ai-design/implementation_plan/phase-1-schema-encryption.md) | Schema v24 + encryption | Rust | **DONE** |
| [2](ai-design/implementation_plan/phase-2-provider-streaming.md) | Provider refactor + streaming | Rust | **DONE** |
| [3](ai-design/implementation_plan/phase-3-models-crud-memory.md) | Models + CRUD + memory vault | Rust | **DONE** |
| [4](ai-design/implementation_plan/phase-4-conversation-service.md) | Conversation service | Rust | **DONE** |
| [5](ai-design/implementation_plan/phase-5-frontend-route.md) | `/assistant` route + chat UI | Frontend | **DONE** |
| [6](ai-design/implementation_plan/phase-6-overlay-panel.md) | Overlay panel | Frontend | **DONE** |
| [7](ai-design/implementation_plan/phase-7-hidden-messages-stale-reset.md) | Ephemeral greeting + stale conversation reset | Both | **DONE** |
| [8](ai-design/implementation_plan/phase-8-backend-inactivity-timer.md) | Backend tokio timer + frontend hook refactor | Both | |
| [9](ai-design/implementation_plan/phase-9-ux-polish.md) | End button, journaling splash, game session context | Both | |
| [10](ai-design/implementation_plan/phase-10-error-recovery.md) | Orphan recovery, compaction retry, clipboard failsafe | Both | |
| [11](ai-design/implementation_plan/phase-11-avatar-data-management.md) | Delete avatar, per-avatar wipe, encryption key management | Both | |
| [12](ai-design/implementation_plan/phase-12-post-session-reviews.md) | Native notifications, review trigger, context enrichment | Both | |
| [13](ai-design/implementation_plan/phase-13-structured-action-execution.md) | Action delimiter, streaming parser, executor bridge | Both | **DISCUSSION** |

Phases 1-4 are pure Rust. Phase 5 is the first frontend work. Phases 9-11 are independent of each other. Phase 13 requires design discussion before implementation.

**Start with**: [implementation_plan/README.md](ai-design/implementation_plan/README.md) for the dependency graph and summary table.

---

## Design Documents

All design decisions have been made and documented in `docs/ai-design/`:

| # | Document | Key Contents |
|---|----------|-------------|
| - | [README.md](ai-design/README.md) | Architecture overview, 4-layer context system, token budgets, all resolved decisions, full summary table |
| 1 | [Database Schema](ai-design/01-database-schema.md) | 6 new tables, relationships, encrypted fields, schema v24 |
| 2 | [Memory System](ai-design/02-memory-system.md) | Compaction prompt, vault management (100 cap), pruning, cross-avatar sharing, log rotation |
| 3 | [Conversation Lifecycle](ai-design/03-conversation-lifecycle.md) | Start/resume/end, 4-layer context assembly, mid-session summarization, timeout state machine |
| 4 | [Avatar & Personality](ai-design/04-avatar-personality.md) | Per-avatar isolation, built-in personalities, system memories, first-run experience |
| 5 | [Chat Interface](ai-design/05-chat-interface.md) | Route + overlay layouts, voice features, screenshot toggle |
| 6 | [Streaming](ai-design/06-streaming.md) | Gemini SSE → Tauri events → frontend, trait extension |
| 7 | [Action Tiers](ai-design/07-action-tiers.md) | 3-tier security model |
| 8 | [Error Handling](ai-design/08-error-handling.md) | All failure modes and recovery flows |
| 9 | [Privacy & Encryption](ai-design/09-privacy-encryption.md) | AES-256-GCM, key management, wipe, backup |
| 10 | [Multi-Provider](ai-design/10-multi-provider.md) | Modular provider architecture |
| 11 | [Post-Session Review](ai-design/11-post-session-review.md) | Toast notifications, AI-drafted reviews |

---

## Existing AI System Architecture

### Rust Backend (`src-tauri/src/services/ai/`)

| File | Purpose |
|------|---------|
| `mod.rs` | Module exports (incl. `providers`, `encryption`) |
| `types.rs` | `QueryContext` struct — games, genres, tags, categories, static config |
| `orchestrator.rs` | `AiOrchestrator::build_context(db)` → builds `QueryContext` from CacheDb |
| `pattern_matcher.rs` | `PatternMatcher::resolve(query, ctx)` — instant local matching, 9 extractors |
| `context_builder.rs` | `build_system_prompt()`, `build_filtered_library_summary()`, `build_action_context()` |
| `cloud_provider.rs` | `CloudProviderApi` trait — `send_query` + `send_conversation_stream`; `ChatMessage`, `ChatRole`, `StreamChunk` types |
| `gemini_provider.rs` | Backward-compat re-export shim → `providers/gemini.rs` |
| `providers/gemini.rs` | `GeminiProvider` — single-shot + SSE streaming, SSE parser, error sanitization |
| `providers/gemini_config.rs` | `GEMINI_CONFIG` constants (model, endpoint, token limits, temperatures) |
| `providers/mod.rs` | `get_provider()` factory — returns provider by name with Gemini fallback |
| `encryption.rs` | AES-256-GCM field-level encryption + key storage in Windows Credential Manager |
| `cloud_resolver.rs` | `CloudResolver::resolve()` — cache → rate limit → context → call → validate → cache |
| `cloud_cache.rs` | `CloudQueryCache` — LRU 100 entries, 5-min TTL |
| `cloud_config.rs` | `CloudConfig` (Tauri state) — enabled, provider, daily limit, rate limiting |

### Tauri Commands (`src-tauri/src/commands/ai.rs`)

| Command | Purpose |
|---------|---------|
| `ai_resolve_intent(query)` | Sync — pattern matcher (instant, local) |
| `ai_cloud_resolve(query)` | Async — "Ask Assistant" cloud call (single-shot) |
| `store_cloud_api_key(provider, key)` | Store in Windows Credential Manager |
| `delete_cloud_api_key(provider)` | Delete stored key |
| `get_cloud_api_key_status(provider)` | Check if configured |
| `test_cloud_api_key(provider)` | Test key validity |
| `get_cloud_ai_usage()` | Return usage stats |
| `update_cloud_ai_settings(...)` | Update runtime config + persist |

### Frontend AI Integration

- **Types**: `src/types/ai.ts` — mirrors Rust types
- **API wrappers**: `src/services/tauri.ts` — `aiApi.*` and `cloudAiApi.*`
- **Command palette**: `src/components/overlay/OverlayCommandCenter.tsx` — pattern matcher auto-fires, "Ask Assistant" for cloud
- **Settings**: Cloud AI tab (provider, API key, context scope, daily limit, privacy)
- **No Zustand slice for AI** — all AI state is local component state
- **No conversation/message tables used yet** — schema v24 has 6 AI tables but no Tauri commands use them yet (Phase 3)

---

## Key Decisions Already Made

1. Compaction counts against daily API limit
2. Memory & Journal viewable sub-pages under `/assistant`
3. Monthly log consolidation is AI-powered (Gemini call)
4. Memory categories filterable (preference/opinion/fact/general/system)
5. Chat UI in both `/assistant` route AND overlay FloatingPanel
6. Streaming via SSE → Tauri events (core feature, not stretch goal)
7. 3-tier action security with confirmation baked into code
8. Per-avatar isolation (own memories, journal, conversations)
9. AES-256-GCM field-level encryption, key in Windows Credential Manager
10. Multi-provider modular — Gemini now, others slot in later
11. Post-session review via toast notification (opt-in, standing system prompt instruction)
12. No special "injected" message flag — review prompts are normal assistant messages
13. TTS and voice selection deferred to v1.12.5 (avatar overhaul) — not part of v1.12.0
14. Pre-built voices: 4 feminine + 2 masculine, color-named (Coral, Azure, Sage, Violet, Amber, Slate)
15. Written reviews (`review_text` from `game_ratings`) to be included in AI context (Phase 12)
16. Active game session context (current game, session start, duration) for AI messages (Phase 9)
17. Auto-greeting prompt is ephemeral — not persisted in DB, only the AI's response is stored (Phase 7)
18. Stale conversation auto-reset: if user doesn't respond within 24h, silently discard and start fresh — no compaction (Phase 7)
19. Delete avatar feature: cascade-deletes all conversations, memories, and journals for that avatar (Phase 11)
20. Per-avatar data wipe: clear all data for a specific avatar without deleting the avatar itself (Phase 11)
21. Inactivity timer moves to Rust backend (tokio background task) — runs even when user isn't on chat page; frontend hook becomes display-only subscriber; settings toggle to enable/disable auto-end (Phase 8)
22. Structured action execution uses delimiter approach (`---ACTIONS---`) to preserve streaming — design discussion required before Phase 13 implementation

---

## Key Implementation Constraints

1. **Never hold DB lock during HTTP calls** — short-scope lock pattern
2. **Never emit events while holding a Mutex lock** — collect payload, drop guard, then emit
3. **Use `app_handle.emit()` (broadcast)** for streaming chunks so both windows receive
4. **Encryption key in tests**: use `[0u8; 32]` test key, never call keyring in tests
5. **Backward compatibility**: existing `ai_resolve_intent` and `ai_cloud_resolve` must work throughout
6. **Compaction uses `send_query()` (non-streaming)**, not streaming
7. **Gemini role mapping**: internal `ChatRole::Assistant` → Gemini `"model"` (not `"assistant"`)

---

## Project Conventions (Quick Reference)

- **Launch**: `npm run tauri dev`
- **Rust tests**: `cd src-tauri && /c/Users/joshg/.cargo/bin/cargo.exe test`
- **Frontend tests**: `npx vitest run`
- **Pre-push checks** (ALL must pass before pushing to GitHub):
  1. `cd src-tauri && cargo fmt` (auto-fix formatting)
  2. `cargo fmt -- --check` (verify no diffs remain)
  3. `cargo clippy -- -D warnings` (zero warnings)
  4. `cargo test` (all tests green)
  5. For frontend phases: `npx vitest run` + `npx tsc --noEmit`
- **Credentials**: Windows Credential Manager via keyring crate (service: `app.theroost`)
- **Error handling**: `AppError` variants → `{ code, message }` JSON; `MutexExt` for lock safety
- **Schema migrations**: Sequential in `cache_db.rs init_schema()`, bump version atomically
- **Version sync**: `tauri.conf.json` + `package.json` + `Cargo.toml`
- **Test factories**: `src/test/factories.ts` — `makeGame()`, `makeMeta()`, `makeFilters()`, etc.
- **Icon system**: `<AppIcon name="..." size={N} />` via `src/utils/icons.ts` registry
- **Logging**: `tracing` (Rust) + `logger` (frontend), never log sensitive data

---

## Files to Read First

| Priority | File | Why |
|----------|------|-----|
| 1 | `docs/ai-design/implementation_plan/README.md` | Phase dependency graph + summary table |
| 2 | `docs/ai-design/implementation_plan/phase-4-conversation-service.md` | **CURRENT PHASE** — exact files, functions, and tests |
| 3 | `docs/ai-design/README.md` | Full architecture overview + all resolved decisions |
| 4 | `docs/ai-design/03-conversation-lifecycle.md` | Start/resume/end, 4-layer context assembly, mid-session summarization |
| 5 | `docs/ai-design/02-memory-system.md` | Memory vault, compaction, pruning — used by conversation end |
| 6 | `docs/ai-design/06-streaming.md` | SSE architecture — conversation service calls streaming provider |
| 7 | `docs/ai-design/08-error-handling.md` | Failure modes and recovery flows |
| 8 | `src-tauri/src/services/ai/memory.rs` | Phase 3 output — memory vault service (load/format/seed/prune) |
| 9 | `src-tauri/src/services/ai/providers/gemini.rs` | Phase 2 output — streaming provider the conversation service will call |
| 10 | `src-tauri/src/commands/ai.rs` | Existing commands — Phase 4 will add conversation commands |

---

## Development Pipeline

Each phase runs through this pipeline. **Optimize each step contextually** — a well-specified phase needs lighter planning; a broad phase needs heavier QA. The goal is consistency + keeping the main conversation's token usage low by delegating heavy work to subagents.

### Pipeline Steps

1. **Senior Engineer Agent** (1x Opus, foreground)
   - Reads the phase plan + design docs + actual source files
   - For well-specified phases: **verification mode** — confirm assumptions, flag drift, produce compact delta
   - For loosely-specified phases: **expansion mode** — full work breakdown, identify holes, resolve ambiguities
   - Output: actionable brief for the coding agent

2. **Coding Agent** (1x Opus, worktree)
   - If slices are interdependent (can't compile alone): 1 agent, single worktree
   - If truly independent: Nx parallel worktrees
   - **MUST run before returning**: `cargo fmt`, `cargo test`, `cargo clippy -- -D warnings`
   - For frontend phases: also `npx vitest run` and `npx tsc --noEmit`

3. **QA Agents** (parallel, background)
   - Scale to match phase scope:
     - Narrow phases (pure Rust, no user input, no DB schema changes): 2 agents (Security+Correctness combined, Test Coverage)
     - Broad phases (frontend + backend, user input, new routes): 3 agents (Security, Correctness, Tests)
   - All QA agents are read-only reviewers — they never modify code

4. **Fix Agent** (1x Opus, same worktree)
   - Applies all QA fixes rated CRITICAL or HIGH
   - Applies MEDIUM fixes that are low-effort
   - **MUST run before returning**: `cargo fmt`, `cargo test`, `cargo clippy -- -D warnings`

5. **Merge + Push**
   - Verify tests on master after merge
   - Run full pre-push checks (fmt, clippy, test)
   - Push to GitHub
   - Update handoff doc + MEMORY.md

### Roles
- **AI Engineer (Claude)**: Project manager — runs the pipeline, reviews agent output, handles merging, makes technical decisions
- **User**: Creative director — provides creative/UX input, final say on design decisions; only consulted for non-technical choices
