<p align="center">
  <img src="src/assets/images/theroost.png" alt="The Roost" width="128" />
</p>

<h1 align="center">The Roost</h1>

<p align="center">
  <em>Where your games come home to roost</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.12.1-blue" alt="Version" />
  <img src="https://img.shields.io/badge/platform-Windows-0078D6" alt="Platform" />
  <img src="https://img.shields.io/badge/built_with-Tauri_v2-FFC131" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/license-GPL--3.0-green" alt="License" />
</p>

---

The Roost is a multi-launcher game library manager for Windows. It brings together your collections from Steam, Epic, GOG, EA, Ubisoft Connect, and Battle.net into a single customizable interface with rich statistics, session tracking, gaming recaps, and an AI-powered command palette.

## Features

### Library
- **6 launcher integrations** plus manual game entries with custom executables and launch arguments
- **Shelves** &mdash; Organize games into configurable sections with filters, sorting, and manual pins
- **Grid and list views** with multiple size/density options and cover art from SteamGridDB, GOG, or custom uploads
- **Rich filtering** by genre, tags, features, launcher, favorites, ratings, and saved presets
- **Custom tags** &mdash; Colored labels to organize games your way

### Tracking & Stats
- **Automatic session tracking** with per-session history and manual playtime entry for non-Steam games
- **Activity dashboard** &mdash; Customizable card layout with charts, heatmaps, and drill-down views
- **Player profile** &mdash; Interactive charts for genre breakdown, playtime trends, Metacritic scatter, and leaderboards
- **Personal ratings** &mdash; 5-star system with half-star precision and optional reviews
- **Game notes** &mdash; Per-game notepad and a general scratchpad

### Gaming Recaps
- **Monthly and yearly recaps** &mdash; Auto-generated summaries with Game of the Month/Year, top games, genre breakdown, play streaks, and session stats
- **Achievement highlights** &mdash; Rarest achievements unlocked during the period
- **Fun comparisons** &mdash; Your playtime translated into relatable activities ("That's 12 flights from NYC to Tokyo")

### News Feed
- **Aggregated articles** from games you've favorited or recently played
- **In-app reading** with full article rendering, game and source filters, and read tracking
- **Per-source filtering** &mdash; Block unwanted news sources in Settings

### System Overlay
- **Global hotkey HUD** (Ctrl+Space) with floating panels for quick commands, game notes, system monitor, media controls, and audio mixer

### AI Assistant
- **Persistent assistant bubble** &mdash; Always-accessible chat panel with auto-executing actions
- **Natural language search** &mdash; "installed RPGs sorted by playtime" resolves instantly into library actions
- **Optional cloud AI** (Gemini Flash) for recommendations, conversational queries, and game journals
- **40+ actions** for navigation, themes, fonts, icon sets, view modes, sorting, and more
- **Memory vault** &mdash; AI remembers your preferences and past conversations across sessions

### Storage Overview
- **Per-drive breakdown** &mdash; Visual bars showing total, game, and free space on each drive
- **Games by size** &mdash; Horizontal bar chart of your largest installs, sorted by disk usage
- **Storage by launcher** &mdash; Donut chart breaking down space by Steam, Epic, GOG, and more

### Backup & Restore
- **Full backups** &mdash; One-click export of your database, settings, and custom art into a single `.roost` file
- **Guided restore** &mdash; 4-step wizard validates your backup, checks for active sessions, and re-enters API keys
- **Safety net** &mdash; Automatic pre-restore backup with rollback on failure

### Customization
- 9 color palettes, 6 icon sets, 5 font families, 4 UI scales
- Auto-updates, system tray with session display, and optional launch on startup

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Tauri v2](https://v2.tauri.app/) |
| Backend | Rust, SQLite (rusqlite) |
| Frontend | React 18, TypeScript, Vite |
| State | Zustand |
| Charts | Recharts |
| Testing | Vitest + Rust unit tests (1,406 total) |

## Installation

Download the latest installer from [Releases](https://github.com/josh-g-it/TheRoost/releases). Existing installations update in-app via **Settings > General > Check for Updates**.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Rust](https://rustup.rs/) (stable toolchain)
- Windows 10/11

### Setup

```bash
npm install
npm run tauri dev
```

### Testing

```bash
# Frontend
npx vitest run

# Rust
cd src-tauri && cargo test

# Linting
npx eslint .
cargo clippy -- -D warnings
cargo fmt --check
```

## License

[GNU General Public License v3.0](LICENSE)
