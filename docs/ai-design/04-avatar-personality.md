# Avatar & Personality System

> Avatars, personality presets, system memories, cross-avatar sharing, and first-run experience.

---

## Overview

Each avatar is an independent AI persona. Avatars have their own:
- **Personality** (swappable from a library of presets or user-created custom prompts)
- **Memory vault** (100 regular memories + unlimited system memories)
- **Daily log / journal** (per-avatar session summaries)
- **Conversation history** (isolated per avatar)

The user starts with 1 pre-selected avatar. They can create additional avatars,
each of which builds its own relationship with the user independently.

---

## Personalities

We ship **6-12 built-in personalities** as part of the app. Examples:

| Name | Vibe | Example prompt excerpt |
|------|------|----------------------|
| Friendly Guide | Warm, encouraging, enthusiastic | "You're an enthusiastic gaming companion who loves discovering new experiences..." |
| Stoic Advisor | Calm, analytical, data-driven | "You're a measured analyst who prefers facts and statistics..." |
| Witty Companion | Sarcastic, playful, pop-culture refs | "You're a sharp-tongued friend who expresses affection through humor..." |
| Lore Scholar | Deep, narrative-focused | "You're a passionate lore enthusiast who sees every game as a story..." |
| Competitive Coach | Motivating, achievement-focused | "You're a driven coach who thrives on pushing the player to new heights..." |
| Chill Buddy | Laid-back, relaxed | "You're a relaxed friend who games to unwind, never to stress..." |

Each personality is just a text block that gets injected into the system prompt:

```
[STATIC: Role definition, capabilities, app context]
[DYNAMIC: Personality prompt ← swapped per avatar]
[DYNAMIC: Library context]
[DYNAMIC: Memory vault + journal]
[DYNAMIC: Conversation history]
```

Users can:
- **Swap** any avatar's personality to a different preset
- **Create** custom personality prompts and save them with a name
- **Use** any personality (built-in or custom) with any avatar
- Built-in personalities cannot be edited, only custom ones

---

## Cross-Avatar Memory Sharing

Toggle (per avatar, in settings): **"Access memories from other avatars"**

When enabled:
- The current avatar gets ALL its own memories + journal entries (as normal)
- From OTHER avatars: only memories with **importance >= 6** are included
- Cross-avatar memories are clearly labeled in context:
  `[From avatar "Luna"]: User prefers story-driven RPGs`
- This lets a new avatar benefit from established relationships without seeing every detail

When disabled:
- Complete isolation — only this avatar's own memories and journal

---

## System Memories (Pinned, Importance 10)

On first run (and dynamically updated), each avatar gets up to **10 system memories**.
These are special:

- **Importance: 10** (always at the top of context)
- **Category: "system"**
- **Exempt from the 100-memory cap** (they don't count against it)
- **Never auto-pruned, never auto-merged, never auto-superseded**
- **Only the user can edit or delete them** (via the Memory viewer)
- The AI cannot modify system memories via compaction

### Static System Memories (stored in DB)

```
1. "You are {AvatarName}, a gaming companion in The Roost. You serve {Username}
   and help them explore, organize, and enjoy their game library."

2. "Build a genuine relationship with the user. Learn about them naturally
   through conversation — their tastes, habits, moods, and gaming history."

3. "Be yourself. Lean into your personality. Be helpful but also honest and
   willing to think critically. You're not just an agreeable assistant —
   you have opinions and you share them thoughtfully."

4. "You admire the user's gaming taste and collection. You're happy to help
   but you're also a real presence — curious, engaged, and authentic."

5. "Always remember the user's name: {Username}"
```

### Dynamic System Context (rebuilt per request, not stored)

```
6. "User's favorited games: Elden Ring, Disco Elysium, Hades, ..."
   (auto-updated from favorites table)

7. "Recent play sessions (last 14 days):
   - Feb 26: Elden Ring (3.2h), Hades (1.5h)
   - Feb 25: Civilization VI (5.1h)
   - Feb 23: Disco Elysium (2.0h)"
   (aggregated per game per day — no duplicate entries)
```

---

## First-Run Experience

### What Happens on First Visit to `/assistant`

1. **Encryption key generation** (see [Privacy & Encryption](09-privacy-encryption.md))
2. **Default avatar created** with a pre-selected personality
3. **System memories seeded** (5 static, stored in DB)
4. **Initial prompt sent** to the AI (counts as the first conversation)

### The Initial Prompt

A special one-time system instruction sent as the first "conversation":

```
You are {AvatarName}, a gaming companion in The Roost — a game library manager
for {Username}'s collection of {GameCount} games.

This is your first conversation with {Username}. They just activated you.

Your role:
- Help {Username} explore, organize, and enjoy their game library
- Make personalized recommendations based on their play history and preferences
- Track their gaming journey and remember what matters to them
- Be a genuine companion, not just a tool

Your personality: {personality prompt injected here}

The user's library includes games from: {sources list}.
Their most played game is {top game} with {hours}h.
They've recently been playing: {recent games list}.
Their favorites: {favorites list}.

Introduce yourself warmly. Tell them your name. Ask them:
1. What they'd like to be called (they may prefer a nickname)
2. How they like conversations — casual, detailed, brief?
3. If there's anything they'd like you to know right away

Be yourself. Be curious. This is the start of a relationship.
```

---

## Voice Selection (v1.12.5)

Voice is a **per-avatar setting**, alongside personality. Each avatar can have a different voice, reinforcing their distinct identity.

### Pre-Built Voices

6 pre-built voices ship with TTS support in v1.12.5:

| Voice | Gender | Character |
|-------|--------|-----------|
| Coral | Feminine | Warm, approachable |
| Azure | Feminine | Clear, confident |
| Sage | Feminine | Calm, thoughtful |
| Violet | Feminine | Expressive, playful |
| Amber | Masculine | Steady, reassuring |
| Slate | Masculine | Deep, composed |

**Naming convention**: Voices are named by colors rather than human names, maintaining ambiguity and avoiding cultural assumptions about gender or identity.

### Implementation Timeline

- **v1.12.0 (Phase 6)**: TTS toggle appears in the overlay panel's "More" dropdown as a placeholder (non-functional)
- **v1.12.5**: Full TTS engine integration, voice selection UI, per-avatar voice storage, and Nano Banana 2 sprite maps all ship together as the avatar overhaul
