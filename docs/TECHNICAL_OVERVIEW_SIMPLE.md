# The Roost — Technical Overview (Simple)

> **Audience**: Non-technical readers, project stakeholders, curious users
> **Last updated**: 2026-02-22 (Phase 12a complete)

---

## What Is The Roost?

The Roost is a desktop app for Windows that brings your entire PC game collection into one beautiful home. It connects to **Steam, Epic Games, GOG, EA App, Ubisoft Connect, and Battle.net** — or you can add any game manually. One app to browse, organize, launch, and track everything.

**Think of it like**: A universal dashboard for all your PC games — with a gaming-focused system overlay you can pull up anytime.

---

## How It Works (The Big Picture)

The Roost is built in two layers that talk to each other:

1. **The Backend (Rust)** — The engine under the hood. It scans your hard drives for installed games, talks to Steam and other services, tracks your play sessions, monitors system performance, and handles sensitive data securely.

2. **The Frontend (React)** — The part you see and interact with. It shows your game library, activity dashboard, player profile, notes, settings, and a system overlay you can use while gaming.

When you open The Roost, the frontend asks the backend for your games, settings, and profile info. The backend does the heavy lifting and sends results back.

---

## What Can It Do?

### Navigation & Command Center
- **Icon Rail**: A slim navigation bar on the left. Shows just icons when collapsed (48px) — hover to expand with labels (180px). Links to Library, Activity, Profile, Notes, Settings, and Debug.
- **Command Center** (Ctrl+K): A full-screen overlay with a search bar that doubles as a command palette — type to search for actions or games. Category prefixes like "theme", "sort", "filter", or "go to" instantly narrow results to that category. A `?` button shows a hints dropdown with available command categories you can click to autofill. Below the search: 6 customizable action slots + quick stats. Fully customizable layout.

### Game Library
- **Multi-launcher support**: Automatically detects games from Steam, Epic, GOG, EA App, Ubisoft, and Battle.net. Plus add any game manually with its executable path.
- **Two view modes**: Visual grid with game artwork (3 sizes) or compact sortable list (3 densities)
- **Shelves**: Organize your library into configurable sections ("Recently Played", "Favorites", "All Games", custom). Each shelf has its own filter/sort, and can be collapsed (Netflix-style scroll), extended (two rows), or expanded (full grid). Drag and drop to reorder.
- **Rich filtering**: By name, genre, Steam community tags, game features, source launcher, custom tags, favorites, hidden status. Save complex filter combos as presets. "Reset All Filters" command available in the palette.
- **Custom tags**: Create colored labels to organize games your way. 15 theme-aware colors that look right in any theme.
- **Favorites & hidden games**: Star games or hide them from view. Instant response with background sync.
- **Cover art**: Automatically fetched from SteamGridDB and GOG. Pick from multiple options via the art picker, or let the app choose.

### Game Details
Click any game to see:
- Play button, total playtime, stats, Metacritic score, developer/publisher
- Genre tags, Steam community tags, feature badges, your custom tags
- **Achievements**: Progress bar, unlocked/locked lists with global completion percentages
- **Quick Notes**: A per-game notepad for tracking your thoughts, strategies, progress
- **News**: Recent articles about the game from Steam
- Full description, screenshot gallery, session heatmap, and play history timeline
- Cover art picker (choose from SteamGridDB options)

### Activity Dashboard
A fully customizable page with drag-and-drop cards:
- **8 card types**: Quick Stats, Play Activity Heatmap, Daily Playtime chart, Most Played chart, Session Length distribution, Playtime by Day of Week, Recent Sessions timeline, Memories
- Each card supports half or full width, and has its own filter options (date range, specific game, tags, source)
- Click any chart element to drill down into the underlying sessions
- Drag cards to rearrange, add/remove as you like — your layout is saved

