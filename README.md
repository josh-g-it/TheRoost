<p align="center">
  <img src="src/assets/images/theroost.png" alt="The Roost" width="128" />
</p>

<h1 align="center">The Roost</h1>

<p align="center">
  <em>Where your games come home to roost</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.1.0-blue" alt="Version" />
  <img src="https://img.shields.io/badge/platform-Windows-0078D6" alt="Platform" />
  <img src="https://img.shields.io/badge/built_with-Tauri_v2-FFC131" alt="Tauri v2" />
</p>

---

The Roost is a multi-launcher game library manager for Windows. It unifies your game collections from Steam, Epic, GOG, EA, Ubisoft Connect, and Battle.net into a single, customizable interface with rich statistics, session tracking, and an AI-powered command palette.

## Features

- **Multi-launcher support** &mdash; Import games from Steam, Epic Games Store, GOG Galaxy, EA App, Ubisoft Connect, and Battle.net
- **Session tracking** &mdash; Automatic playtime monitoring with per-session history and statistics
- **System overlay** &mdash; Global hotkey overlay with game notes, system monitor, media controls, and audio mixer
- **AI command palette** &mdash; Pattern-matched local commands plus optional cloud AI assistant (Gemini Flash) for natural language queries
- **Customizable shelves** &mdash; Organize your library with drag-and-drop shelves, custom tags, and bookmarks
- **Activity dashboard** &mdash; Configurable card layout showing recent sessions, playtime stats, achievements, and news
- **Player profile** &mdash; Statistics and charts powered by Recharts
- **Cover art** &mdash; Automatic art from SteamGridDB and GOG CDN with manual selection
- **Theming** &mdash; 12 themes, 6 icon sets, 4 font families, adjustable UI scale
- **Auto-updates** &mdash; OTA updates delivered through GitHub Releases
- **Custom games** &mdash; Add non-launcher games with custom executables and launch arguments

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Tauri v2](https://v2.tauri.app/) |
| Backend | Rust (commands, services, SQLite via rusqlite) |
| Frontend | React 18, TypeScript, Vite |
| State | Zustand |
| Database | SQLite (bundled, WAL mode) |
| Styling | CSS variables with theme system |

## Installation

Download the latest installer from [Releases](https://github.com/josh-g-it/TheRoost/releases). Run `TheRoost.exe` to install.

Existing installations (v1.1.0+) can update in-app via **Settings > Application > Check for Updates**.

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
```

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE). You are free to use, modify, and distribute this software under the terms of the GPL-3.0. Any derivative work must also be open-sourced under the same license.
