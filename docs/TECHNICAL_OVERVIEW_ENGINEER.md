# The Roost — Technical Overview (Engineer)

> **Audience**: AI assistants, senior developers, contributors
> **Last updated**: 2026-02-24
> **Version**: 1.4.0 (Manual playtime entry)

---

## 1. Identity & Stack

| Key | Value |
|-----|-------|
| App name | The Roost |
| Tagline | "Where your games come home to roost" |
| Package | `the-roost` (npm + cargo) |
| Tauri ID | `app.theroost` |
| Framework | Tauri v2 (Rust) + React 18 + TypeScript + Vite |
| State | Zustand (18 slices) |
| Routing | React Router v6 data router (`createBrowserRouter`) |
| Database | SQLite via rusqlite (bundled), WAL mode, schema v19 |
| Platform | Windows 11 (registry, credential manager, WASAPI, SMTC, NVML, PDH) |
| Launch | `npm run tauri dev` |

---

## 2. Directory Structure

```
TheRoost/
├── src/                          # React frontend
│   ├── main.tsx                  # Entry — ErrorBoundary wrapper
│   ├── App.tsx                   # Router + hook initialization
│   ├── overlay-main.tsx          # Overlay entry — ErrorBoundary + OverlayApp
│   ├── OverlayApp.tsx            # Overlay orchestrator (panels, settings, data loading)
│   ├── constants.ts              # APP_NAME, APP_VERSION, MAX_LOG_EVENTS
│   │
│   ├── assets/
│   │   ├── fonts/                # WOFF2 web fonts (Inter, Space Grotesk, Exo 2, JetBrains Mono)
│   │   └── styles/
│   │       ├── reset.css
│   │       ├── index.css
│   │       ├── themes.css            # Shared design tokens + @import for fonts.css
│   │       ├── fonts.css             # @font-face declarations for bundled fonts
│   │       ├── ui-scale.css          # UI scale overrides via html[data-ui-scale] selectors
│   │       └── themes/              # 9 theme files ([data-theme] selectors)
│   │
│   ├── components/
│   │   ├── common/               # AppIcon, Button, Input, LoadingSpinner, ErrorBoundary,
│   │   │                         #   RouteErrorFallback, GenreTag, StatCard, UserTag,
│   │   │                         #   DrillDownOverlay, EmojiPicker, StarRating
│   │   ├── layout/               # AppLayout, IconRail, Header, CommandCenter,
│   │   │                         #   CommandSlot, CommandPaletteResults, UpdateBanner,
│   │   │                         #   ThemePickerPopover, QuickStatsPopover,
│   │   │                         #   RandomGamePopover, TagFilterPopover
│   │   ├── library/              # LibraryView, LibraryControls, GameGrid, GameList,
│   │   │                         #   GameCard, GameListItem, GameDetail, GameImage,
│   │   │                         #   Shelf, ShelfHeader, ShelfEditorDialog, HorizontalScrollRow,
│   │   │                         #   SavedFilterChips, CardDisplayPopover, CoverArtPicker,
│   │   │                         #   AchievementSection, TagPicker, AddCustomGameDialog,
│   │   │                         #   BackgroundTaskBanner, WelcomeDialog,
│   │   │                         #   SourceFilterPopover, SteamTagFilterPopover,
│   │   │                         #   CategoryFilterPopover
│   │   ├── activity/             # ActivityView (customizable card layout with dnd-kit),
│   │   │                         #   NowPlayingBanner, CardMenu, AddCardButton,
│   │   │                         #   SessionDrillDown, ChartFilterMenu, MemoriesCard,
│   │   │                         #   charts/ (DailyPlaytimeChart, MostPlayedChart,
│   │   │                         #     SessionLengthDistribution, PlaytimeByDayOfWeek)
│   │   ├── profile/              # ProfileView, ProfileHeader, ChartCard, ChartToolbar,
│   │   │                         #   ProfileDrillDown,
│   │   │                         #   charts/ (GenreDNARadar, PlaytimeDistribution,
│   │   │                         #     MetacriticScatter, DevPublisherLeaderboard,
│   │   │                         #     utils/useChartColors)
│   │   ├── sessions/             # SessionHeatmap, SessionTimeline
│   │   ├── settings/             # SettingsView, ThemeBuilder, TagManager,
│   │   │                         #   CardDisplaySettings, DeveloperSettings, BookmarkManager
│   │   ├── notes/                # NotesView (all-game notes compendium)
│   │   ├── overlay/              # FloatingPanel, OverlayBackdrop, OverlayWindowManager,
│   │   │                         #   OverlayCommandCenter, OverlayGameNotes,
│   │   │                         #   OverlaySystemMonitor, OverlayMediaControls,
│   │   │                         #   OverlayAudioMixer, OverlayTagFilter, Sparkline,
│   │   │                         #   utils/ (overlayPanelRegistry, panelCollision)
│   │   ├── setup/                # FirstRunSetup (4-step wizard)
│   │   └── debug/                # DebugPanel (log viewer + dashboard)
│   │
│   ├── hooks/
│   │   ├── useSettings.ts        # Auto-loads settings, syncs to stores
│   │   ├── useSteamLibrary.ts    # Auto-loads library, mode detection
│   │   ├── useGameLaunch.ts      # launch() with cooldown
│   │   ├── useTheme.ts           # data-theme + --font-family + data-ui-scale + THEMES metadata
│   │   ├── useDrillDown.ts       # Generic modal state (open, close, context)
│   │   ├── useTrayListener.ts    # Tray event listener (navigate on tray clicks)
│   │   └── useDebugListener.ts   # Tauri event listener for Rust logs
│   │
│   ├── store/                    # 18 Zustand slices (see §4.2)
│   ├── services/
│   │   └── tauri.ts              # invoke() wrappers — 20 API namespaces (see §4.6)
│   │
│   ├── types/                    # 21 type files (see §4.5)
│   ├── utils/                    # icons, logger, errors, formatters, sorting, filtering,
│   │                             #   shelfFiltering, commandPalette, streaks,
│   │                             #   profileStats, activityStats
│   └── test/
│       ├── setup.ts              # Vitest + jsdom + Tauri API mocks
│       └── factories.ts          # Shared test factories (makeGame, makeMeta, makeShelf, etc.)
│
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json          # Permissions: shell, dialog, global-shortcut, window, updater, autostart
│   │
│   └── src/
│       ├── main.rs               # Entry → lib::run()
│       ├── lib.rs                # Tauri setup, tracing init, 108 commands, background services
│       │
│       ├── commands/             # 28 command modules, 108 total commands (see §3.1)
│       │   ├── steam_scanner.rs, steam_api.rs, settings.rs, game_launcher.rs
│       │   ├── metadata.rs, sessions.rs, tags.rs, favorites.rs
│       │   ├── hidden_games.rs, saved_filters.rs, developer.rs
│       │   ├── external_scanner.rs, cover_art.rs, custom_games.rs
│       │   ├── achievements.rs, friends.rs, news.rs
│       │   ├── overlay.rs, notes.rs, ratings.rs, system_monitor.rs
│       │   ├── media_controls.rs, media_bookmarks.rs, audio.rs
│       │   ├── ai.rs, updater.rs, autostart.rs
│       │   └── mod.rs
│       │
│       ├── models/               # 20 model files, 50+ structs (see §3.3)
│       │   ├── game.rs, settings.rs, metadata.rs, session.rs, tag.rs
│       │   ├── saved_filter.rs, steam_api.rs, store_api.rs, log_event.rs
│       │   ├── achievement.rs, friend.rs, news.rs, note.rs, rating.rs
│       │   ├── media_session.rs, media_bookmark.rs, audio.rs, system_metrics.rs
│       │   └── mod.rs
│       │
│       ├── services/             # 39 service modules (see §3.5)
│       │   ├── cache_db.rs       # SQLite: schema v17, 19 tables, WAL mode
│       │   ├── steam_client.rs   # Shared HTTP client (OnceLock, 15s timeout, sanitized errors)
│       │   ├── store_client.rs, steamspy_client.rs, steamgriddb.rs
│       │   ├── metadata_service.rs, achievement_service.rs
│       │   ├── friends_service.rs, news_service.rs, cover_art.rs
│       │   ├── settings_store.rs, credential_store.rs
│       │   ├── registry.rs, vdf_parser.rs, log_bridge.rs
│       │   ├── process_monitor.rs, gpu_monitor.rs, library_sync.rs
│       │   ├── overlay.rs, tray.rs
│       │   ├── media_controls.rs, audio_control.rs
│       │   ├── launchers/ (mod, epic, gog, ea, ubisoft, battlenet)
│       │   ├── ai/ (mod, orchestrator, pattern_matcher, context_builder, types,
│       │   │        cloud_resolver, cloud_provider, gemini_provider,
│       │   │        cloud_config, cloud_cache)
│       │   └── mod.rs
│       │
│       └── utils/
│           ├── mod.rs
│           └── error.rs          # AppError enum → { code, message } JSON
```

