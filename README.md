<p align="center">
  <img src="src/assets/images/theroost.png" alt="The Roost" width="128" />
</p>

<h1 align="center">The Roost</h1>

<p align="center">
  <em>Where your games come home to roost</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.4.1-blue" alt="Version" />
  <img src="https://img.shields.io/badge/platform-Windows-0078D6" alt="Platform" />
  <img src="https://img.shields.io/badge/built_with-Tauri_v2-FFC131" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/license-GPL--3.0-green" alt="License" />
</p>

---

The Roost is a multi-launcher game library manager for Windows. It unifies your game collections from Steam, Epic, GOG, EA, Ubisoft Connect, and Battle.net into a single, customizable interface with rich statistics, session tracking, and an AI-powered command palette.

## Features

### Multi-Launcher Library
- **6 launcher integrations** &mdash; Import games from Steam, Epic Games Store, GOG Galaxy, EA App, Ubisoft Connect, and Battle.net
- **Custom games** &mdash; Add any game manually with its executable path, launch arguments, and description
- **Per-game launch mode** &mdash; Choose between launching via the native launcher or directly for non-Steam games

### Library Organization
- **Customizable shelves** &mdash; Organize your library with configurable sections (Recently Played, Favorites, All Games, custom presets) with per-shelf filters and sort
- **Two view modes** &mdash; Visual grid (3 sizes) with game artwork or compact sortable list (3 densities)
- **Rich filtering** &mdash; By genre, Steam tags, features, source launcher, custom tags, favorites, hidden, rated/unrated, and saved filter presets
- **Custom tags** &mdash; Create colored labels (15 theme-aware colors) to organize games your way
- **Cover art** &mdash; Automatic art from SteamGridDB and GOG CDN with manual selection picker

### Tracking & Statistics
- **Session tracking** &mdash; Automatic playtime monitoring via OS-level process detection with per-session history
- **Manual playtime** &mdash; Set or add playtime for non-Steam games; tracked sessions auto-accumulate
- **Personal ratings** &mdash; 5-star rating system with half-star precision and optional reviews
- **Activity dashboard** &mdash; Configurable card layout with 8 card types, drill-down charts, drag-and-drop reorder
- **Player profile** &mdash; Statistics and interactive Recharts charts (genre radar, playtime histogram, Metacritic scatter, leaderboards)
- **Game notes** &mdash; Per-game notepad and a general scratchpad, browseable from the `/notes` compendium

### System Overlay
- **Global hotkey HUD** &mdash; Ctrl+Space (configurable) opens a system-wide overlay, even while minimized to tray
- **5 floating panels** &mdash; Command center, game notes, system monitor (CPU/RAM/GPU sparklines), media controls, audio mixer
- **Draggable & lockable** &mdash; Each panel is freely positionable with collision detection and position persistence

### AI Command Palette
- **Pattern matcher** &mdash; Instant local AI resolves natural language queries ("installed RPGs sorted by playtime") into library actions
- **Cloud AI** &mdash; Optional Gemini Flash integration for recommendations and conversational queries
- **40+ searchable actions** &mdash; Navigation, themes, fonts, icon sets, view modes, sort, filter, settings shortcuts
- **Category prefixes** &mdash; Type "theme", "sort", "filter", or "go to" for focused results

### Customization
- **12 themes** &mdash; From light to dark, with cyber-neon, sakura, arctic frost, and more
- **6 icon sets** &mdash; Remix, Lucide, Heroicons, Ionicons, Font Awesome, Game Icons
- **4 font families** &mdash; System, Inter, Space Grotesk, Exo 2, JetBrains Mono
- **4 UI scales** &mdash; Minimal, Comfortable, Expanded, Large

### Infrastructure
- **Auto-updates** &mdash; OTA updates via GitHub Releases with in-app notification banner
- **System tray** &mdash; Minimize to tray with active session display and recently played quick-launch
- **Launch on startup** &mdash; Optional auto-start with Windows
- **Per-route error boundaries** &mdash; A crash in one page doesn't take down the whole app

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Tauri v2](https://v2.tauri.app/) |
| Backend | Rust (108 commands across 27 modules, SQLite via rusqlite) |
| Frontend | React 18, TypeScript, Vite |
| State | Zustand (18 slices) |
| Database | SQLite (bundled, WAL mode, schema v19) |
| Styling | CSS variables with theme system |
| Charts | Recharts |
| Drag & Drop | @dnd-kit |
| Testing | Vitest (366 tests) + Rust (212 tests) |

## Installation

Download the latest installer from [Releases](https://github.com/josh-g-it/TheRoost/releases). Run the installer to set up The Roost.

Existing installations can update in-app via **Settings > General > Check for Updates**.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Rust](https://rustup.rs/) (stable toolchain)
- Windows 10/11

### Setup

```bash
# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Testing

```bash
# Frontend tests (Vitest)
npx vitest run

# Rust tests
cd src-tauri && cargo test

# Linting
npx eslint .
cargo clippy -- -D warnings
cargo fmt --check
```

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE). You are free to use, modify, and distribute this software under the terms of the GPL-3.0. Any derivative work must also be open-sourced under the same license.