### Player Profile & Statistics
- Steam avatar, display name, country flag, account age
- Interactive charts: Genre DNA radar, Playtime distribution histogram, Metacritic scatter plot, Developer/Publisher leaderboard
- All charts adapt colors to your theme and offer customization options

### Notes
- A dedicated page showing all your game notes in one place
- General note (not tied to any game) pinned at top
- Create notes for any game, even ones you haven't written about yet

### System Overlay (Ctrl+Space)
A transparent, always-on-top HUD you can pull up while gaming:
- **Command Center**: Quick game launcher, favorites, library search, command hints dropdown. Theme/font/icon changes apply instantly without stealing focus from your game.
- **Game Notes**: Tabbed notepad for each active game
- **System Monitor**: CPU, RAM, GPU sparklines + active process list with End Task
- **Media Controls**: Play/pause, skip, track info from any media player. Carousel of saved bookmarks (YouTube playlists, etc.)
- **Audio Mixer**: Per-app volume and mute, master volume, output/input device switching, custom device names

Each panel is a floating window you can drag, resize, lock in place, or hide. Positions are remembered between sessions.

### Game Launching
- Click Play on any game — The Roost launches it through the appropriate launcher (Steam, Epic, etc.)
- Per-game launch mode: "via launcher" (opens Steam/Epic/etc.) or "direct" (runs the exe directly)
- Active sessions tracked automatically via process monitoring

### Settings
- Steam API key and account setup
- SteamGridDB API key for cover art
- **Theme Builder**: Mix and match 9 color palettes, 5 fonts, 6 icon styles, 4 UI scales — with instant preview
- Tag manager, card display settings, overlay shortcut configuration
- Minimize-to-tray option
- Developer section for advanced tools

### System Tray
- The Roost lives in your system tray when minimized
- Shows your currently active game
- Quick access to recent games and overlay toggle

### Debug Panel
A developer tool showing everything happening inside the app in real-time — events from both backend and frontend, color-coded, searchable, filterable, exportable.

---

## How Data Flows

### Finding Your Games

**Steam**: Reads Windows Registry to find Steam → reads Steam's library config files → finds all game folders → reads each game's manifest → gives you: game name, size, last update. At the same time, calls Steam's online API for playtime data. Merges both.

**Other launchers**: Reads their registry keys and config files to find installed games. Each launcher has its own scanner.

**Custom games**: You provide the executable path. The app registers it with a UUID and tracks it like any other game.

### Tracking Play Sessions

Every 5 seconds, The Roost checks what processes are running on your PC. When it detects a game launching, it starts tracking a session. When the game closes, it records the duration. This works for games from any launcher, not just Steam.

### Keeping Your API Keys Safe

Your API keys are **never** stored in plain text files. They live in **Windows Credential Manager** (the same secure vault Windows uses for your passwords). The settings file only contains non-sensitive preferences.

### Cover Art

The Roost automatically finds cover art for your games:
1. Checks its local cache first
2. For GOG games, tries GOG's image servers
3. For any game, searches SteamGridDB (a community art database)
4. Falls back to Steam's CDN

You can also pick a specific image from SteamGridDB's options via the art picker.

---

## Project Structure (Simplified)

```
TheRoost/
├── src/                    ← The user interface (what you see)
│   ├── components/         ← Visual building blocks
│   │   ├── layout/         ← App shell, icon rail, command center
│   │   ├── library/        ← Game grid, cards, details, shelves, cover art picker
│   │   ├── activity/       ← Activity dashboard (8 customizable card types)
│   │   ├── profile/        ← Player profile (4 interactive charts)
│   │   ├── sessions/       ← Reusable heatmap & timeline
│   │   ├── overlay/        ← System overlay panels (5 HUD panels)
│   │   ├── notes/          ← Notes compendium page
│   │   ├── settings/       ← Settings (theme builder, tags, bookmarks)
│   │   ├── common/         ← Shared UI pieces (buttons, icons, tags)
│   │   ├── setup/          ← First-time setup wizard
│   │   └── debug/          ← Developer debug panel
│   ├── hooks/              ← Reusable behaviors
│   ├── store/              ← App state (17 independent stores)
│   └── utils/              ← Helper functions (formatting, filtering, stats)
│
└── src-tauri/              ← The engine (behind the scenes)
    └── src/
        ├── commands/       ← 89 things the frontend can ask the backend to do
        ├── models/         ← Data shapes (48+ structs)
        ├── services/       ← Core logic (30 modules: APIs, database, monitoring,
        │                      audio, media, overlay, launcher scanners)
        └── utils/          ← Error handling
```