---

## 3. Rust Backend

### 3.1 Command Registry (lib.rs)

108 Tauri commands across 28 modules:

| Module | Commands |
|--------|----------|
| `steam_scanner` | `scan_local_library`, `get_full_library` |
| `steam_api` | `fetch_owned_games`, `fetch_recent_games`, `fetch_player_summary`, `resolve_steam_account` |
| `settings` | `load_settings`, `save_settings` |
| `game_launcher` | `launch_game`, `get_launch_mode`, `set_launch_mode` |
| `metadata` | `fetch_game_metadata`, `fetch_library_metadata`, `invalidate_metadata_cache`, `backfill_steam_tags`, `backfill_store_details` |
| `sessions` | `get_game_sessions`, `get_recent_sessions`, `get_active_sessions` |
| `tags` | `get_all_tags`, `create_tag`, `update_tag`, `delete_tag`, `reorder_tags`, `set_game_tags`, `get_game_tag_ids`, `get_all_game_tags`, `bulk_add_tag` |
| `favorites` | `toggle_favorite`, `get_all_favorites` |
| `hidden_games` | `toggle_hidden`, `get_all_hidden` |
| `saved_filters` | `save_filter`, `get_all_saved_filters`, `delete_saved_filter` |
| `developer` | `clear_all_data` |
| `external_scanner` | `scan_external_games` |
| `cover_art` | `get_cover_art_url`, `fetch_cover_art_batch`, `store_sgdb_api_key`, `get_sgdb_key_status`, `delete_sgdb_api_key`, `get_cover_art_options`, `set_cover_art` |
| `custom_games` | `add_custom_game`, `remove_custom_game`, `update_custom_game` |
| `achievements` | `fetch_game_achievements`, `get_all_achievement_stats`, `batch_fetch_achievements`, `clear_achievement_cache` |
| `friends` | `fetch_friends_list`, `fetch_friend_library` |
| `news` | `fetch_game_news`, `fetch_followed_games` |
| `overlay` | `toggle_overlay`, `hide_overlay`, `show_main_and_navigate`, `overlay_select_game`, `update_overlay_shortcut`, `get_overlay_library`, `overlay_apply_tag_filter`, `notify_settings_changed`, `overlay_execute_palette_action` |
| `notes` | `get_game_note`, `save_game_note`, `delete_game_note`, `get_all_notes_with_content` |
| `ratings` | `get_game_rating`, `save_game_rating`, `delete_game_rating`, `get_all_ratings` |
| `system_monitor` | `get_system_metrics`, `kill_game_process` |
| `media_controls` | `get_media_session`, `media_toggle_play_pause`, `media_skip_next`, `media_skip_previous` |
| `media_bookmarks` | `get_media_bookmarks`, `add_media_bookmark`, `update_media_bookmark`, `delete_media_bookmark`, `reorder_media_bookmarks`, `open_media_bookmark` |
| `audio` | `get_audio_snapshot`, `set_session_volume`, `set_session_mute`, `set_master_volume`, `set_master_mute`, `set_default_output_device`, `set_default_input_device`, `set_audio_device_alias`, `delete_audio_device_alias`, `set_audio_session_hidden` |
| `ai` | `ai_resolve_intent`, `ai_cloud_resolve`, `store_cloud_api_key`, `delete_cloud_api_key`, `get_cloud_api_key_status`, `test_cloud_api_key`, `get_cloud_ai_usage`, `update_cloud_ai_settings` |
| `updater` | `check_for_update`, `install_update`, `get_app_version` |
| `autostart` | `get_autostart_enabled`, `set_autostart_enabled` |

### 3.2 Background Services (started in lib.rs setup)

