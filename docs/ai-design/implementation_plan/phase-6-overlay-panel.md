# Phase 6: Overlay Assistant Panel

> The 6th FloatingPanel in the overlay — compact chat with avatar portrait. Reuses the `AssistantChat` component from Phase 5.

**Dependencies**: Phase 5 (AssistantChat component must exist)
**Design docs**: [05-chat-interface.md](../05-chat-interface.md)

---

## Goal

Add the assistant as an overlay FloatingPanel so users can chat while gaming. This is a compact variant: avatar portrait (top 1/3), chat (bottom 2/3). No sub-pages (memories/journals/avatar management are main window only).

---

## Frontend Changes

### 1. `src/components/overlay/OverlayAssistant.tsx` (NEW)

```
Layout:
┌─────────────────────────┐
│     Character Avatar     │
│       (top 1/3)          │
│    [thinking/speaking]   │
├─────────────────────────┤
│ Assistant: Based on...   │
│                          │
│ You: What about story... │
│                          │
│ Assistant: Great taste!  │
├─────────────────────────┤
│ ┌───────────────┐ [Mic] │
│ │ Message...     │ [Send]│
│ └───────────────┘       │
│         [More]    [End]  │
└─────────────────────────┘

[More] dropdown:
  - TTS toggle (placeholder UI only — TTS implementation deferred to v1.12.5 avatar overhaul)
  - Screenshot toggle (placeholder, v1.12.5)
  - End Conversation
  - Open Full Assistant (show main window at /assistant)

> **Note**: TTS functionality is deferred to v1.12.5 (avatar overhaul phase). The toggle
> should appear in the UI as a placeholder but will not be functional in v1.12.0.
> Voice selection and TTS engine integration ship alongside the Nano Banana 2 sprite maps.
```

**Key behaviors**:
- Uses `<AssistantChat compact={true} />` from Phase 5
- Avatar section: placeholder image/icon (sprite maps are v1.12.5)
- Manages its own conversation state via `useConversation` hook
- "Open Full Assistant" button: emits event to show main window + navigate to `/assistant`

**Overlay-specific considerations**:
- Uses `onPointerDown stopPropagation` on interactive elements (existing overlay pattern)
- Input field uses `onPointerUp` for actions (existing overlay pattern)
- No sub-page tabs (memories/journals/avatar are main window only)

### 2. `src/components/overlay/OverlayAssistant.css` (NEW)

Compact styling for the overlay variant. Avatar section constrained to top 1/3, chat takes bottom 2/3.

### 3. Overlay Panel Registry

Add `"assistant"` to the panel registry (wherever `OVERLAY_PANELS` is defined):

```typescript
{
  id: 'assistant',
  label: 'Assistant',
  icon: 'assistant',  // or appropriate icon
  defaultWidth: 380,
  defaultHeight: 600,
  minWidth: 320,
  minHeight: 400,
  resizable: true,
}
```

### 4. `src/OverlayApp.tsx` — Add Panel

Follow the exact same pattern as the existing 5 panels:

```tsx
{panelVisible('assistant') && (
  <FloatingPanel
    id="assistant"
    title="Assistant"
    position={savedPositions.assistant || defaultPosition}
    onPositionChange={(pos) => savePosition('assistant', pos)}
    width={380}
    height={600}
    resizable
    lockable
  >
    <OverlayAssistant />
  </FloatingPanel>
)}
```

### 5. Overlay Panel Manager

Add "Assistant" toggle button to the panel visibility list (same pattern as other panel toggles).

---

## Streaming in Both Windows

Phase 4's `send_message_and_stream()` uses `app_handle.emit("ai-stream-chunk", chunk)` which broadcasts to ALL windows. This means:

- Main window's `useConversation` hook receives chunks → updates chat
- Overlay window's `useConversation` hook also receives chunks → updates chat
- Each hook filters by `conversationId` to only process its active conversation
- Both windows can initiate conversations independently

**Cross-window sync consideration**: If the user has the chat open in both main window and overlay simultaneously, both will display the same streaming response. This is the desired behavior — they share the same conversation.

---

## OverlayPanelId Update

Add `"assistant"` to the `OverlayPanelId` type:

```typescript
// src/types/settings.ts or wherever OverlayPanelId is defined
export type OverlayPanelId =
  | 'command-center'
  | 'game-notes'
  | 'system-monitor'
  | 'media-controls'
  | 'audio-mixer'
  | 'assistant';  // NEW
```

---

## Tests

### Component Tests

```
OverlayAssistant.test.tsx:
- Renders avatar section and chat section
- Passes compact={true} to AssistantChat
- "More" dropdown renders with expected options
- "Open Full Assistant" emits correct event
```

### Manual Tests

```
1. npm run tauri dev
2. Open overlay (Ctrl+Space)
3. Toggle assistant panel → verify it appears
4. Send a message → verify streaming works
5. Drag/resize panel → verify collision awareness
6. Lock panel → verify it stays in place
7. Close and reopen → verify position is saved
8. Open chat in main window simultaneously → verify both show same messages
9. Verify other 5 panels still work without regression
```

---

## Verification

```bash
npx vitest run
npm run tauri dev  # manual overlay chat test
```

---

## Files Changed

| File | Action |
|------|--------|
| `src/components/overlay/OverlayAssistant.tsx` | **New** |
| `src/components/overlay/OverlayAssistant.css` | **New** |
| `src/OverlayApp.tsx` | Modified (add assistant panel block) |
| `src/types/settings.ts` | Modified (add 'assistant' to OverlayPanelId) |
| Overlay panel registry file | Modified (add assistant panel definition) |
| Overlay panel manager | Modified (add assistant toggle button) |