---

## Technology Choices (and Why)

| Choice | Why |
|--------|-----|
| **Tauri** (instead of Electron) | Much smaller app size, better performance, native security |
| **Rust** for the backend | Fast, safe, great for system access (processes, audio, GPU) |
| **React** for the UI | Popular, well-supported, great component model |
| **Zustand** for state | Simple, lightweight, no boilerplate |
| **SQLite** for local data | Fast, reliable local database (19 tables) — no server needed |
| **Windows Credential Manager** | Industry-standard secure storage for API keys |
| **Recharts** for charts | React-native charting for activity & profile dashboards |
| **@dnd-kit** for drag-and-drop | Accessible, performant drag-and-drop for activity cards |
| **CSS variables** for themes | Easy runtime theme switching without JavaScript overhead |
| **Windows WASAPI** for audio | Direct per-app volume control at the OS level |
| **NVML + PDH** for GPU | NVIDIA-specific + universal GPU monitoring |

---

## What's Coming Next

- **AI & Companion Features** (Phase 12): Smart game recommendations, discovery of hidden gems, achievement tracking suggestions, and possibly natural-language library queries.
- **Big Picture Mode**: Full-screen, controller-friendly interface for couch gaming.

---

## Glossary

| Term | Meaning |
|------|---------|
| **API** | A way for programs to talk to each other. The Roost uses Steam's API (and others) to get your game data. |
| **API key** | A password-like string that identifies your app when calling an API. |
| **Steam ID** | A unique 17-digit number identifying your Steam account. |
| **UUID** | Universally Unique Identifier — a long random string used as the primary identity for every game in The Roost's database. |
| **GameSource** | Which launcher a game comes from: Steam, Epic, GOG, EA App, Ubisoft Connect, Battle.net, or Manual. |
| **VDF** | Valve Data Format — Steam's proprietary config file format. |
| **Tauri** | A framework for building desktop apps using web technologies with a Rust backend. |
| **Zustand** | A small library for managing app state in React — the app's "memory". |
| **SQLite** | A lightweight database stored as a single file on your computer. The Roost uses it for all persistent data. |
| **Credential Manager** | Windows' built-in secure vault for passwords and API keys. |
| **SteamGridDB** | A community-run database of game artwork. The Roost uses it to find cover images. |
| **Heatmap** | A calendar grid (like GitHub's contribution graph) colored by intensity. |
| **SMTC** | System Media Transport Controls — Windows' built-in media playback system. |
| **WASAPI** | Windows Audio Session API — allows per-application volume control. |
| **NVML** | NVIDIA Management Library — for monitoring NVIDIA GPU stats. |
| **PDH** | Performance Data Helper — Windows API for system performance metrics. |
| **Shelf** | A configurable section of the library showing a filtered subset of games. |
| **FloatingPanel** | A draggable, resizable window in the overlay HUD. |
| **Overlay** | A transparent window that appears on top of your game, providing quick access to notes, media controls, system stats, and audio mixing. |
| **CSP** | Content Security Policy — security rules controlling which external resources the app can load. |
| **Optimistic update** | Showing a UI change immediately before the backend confirms it — rolls back if it fails. |
| **Launch mode** | How a game is started: "via launcher" (opens Steam/Epic/etc.) or "direct" (runs the exe). |