| Service | Interval | Purpose |
|---------|----------|---------|
| `process_monitor` | 5 sec | Detect game launches/exits via exe matching; track active sessions; emit CPU/GPU/RAM metrics per process; manage system tray |
| `library_sync` | 30 min | Poll Steam API for owned games; register new games; record playtime snapshots; cleanup old snapshots (30-day TTL) |
| `overlay` | On shortcut | Create/toggle overlay window; register global shortcut (default Ctrl+Space) |
| `tray` | On session change | System tray icon with context menu showing active game, recent games |

### 3.3 Game Identity Model

Games use a UUID primary key (`game_id`) + a `GameSource` enum + `source_id`:

```rust
pub enum GameSource { Steam, Manual, Epic, Gog, EaApp, UbisoftConnect, BattleNet }
```

The `games` table stores `game_id TEXT PRIMARY KEY, source TEXT, source_id TEXT` with a unique index on `(source, source_id)`. This allows the same game to exist from different launchers without collisions. All foreign keys reference `game_id` (UUID), not the source-specific ID.

### 3.4 Local Library Scanning Pipeline

**Steam** (primary):
```
Windows Registry (HKLM/HKCU)
  → Steam install path
    → libraryfolders.vdf (VDF parser)
      → Library folder paths[]
        → steamapps/appmanifest_*.acf (VDF parser)
          → LocalGameInfo { appid, name, installDir, sizeOnDisk, lastUpdated }
```

**External launchers** (`scan_external_games` aggregator):

| Launcher | Scanner | Detection Method |
|----------|---------|------------------|
| Epic | `launchers/epic.rs` | `%ProgramData%/Epic/EpicGamesLauncher/Data/Manifests/*.item` JSON |
| GOG | `launchers/gog.rs` | Registry keys + manifest files |
| EA App | `launchers/ea.rs` | Registry + install paths |
| Ubisoft | `launchers/ubisoft.rs` | Registry + configuration |
| Battle.net | `launchers/battlenet.rs` | Registry + known product IDs |

All scanners register games into the unified UUID-based `games` table with their respective `GameSource`.

### 3.5 HTTP Client Architecture

**Shared Steam client** (`steam_client.rs`):
- `OnceLock<reqwest::Client>` with 15-second timeout
- `sanitize_steam_error()` — converts reqwest errors to `AppError::StoreApi` without leaking API keys
- `steam_get_json<T>()` / `steam_get_raw()` — used by `steam_client`, `achievement_service`, `friends_service`, `news_service`
- API keys passed via `.query()` builder (never interpolated into URL strings)

**Other clients** with their own `reqwest::Client::builder().timeout()`:
- `store_client.rs` — Steam Store API (10s timeout)
- `steamspy_client.rs` — SteamSpy API (10s timeout, exponential backoff)
- `steamgriddb.rs` — SteamGridDB API (10s timeout, 500ms batch delay)

### 3.6 Credential Security

- `credential_store.rs`: `keyring` crate with `windows-native` feature
- Service name: `app.theroost`
- Accounts: `steam_api_key`, `sgdb_api_key`, `cloud_ai_gemini` (Gemini API key)
- API keys **never** written to `settings.json` — `save_settings()` strips them before write, `load_settings()` injects from credential manager after read

### 3.7 SQLite Schema (cache_db.rs)

**Current schema version: v18** — Location: `%APPDATA%/app.theroost/theroost.db`

20 tables:

| Table | Purpose | PK |
|-------|---------|-----|
| `games` | Game registry (UUID identity) | `game_id TEXT` |
| `game_executables` | Known exe paths per game | `id INTEGER` |
| `game_images` | Cached cover art (grid, hero, logo) | `(game_id, image_type)` |
| `store_metadata` | Game metadata cache (7-day TTL) | `game_id TEXT` |
| `playtime_snapshots` | Playtime history for trends | `id INTEGER` |
| `game_sessions` | Play sessions (start/end/duration) | `id INTEGER` |
| `tags` | User-defined tags | `id INTEGER` |
| `game_tags` | Tag assignments (many-to-many) | `(game_id, tag_id)` |
| `favorites` | Favorited games | `game_id TEXT` |
| `hidden_games` | Hidden games | `game_id TEXT` |
| `saved_filters` | Library filter presets | `id TEXT` |
| `game_achievements` | Achievement cache (1-day TTL) | `(game_id, api_name)` |
| `game_achievement_freshness` | Last achievement check timestamp | `game_id TEXT` |
| `game_news` | News cache (1-hour TTL) | `(game_id, news_id)` |
| `game_notes` | Per-game notes | `game_id TEXT` |
| `media_bookmarks` | User media bookmarks | `id TEXT` |
| `audio_device_aliases` | Custom audio device names | `device_id TEXT` |
| `audio_session_prefs` | Per-exe audio visibility prefs | `exe_name TEXT` |
| `game_ratings` | Personal ratings + reviews | `game_id TEXT` |

Database features: WAL mode, foreign keys enforced, 7 indexes for query performance.

Migration system checks `user_version` pragma and applies incremental migrations v1→v18.

### 3.8 Process Monitor & Session Tracking

`process_monitor.rs` — polls every 5 seconds:

1. **Two-tier exe matching**: Fast path checks running process exe names against `game_executables` table. Slow path falls back to install directory prefix matching.
2. **Session lifecycle**: Detects game start → creates `game_sessions` row (end_time = NULL). Detects game exit → closes session with duration.
3. **System metrics**: Tracks CPU%, RAM, GPU% (via `gpu_monitor.rs`) per process. Maintains rolling history for sparklines.
4. **Tray refresh**: Spawns tray menu rebuild as background task (never blocks scan cycle).
5. **Events**: Emits `session-update` to both main window and overlay.

**GPU monitoring** (`gpu_monitor.rs`):
- NVIDIA: `nvml-wrapper` crate for VRAM usage + GPU utilization
- All vendors: Windows PDH (Performance Data Helper) for GPU engine %
- Graceful fallback if neither available

### 3.9 Cover Art System

`cover_art.rs` + `steamgriddb.rs`:

Resolution order:
1. Check `game_images` table for cached URL (skip TTL check if `user_selected = true`)
2. For GOG games: try GOG CDN (`api.gog.com/products/{id}`)
3. For any game: try SteamGridDB API (search by name → fetch grid/hero/logo)
4. Fallback to Steam CDN URL (constructed from source_id)

Art picker: `get_cover_art_options` returns multiple image options from SteamGridDB; `set_cover_art` stores with `user_selected = true` (immune to TTL expiry).

### 3.10 Overlay System

`overlay.rs`:
- Creates a second webview window (`overlay.html`) that covers the full primary monitor
- Transparent, always-on-top, no decorations, skip-taskbar
- Auto-hides on focus loss
- Global shortcut (default Ctrl+Space, configurable) toggles visibility
- Cross-window communication via `emit_to("main", ...)` — NEVER broadcast

### 3.11 Audio & Media

**Audio mixer** (`audio_control.rs`):
- Windows WASAPI COM interfaces: `IAudioSessionManager2`, `ISimpleAudioVolume`, `IAudioEndpointVolume`
- Per-app volume control + mute toggle
- Device enumeration + switching via `IPolicyConfig`
- Custom device aliases stored in SQLite

**Media controls** (`media_controls.rs`):
- Windows SMTC (System Media Transport Controls)
- Play/pause, skip next/previous
- Session snapshot: title, artist, album, playback status

### 3.12 Error Handling (error.rs)

```rust
enum AppError {
    Io(std::io::Error),
    Parse(String),
    NotFound(String),
    Http(reqwest::Error),
    Credential(String),
    Database(rusqlite::Error),
    StoreApi(String),
    Validation(String),
    LockPoisoned(String),
}
```

Serializes to `{ "code": "IO_ERROR", "message": "..." }`. Frontend consumes via `getErrorMessage()` in `utils/errors.ts`.

**MutexExt trait** (`error.rs`): `db.lock_or_err("DB")?` replaces 55+ manual `.lock().map_err(...)` patterns across all command and service files.

### 3.13 Logging Bridge (log_bridge.rs)

```
tracing::info!(key = value, "message")
  → TauriLogLayer::on_event()
    → FieldVisitor extracts structured fields
    → LogEvent { id, timestamp, level, source, category, message, origin: "rust", metadata }
      → app_handle.emit("log-event", event)
        → Frontend listener → debugSlice
```

Category auto-detection from module target (e.g., `steam_client` → `api`, `session` → `activity`, `overlay` → `overlay`).

### 3.14 Auto-Updates & Autostart

**Updater** (`commands/updater.rs`):
- `tauri-plugin-updater` v2 — checks GitHub Releases `latest.json` endpoint
- Ed25519 signature verification: public key in `tauri.conf.json`, private key in CI secrets
- `check_for_update()` returns `UpdateInfo { version, body, date }` or `None`
- `install_update()` downloads, verifies signature, installs, and restarts the app
- `get_app_version()` returns current version from Tauri config

**Autostart** (`commands/autostart.rs`):
- `tauri-plugin-autostart` v2 — registers with Windows startup via `LaunchAgent`
- `get_autostart_enabled()` / `set_autostart_enabled(bool)` — simple toggle

**CI/CD** (`.github/workflows/`):
- `release.yml`: triggered on `v*` tags — builds NSIS installer + `.nsis.zip` + `.sig`, generates `latest.json` with correct signature and URL-encoded download links, creates GitHub Release
- `ci.yml`: triggered on master pushes — ESLint, `tsc --noEmit`, `cargo fmt --check`, `cargo clippy -D warnings`, `npx vitest run`, `cargo test`

### 3.15 Key Dependencies (Cargo.toml)

| Dependency | Version | Purpose |
|------------|---------|---------|
| `tauri` | 2 | Framework + tray-icon |
| `tauri-plugin-shell` | 2 | Process launching |
| `tauri-plugin-dialog` | 2 | File dialogs |
| `tauri-plugin-global-shortcut` | 2 | Overlay hotkey |
| `tauri-plugin-updater` | 2 | Auto-updates (OTA) |
| `tauri-plugin-autostart` | 2 | Launch on startup |
| `reqwest` | 0.12 | HTTP client (JSON feature) |
| `rusqlite` | 0.32 | SQLite (bundled) |
| `keyring` | 3 | Windows Credential Manager |
| `sysinfo` | 0.33 | Process monitoring |
| `nvml-wrapper` | 0.12 | NVIDIA GPU monitoring |
| `windows` | 0.62 | Windows FFI (PDH, WASAPI, COM) |
| `tokio` | 1 | Async runtime |
| `serde` / `serde_json` | 1 | Serialization |
| `tracing` / `tracing-subscriber` | 0.1 / 0.3 | Structured logging |
| `chrono` | 0.4 | Date/time |
| `uuid` | 1 | UUID v4 generation |
| `winreg` | 0.52 | Windows Registry |
| `thiserror` | 2 | Error derive |
| `open` | 5 | Open URLs in browser |
| `futures` | 0.3 | Async utilities |

---

## 4. React Frontend

### 4.1 Entry & Routing (App.tsx)

```
main.tsx → ErrorBoundary → App
  App:
    useSettings()         — auto-loads settings, syncs stores
    useTheme()            — applies data-theme attribute
    useDebugListener()    — listens for Rust log events

    if settings.isFirstRun → <FirstRunSetup />
    else → <RouterProvider router={dataRouter} />

  Routes (all content routes have errorElement: <RouteErrorFallback />):
    /          → redirect to /library
    /library   → LibraryView
    /activity  → ActivityView
    /profile   → ProfileView
    /notes     → NotesView
    /settings  → SettingsView
    /debug     → DebugPanel
    *          → redirect to /library (catch-all)
```

**Critical**: Must use `createBrowserRouter` (data router), not `<BrowserRouter>`. Required for `useBlocker` in SettingsView.

**Route error boundaries**: Each content route has `errorElement: <RouteErrorFallback />`. Crashes render the fallback in-place via `<Outlet />`, keeping `AppLayout` (IconRail, UpdateBanner) intact. Layout-level crashes bubble to the global `ErrorBoundary` in `main.tsx`.

**Overlay** (`overlay-main.tsx`): Separate React app with `ErrorBoundary` → `OverlayApp`. No router, no Zustand. Loads its own data via direct `invoke()` calls.

### 4.2 State Management (Zustand)

18 independent stores:

| Slice | Key State | Purpose |
|-------|-----------|---------|
| `settingsSlice` | `settings`, `isLoading` | Load/save AppSettings |
| `librarySlice` | `library`, `isLoading` | Game collection + refresh |
| `uiSlice` | `viewMode`, `sortBy`, `filters`, `selectedGameId`, `cardDisplay`, `artPickerGameId` | UI state (sync, no async) |
| `sessionSlice` | `gameSessions`, `recentSessions`, `activeSessions` | Play session history |
| `metadataSlice` | `cache: Map<gameId, StoreMetadata>` | Metadata cache + batch fetch |
| `tagsSlice` | `tags[]`, `gameTagMap: Map<gameId, tagIds>` | Tag CRUD + assignments |
| `favoritesSlice` | `favorites: Set<gameId>` | Optimistic toggle w/ rollback |
| `hiddenGamesSlice` | `hiddenGames: Set<gameId>` | Optimistic toggle w/ rollback |
| `savedFiltersSlice` | `savedFilters[]` | Filter preset CRUD |
| `shelvesSlice` | `shelves[]`, `editingShelfId` | Shelf CRUD + reorder |
| `metadataSlice` | `cache: Map` | Store metadata cache |
| `achievementsSlice` | `cache: Map<gameId, Summary>`, `profileStats` | Achievement cache + batch fetch |
| `newsSlice` | `cache: Map<gameId, NewsItem[]>`, `followedGameIds` | News cache |
| `friendsSlice` | `friends[]`, `friendLibraries: Map` | Friends + library comparison |
| `notesSlice` | `notes[]` | Game notes CRUD |
| `ratingsSlice` | `ratings: Map<gameId, GameRating>` | Personal ratings + reviews |
| `activityLayoutSlice` | `cards: ActivityCardConfig[]`, `isEditMode` | Customizable activity page layout |
| `backgroundTasksSlice` | `activeTasks`, `progress: Map` | Background task progress tracking |
| `debugSlice` | `events[]` (2000 max circular buffer) | Log event capture |

### 4.3 Key Components

**LibraryView** — Shelf-based library orchestrator
- Renders vertical stack of `Shelf` components, each with pre-processed games via `processShelfGames`
- Triggers batch metadata fetch pipeline on load (SteamSpy-first, then Store API backfill)
- Module-level `batchFetchStarted` flag with try/catch reset on failure
- Loads tags, favorites, hidden games, saved filters on mount

**ActivityView** — Customizable card dashboard (Phase 10)
- Drag-and-drop layout via `@dnd-kit/core` + `@dnd-kit/sortable`
- 8 card types: quick-stats, heatmap, daily-playtime, most-played, session-length, playtime-by-day, recent-sessions, memories
- Cards support half/full width, per-card filter options (date range, game, tags, source)
- Session drill-down overlay for exploring filtered data
- Layout persisted in `AppSettings.activityLayout`

**GameDetail** — Full game detail modal
- Two-column layout: sidebar (play button, stats, personal rating + review, Metacritic, developer, genres) + main (description, screenshots, achievements, notes, sessions)
- Achievement section with progress bar and unlocked/locked lists
- Quick Notes section for per-game notepad
- News section with recent articles
- Cover art picker (SteamGridDB integration)
- Tags section with TagPicker

**OverlayApp** — Floating HUD system
- 5 panels: Command Center, Game Notes, System Monitor, Media Controls, Audio Mixer
- Each panel is a `FloatingPanel` (draggable, lockable, resizable)
- `OverlayWindowManager` — HUD bar at top with panel toggles
- Bidirectional settings sync via `notify_settings_changed` (emits to both "main" and "overlay")
- `useSettingsStore` partially hydrated in overlay for shared components (`AppIcon`)
- Debounce guard on `loadData()` to prevent tokio thread exhaustion

**OverlayCommandCenter** — Command palette in overlay
- Full palette search with category prefix matching (see §4.8)
- Hints dropdown (`?` button) with 6 click-to-autofill categories
- `actionNeedsMainWindow()` determines whether executing an action shows/focuses main window
- Cross-window relay: `overlay_execute_palette_action(action_id, game_id, show_main)` → Rust emits to main → main executes with real Zustand stores

**GameImage** — Multi-CDN fallback image loader
- Tries `game_images` table → Steam CDN URLs (header, capsule, hero, library capsule) → placeholder
- Module-level `Map<string, string>` cache with 1000-entry FIFO eviction
- Skeleton loading with shimmer animation

### 4.4 Theme & Customization System

Four independent dimensions: palette, font, icons, UI scale.

**Palettes (9)**: dark-gaming (default), fae, midnight-purple, cyber-neon, arctic-frost, ember-forge, ocean-depths, sakura, verdant

**Fonts (5)**: System Default, Inter, Space Grotesk, Exo 2, JetBrains Mono

**Icon Sets (6)**: default/Remix, minimal/Lucide, heroic/Heroicons2, playful/Ionicons5, classic/FA6 (**app default**), fantasy/GameIcons

**UI Scale (4)**: minimal, comfortable (default), expanded, large

Applied via:
- `[data-theme]` selectors on `<html>` for palette colors
- `--font-family` CSS variable for font
- `[data-ui-scale]` attribute on `<html>` for spacing/sizing (specificity 0,1,1 beats `:root` 0,1,0)
- `AppIcon` component resolves icons via `getIcon(name, iconSetId)`

Tag color palette: 15 CSS variables per theme (`--tag-color-0` through `--tag-color-14`).

### 4.5 Types (21 files)

Key type definitions in `src/types/`:

| File | Key Exports |
|------|-------------|
| `game.ts` | `GameSource` (7 variants), `Game`, `GameLibrary`, `LaunchMode`, `PlayerSummary`, `GAME_SOURCE_LABELS` |
| `settings.ts` | `AppSettings`, `OverlayPanelId` (5 panels), `OverlayPanelPosition` |
| `ui.ts` | `ViewMode`, `SortBy`, `SortOrder`, `LibraryFilters`, `CardDisplayOptions`, `GridSize`, `ListDensity`, `SlotActionId`, `PaletteAction`, `PaletteResults`, `PaletteHint` |
| `shelf.ts` | `ShelfConfig`, `ShelfPreset`, `ShelfDisplayMode`, `ShelfFilters` |
| `activityLayout.ts` | `ActivityCardType` (8 types), `CardWidth`, `ActivityCardConfig` |
| `metadata.ts` | `StoreMetadata`, `GenreInfo`, `CategoryInfo`, `SteamTagInfo` |
| `session.ts` | `GameSession`, `PlaytimeSnapshot` |
| `achievement.ts` | `GameAchievement`, `GameAchievementSummary` |
| `friend.ts` | `FriendInfo`, `FriendGame`, `FriendLibrary` |
| `news.ts` | `GameNewsItem` |
| `note.ts` | `GameNote`, `GameNoteWithName`, `GENERAL_NOTES_ID` |
| `rating.ts` | `GameRating` |
| `systemMetrics.ts` | `SystemSample`, `ProcessMetrics`, `SystemMetricsSnapshot` |
| `mediaSession.ts` | `MediaPlaybackStatus`, `MediaControlsMode`, `MediaSessionSnapshot` |
| `audio.ts` | `AudioSession`, `AudioDevice`, `AudioSnapshot` |
| `mediaBookmark.ts` | `MediaBookmark` |
| `theme.ts` | `IconSetId`, `FontFamilyId`, `UIScaleId` |
| `profile.ts` | `RadarDataPoint`, `ScatterPoint`, `LeaderboardEntry`, `QuickStats` |
| `tag.ts` | `Tag`, `GameTagAssignment` |
| `activity.ts` | `DailyPlaytimePoint`, `MostPlayedEntry`, `SessionLengthBucket`, `ActivityQuickStats` |
| `updater.ts` | `UpdateInfo` |

### 4.6 Frontend API Layer (services/tauri.ts)

26 API namespaces wrapping `invoke()` calls:

| Namespace | Methods | Purpose |
|-----------|---------|---------|
| `steamApi` | 6 | Library scanning, player summary, account resolution |
| `settingsApi` | 2 | Load/save settings |
| `gameApi` | 3 | Launch game, get/set launch mode |
| `metadataApi` | 5 | Metadata fetch, cache invalidation, backfill |
| `sessionApi` | 3 | Session history, active sessions |
| `tagsApi` | 9 | Tag CRUD, game assignment, bulk operations |
| `favoritesApi` | 2 | Toggle + list favorites |
| `hiddenGamesApi` | 2 | Toggle + list hidden |
| `savedFiltersApi` | 3 | Filter preset CRUD |
| `externalApi` | 1 | Multi-launcher scan |
| `customGameApi` | 3 | Custom game add/remove/update |
| `coverArtApi` | 7 | SteamGridDB integration, art picker |
| `achievementsApi` | 4 | Achievement fetch, batch, stats |
| `friendsApi` | 2 | Friends list + library comparison |
| `newsApi` | 2 | Game news + followed games |
| `overlayApi` | 5 | Toggle, hide, navigate, shortcut, execute palette action |
| `notesApi` | 4 | Note CRUD |
| `ratingsApi` | 4 | Rating + review CRUD |
| `systemMonitorApi` | 2 | System metrics, process kill |
| `mediaControlsApi` | 4 | SMTC transport controls |
| `mediaBookmarksApi` | 6 | Bookmark CRUD + reorder + open |
| `audioMixerApi` | 10 | Per-app volume, device switching, aliases |
| `aiApi` | 1 | Local AI intent resolution |
| `updaterApi` | 3 | Update check, install, version |
| `autostartApi` | 2 | Launch-on-startup toggle |
| `cloudAiApi` | 8 | Cloud AI key management, resolve, usage, settings |
| `developerApi` | 1 | Clear all data |

### 4.7 Image CDN & CSP

CSP allows images from:
- `steamcdn-a.akamaihd.net`, `cdn.akamai.steamstatic.com`, `cdn.cloudflare.steamstatic.com` — Game artwork
- `avatars.steamstatic.com` — Player avatars
- `media.steampowered.com` — Community icons
- `cdn2.steamgriddb.com`, `cdn.steamgriddb.com` — SteamGridDB cover art
- `images.gog.com`, `images-{1,2,3}.gog.com` — GOG cover art
- `www.google.com` — Favicon fallback for media bookmarks

### 4.8 Command Palette Architecture (utils/commandPalette.ts)

**Registry**: `STATIC_DESCRIPTORS` array of ~50 action descriptors (id, label, description, keywords, icon, category). `EXECUTORS` map of action IDs → executor functions. Separation allows search/display without execution dependencies.

**Search pipeline** (`searchPalette()`):
1. Game action prefix check: `favorite {name}` or `notes {name}` → scoped game search
2. Category prefix check: `matchCategoryPrefix()` → exclusive mode for `theme`, `sort`, `filter`, `go to`/`navigate`
3. Standard search: fuzzy match against descriptors + game names + dynamic metadata filters

**Category prefix definitions** (`CATEGORY_PREFIX_DEFS`):
| Prefix | Actions matched |
|--------|----------------|
| `theme` | `theme:*`, `font:*`, `icons:*`, `scale:*` (24 total) |
| `sort` | `sort:*` (8 actions) |
| `filter` | `filter:*`, `action:hidden-games`, `action:reset-filters` + dynamic metadata |
| `go to` / `navigate` | `nav:*` (6 nav actions) |

**Hints dropdown** (`PALETTE_HINTS`): 6 entries (Navigate, Filter, Sort, Theme, Favorite, Notes) with `autofill` text for click-to-fill.

**Cross-window execution**: Overlay sends `overlay_execute_palette_action(action_id, game_id, show_main)` → Rust emits `execute-palette-action` to main window → `useTrayListener` receives event, builds `PaletteContext`, calls `executeActionById()`.

---

## 5. Data Flow Diagrams

### 5.1 Library Load

```
useSteamLibrary (mount)
  → has API key + Steam ID?
    YES → librarySlice.refreshLibrary()
      → invoke("get_full_library")
        → Rust: scan_local_library() + fetch_owned_games()
        → register_game() for each (UUID assigned, source+source_id unique)
        → Merge by source_id (API playtime + local install data)
        → Sort alphabetically → GameLibrary
    NO  → librarySlice.scanLocalOnly()
      → invoke("scan_local_library")
        → Rust: registry → VDF → manifests → Vec<Game>
```

### 5.2 Metadata Enrichment Pipeline

```
LibraryView (mount / games change)
  → Phase 1: SteamSpy batch (fast, ~1s per batch)
      → steamspy_client.rs → batch tags, genres, release date
      → cache in store_metadata table
  → Phase 2: Store API backfill (slow, per-game detail)
      → store_client.rs → description, screenshots, Metacritic, categories
      → update existing store_metadata rows
  → backgroundTasksSlice tracks progress (phases, counts)
  → BackgroundTaskBanner shows progress to user

Per-game on-demand:
  → GameDetail mount → metadataSlice.fetchMetadata(gameId)
    → cache_db lookup → miss → store_client → cache → return
```

### 5.3 Session Tracking

```
process_monitor.rs (every 5s)
  → sysinfo::System::refresh_processes()
  → For each running process:
      Fast path: match exe_name against game_executables table
      Slow path: match exe directory against game install_path
  → New match found:
      → INSERT game_sessions (start_time = now, end_time = NULL)
      → emit("session-update") to main + overlay
  → Existing match no longer running:
      → UPDATE game_sessions SET end_time = now, duration_minutes = ...
      → emit("session-update")
  → Collect CPU/RAM/GPU per tracked PID → SystemMetricsSnapshot

Frontend (ActivityView / overlay):
  → listen("session-update") → re-fetch active sessions
  → Overlay: NowPlayingBanner shows current game + duration
```

### 5.4 Overlay Architecture

```
Global shortcut (Ctrl+Space) or tray → overlay.rs → toggle_overlay()
  → Creates/shows overlay window (full primary monitor, transparent, always-on-top)
  → overlay.html → overlay-main.tsx → OverlayApp

OverlayApp:
  → loadData(): invoke(load_settings, get_overlay_library, get_active_sessions, get_all_favorites)
  → Renders OverlayBackdrop + OverlayWindowManager + 5 FloatingPanels
  → Focus listener: re-loadData() on regain (with debounce guard)
  → Settings sync: listen("settings-changed") → reload from disk → update local state + useSettingsStore
  → useSettingsStore.setState() hydrated for shared components (AppIcon reads iconSet from Zustand)

FloatingPanel:
  → Draggable (pointer capture on header)
  → Lockable (pin icon → prevents drag)
  → Resizable (optional, drag handle at edges)
  → Collision-aware (panelCollision.ts)
  → Position/size persisted in AppSettings.overlayPanelPositions (300ms debounce)

Cross-window communication:
  → Main → Overlay: emit_to("overlay", ...) for settings sync
  → Overlay → Main: emit_to("main", ...) for navigation, game selection
  → Overlay → Rust → Main: overlay_execute_palette_action(action_id, game_id, show_main)
      → Rust: conditionally show/focus main window based on show_main flag
      → Rust: emit_to("main", "execute-palette-action", payload)
      → Main: useTrayListener receives event → executeActionById() with real stores
  → notify_settings_changed emits to BOTH "main" and "overlay" (bidirectional)
  → NEVER use broadcast events (emit without target)
```

### 5.5 Cover Art Resolution

```
GameImage component (mount)
  → invoke("get_cover_art_url", { gameId, imageType: "grid" })
    → cache_db: game_images lookup
      → Hit (not expired, or user_selected) → return URL
      → Miss → try GOG CDN (for GOG games) → try SteamGridDB → try Steam CDN
    → Cache result in game_images table → return URL

Art Picker (user changes cover):
  → invoke("get_cover_art_options", { gameId, imageType, query? })
    → SteamGridDB: search_game(name) → fetch_grid_options(sgdb_id, limit=20)
    → Return SgdbImageOption[] (id, url, thumb, width, height)
  → User selects image:
    → invoke("set_cover_art", { gameId, imageType, url })
    → Stores with user_selected = true (immune to TTL refresh)
    → uiSlice.bumpArtVersion() → GameImage re-renders
```

### 5.6 Activity Dashboard

```
ActivityView (mount)
  → Load recent sessions (limit=500), active sessions
  → activityLayoutSlice.initLayout(settings.activityLayout)
  → Render card grid via dnd-kit (drag to reorder, half/full width)
  → Each card computes data via useMemo:
      quick-stats    → computeActivityQuickStats(sessions)
      heatmap        → SessionHeatmap (365-day calendar)
      daily-playtime → computeDailyPlaytime(sessions) → DailyPlaytimeChart (Recharts)
      most-played    → computeMostPlayed(sessions) → MostPlayedChart (Recharts)
      session-length → computeSessionLengthDistribution(sessions) → histogram
      playtime-by-day → computePlaytimeByDayOfWeek(sessions) → bar chart
      recent-sessions → SessionTimeline (date-grouped list)
      memories       → MemoriesCard (milestone highlights)
  → Per-card filters: date range, specific game, tags, source, day of week
  → Click chart element → SessionDrillDown (modal with filtered session list)
  → Layout persisted on change → saveSettings({ activityLayout })
```

### 5.7 Notes System

```
game_notes table (schema v13):
  → game_id TEXT PRIMARY KEY, content TEXT, updated_at INTEGER
  → Special "general" note: game_id = "__general__" (GENERAL_NOTES_ID constant)

Overlay panel (OverlayGameNotes):
  → Tabs for each active session's game + General tab
  → Auto-save on content change (debounced)

NotesView (/notes route):
  → notesSlice.loadNotes() → getAllNotesWithContent()
  → General note pinned at top
  → List of all game notes with game name, last updated
  → Expandable note editor per game

GameDetail sidebar:
  → Quick Notes section with inline editor
```

---

## 6. Configuration

### tauri.conf.json

- Window: 1280×800 default, 1024×768 minimum
- Dev URL: `http://localhost:1420`
- CSP: Steam CDN + SteamGridDB CDN + GOG CDN domains
- Updater: GitHub Releases `latest.json` endpoint + Ed25519 public key
- Bundle: NSIS target with `createUpdaterArtifacts: "v1Compatible"`

### Settings file

Location: `%APPDATA%/app.theroost/settings.json`

Key fields (API keys stored in Credential Manager, not here):
```
steam_id, is_first_run, theme, icon_set, font_family, ui_scale,
card_display, profile_chart_options, command_center_slots,
command_center_shortcut, rail_mode, shelves, minimize_to_tray,
dev_settings_enabled, activity_layout, has_seen_welcome,
overlay_panel_positions, media_controls_mode,
cloud_ai_provider, cloud_ai_daily_limit, cloud_ai_context_scope,
cloud_ai_exclude_games, cloud_ai_include_games
```

---

## 7. Infrastructure & Testing

| Tool | Purpose |
|------|---------|
| ESLint 9 (flat config) | Linting |
| Prettier | Formatting |
| husky + lint-staged | Pre-commit hooks |
| Vitest (jsdom) | Frontend tests |
| `cargo test` | Rust tests |
| TypeScript strict | Type safety |
| Recharts | Charts (activity + profile pages) |
| @dnd-kit | Drag-and-drop (activity cards) |
| react-icons | 6 icon set libraries |
| GitHub Actions | CI (lint + test) + Release (build + sign + publish) |

**Test Coverage (579 total)**:

**Rust (213 tests)**:
- CacheDb: 95 tests (schema, CRUD for all 20 tables, transactions, migrations v1→v18)
- AI pattern matcher: 38 tests (10 extractors, fuzzy matching, confidence scoring)
- VDF parser: 15 tests (parsing, escapes, real-world formats)
- Steam API URL parsing: 13 tests (Steam profile/vanity URL extraction)
- Process monitor: 12 tests (exe matching, metrics, state)
- Epic scanner: 7 tests
- AI cloud resolver: 7 tests (cloud provider integration)
- GPU monitor: 5 tests
- Audio: 3 tests + 4 model tests
- Game model: 4 tests
- AI cloud cache: 4 tests
- Media: 2 tests + 2 model tests + 2 bookmark tests
- AI Gemini provider: 1 test

**Frontend (366 tests)**:
- Command palette: 72 tests (action registry, search, result capping, category prefix matching, hints, AI heuristic)
- Activity stats: 56 tests (daily playtime, most played, session distribution, day-of-week)
- Profile stats: 46 tests (genre DNA, playtime distribution, Metacritic scatter, leaderboard)
- Shelf filtering: 21 tests (presets, filters, search, hidden games, genre grouping)
- Library slice: 19 tests (mergeGames dedup/sort, refreshLibrary, scanLocalOnly, addGame, removeGame)
- Metadata slice: 17 tests (fetch cached/uncached, dedup guard, batch, refreshAll, error fallback)
- Formatters: 17 tests (playtime, bytes, source names, formatLastPlayed)
- Shelves slice: 16 tests (init, add, update, remove, reorder, displayMode, groupByGenre)
- Filtering: 16 tests (all filter types, edge cases)
- Sorting: 14 tests (all sort modes, null handling, immutability)
- Streaks: 11 tests (calculatePlayStreak, computePlaytimeInRange, edge cases)
- FloatingPanel: 10 tests (render, pin/close, resize handle, className)
- AddCustomGameDialog: 9 tests (add/edit mode, validation, button states, delete confirmation)
- RouteErrorFallback: 4 tests (error rendering, page name, recovery buttons, navigation)
- Errors: 8 tests (AppError extraction)
- Settings slice: 7 tests (load/save success/error, icon set migration)
- useSteamLibrary hook: 6 tests (full/local mode, refresh function)
- useSettings hook: 4 tests (auto-load, no re-load, cardDisplay sync, shelves init)
- Ratings slice: 4 tests (load, save, delete, getRating for unrated)
- StarRating component: 8 tests (render, read-only, interactive, zero value)
- Notes slice: 2 tests

**Shared test factories** (`src/test/factories.ts`): `makeGame()`, `makeMeta()`, `makeFilters()`, `makeSession()`, `makeShelf()`, `ts()`. Override object pattern for all factories. `makeGame` includes `description: null` by default.

**Coverage**: V8 provider configured in `vite.config.ts` — run `npx vitest run --coverage` to generate text + lcov reports.

---

## 8. Key Patterns & Constraints

### Concurrency Safety (Rust)
- **NEVER emit events while holding a Mutex lock** — collect payloads in Vec, drop guard, then emit
- **NEVER hold db lock during Tauri API calls** — menu/tray operations may dispatch to main thread via SendMessage
- **Spawn tray refresh as background task** — never block the process monitor scan cycle
- **Minimize lock scope** — acquire once for batch ops, release before I/O

### Overlay (Frontend)
- **`onPointerDown stopPropagation`** on all interactive elements to prevent FloatingPanel drag
- **Debounce guard on `loadData()`** — mount + focus both call it; without guard, rapid calls exhaust tokio threads
- **Stale closure fix** — use refs synced each render for values in `useCallback` handlers
- **Re-focus overlay** after opening external URLs (150ms delay via `tokio::spawn` in backend)

### Architecture
- **UUID game identity** — all tables reference `game_id` (UUID), not launcher-specific IDs
- **Multi-launcher** — `GameSource` enum + source-specific scanners; avoid Steam-only assumptions
- **Data router required** — `createBrowserRouter` for `useBlocker` support in SettingsView
- **CSS specificity** — `html[data-ui-scale]` (0,1,1) beats `:root` (0,1,0) for scale overrides

---

## 9. Phase Summary

| Phase | Status | Focus |
|-------|--------|-------|
| 1–5 | Done | Foundation, UI, library, profile, QoL |
| 6–8.5 | Done | Navigation, shelves, theming, testing |
| 9a | Done | UUID game identity model |
| 9b–9d | Done | System tray, process monitor, multi-launcher scanners |
| 9e–9g | Done | Cover art (SteamGridDB), custom games, launch modes |
| 10 | Done | Activity overhaul (customizable cards, dnd-kit, charts), SteamSpy refactor |
| 11 | Done | System Overlay + Command Center overhaul |
| 11.1 | Done | FloatingPanel enhancements + Window Manager |
| 11.5 | Done | Overlay HUD: game notes, process monitor, media controls, audio mixer |
| Pre-12 | Done | P3 backlog (6 items) + test coverage (107 new frontend tests) |
| 12a | Done | Command palette standardization (category prefixes, hints, overlay sync) |
| 12b | Done | AI pattern matcher + foundation (9 extractors, fuzzy tag matching) |
| 12c | Done | Cloud AI integration (Gemini 3 Flash, "Ask Assistant", context builder) |
| R1+R3 | Done | Build pipeline, NSIS installer, auto-updates (OTA), autostart |
| v1.2.0 | Done | Route error boundaries (per-route `errorElement`, `RouteErrorFallback`) |
| v1.3.0 | Done | Personal ratings & reviews (5-star system, review text, sort/filter, AI awareness) |
| v1.3.5 | Done | Settings tabbed layout (5 tabs, save bar outside scroll, CSS display toggle) |
| v1.4.0 | Done | Manual playtime entry (non-Steam games, set/add modes, process monitor auto-increment) |

See `docs/ROADMAP.md` for the full roadmap.
