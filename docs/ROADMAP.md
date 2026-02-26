# The Roost Roadmap

---

# Version 1.0 — Feature Complete

555 tests passing (205 Rust + 350 frontend). 104 Tauri commands across 27 modules. Multi-launcher support (Steam, Epic, GOG, EA, Ubisoft, Battle.net). System overlay with 5 HUD panels. Two-tier AI (pattern matcher + Gemini cloud). Command palette with natural language input.

## Completed Phases

### Phase 1: Data Foundation
- SQLite database (rusqlite bundled, WAL mode)
- Store API metadata caching with 7-day TTL
- Session tracking (background task polls Steam API every 5 min)

### Phase 2: Wire into UI
- GameDetail sidebar + main layout with metadata display
- Genre tags, Metacritic badges, screenshots
- Session heatmap (GitHub-style 365-day calendar)
- Activity page with session timeline, streaks, active sessions
- Debug panel with structured logging

### Phase 3: Library Enhancements
- Custom tags system (CRUD, 15-color picker, tag manager)
- Favorites (star toggle, SQLite-backed, filter toggle)
- Card display customization (show/hide genre tags, playtime, installed badge, user tags)
- CardDisplayPopover for quick toggles

### Phase 4: Player Profile + Interactive Statistics
- `/profile` route with player identity header
- 4 Recharts-powered interactive charts:
  - Genre DNA Radar (top 8 genres by playtime)
  - Playtime Distribution (6-bucket histogram, clickable bars)
  - Metacritic Scatter (score vs playtime)
  - Developer/Publisher Leaderboard (horizontal bar, toggle)
- Pure computation functions in profileStats.ts
- useChartColors hook for theme-aware charts

### Phase 5: QoL + Polish
- 6 new themes (midnight-purple, cyber-neon, arctic-frost, ember-forge, ocean-depths, sakura) → 9 total with verdant
- Hidden games with right-click context menu, SQLite-backed (schema v3)
- Enhanced filtering: genre popover with OR logic, saved filter presets (SQLite-backed chips)
- Library resizing: grid S/M/L sizing, list density, sortable column headers
- Profile chart customization: genre count (4–12), bucket presets, leaderboard top N
- CardDisplayPopover enhanced with size selectors
- Metacritic sort option, responsive theme grid layouts

---

### Phase 6: Navigation & Command System
Replaced the original 240px sidebar with a modern command-driven navigation system.

**Icon Rail:**
- 48px collapsed / 180px expanded on hover
- 5 nav links + command center toggle, active indicator bar
- Three rail modes: Dynamic (hover), Always open, Always collapsed
- The Roost logo opens Command Center; footer button cycles rail mode

**Command Center:**
- Frosted glass overlay (Ctrl+K, spacebar, or configurable shortcut)
- 6 customizable action slots (navigation, theme picker, quick stats, random game, tag filter, refresh)
- Quick stats footer, random game picker

**Command Palette:**
- ~40 searchable actions (navigation, themes, fonts, icon sets, view/sort modes, settings shortcuts)
- Game search across entire library by name with Steam icon thumbnails
- Dynamic filter suggestions from metadata (genres, steam tags, categories)
- Keyboard-driven: Arrow Up/Down navigate, Enter executes, Escape clears/closes
- Action registry in `utils/commandPalette.ts`, results UI in `CommandPaletteResults.tsx`

---

### Phase 7: Library Experience
Comprehensive overhaul of the library view with shelves, filtering, and visual polish.

**Library Shelves:**
- Vertical stack of configurable shelves instead of flat grid/list
- Each shelf: own preset, filters, sort, and display mode
- 3 display modes: collapsed (1 horizontal scroll row), extended (2 rows), expanded (full grid/list)
- 5 presets: All Games, Recently Played, Favorites, Installed, Custom
- Per-shelf genre grouping toggle
- Shelf editor dialog for full CRUD; drag-and-drop reorder
- Default layout: "Recently Played" collapsed + "All Games" expanded
- List mode = unified flat list with global filters (grid view = shelf-based)

**Genre & Tag Filtering:**
- SteamSpy API integration: community tags per game (Roguelike, Open World, Co-op, etc.)
- DB schema v4: `steam_tags` column (JSON-serialized)
- SteamTagFilterPopover: searchable dropdown sorted by frequency
- Category filtering: Store API categories surfaced as "Features" dimension
- All filter dimensions use OR logic

**UI Polish:**
- CSP fix for Steam CDN images
- Theme variable standardization (CSS variables replacing hardcoded colors)
- Focus-visible states across all interactive elements
- Backdrop blur on overlays
- Image fallback chains for game assets
- Module-level URL cache for instant re-renders

---

### Phase 8: Theming & Customization
Full visual customization system with independent palette, font, icon, and scale selection.

**Icon System Overhaul:**
- Replaced ALL Unicode emoji/HTML entities with SVG icons from `react-icons`
- 7 icon sets: Default (Remix), Minimal (Lucide), Heroic (Heroicons2), Playful (Ionicons5), Bold (MaterialDesign), Classic (FontAwesome6), Fantasy (GameIcons)
- `AppIcon` component with `IconName` union type (~35 semantic names)
- User-selectable icon set independent from palette

**Theme Builder:**
- Settings component: 4-dimension customizer (palette, font, icons, UI scale)
- 9 color palettes with swatch grid preview
- 5 font families (System, Inter, Space Grotesk, Exo 2, JetBrains Mono) — WOFF2 bundled
- Live preview mockup showing all dimensions together
- Buffered changes with instant preview, save to apply
- Double-click to quick-apply any option

**UI Scale:**
- 4 density levels: Minimal, Comfortable (default), Expanded, Large
- CSS variable overrides for spacing, font sizes, border radii, layout dimensions
- Applied via `data-ui-scale` attribute on `<html>` (higher specificity than `:root`)

**Quick Theme Popover:**
- 4-column popover (Palette, Font, Icons, Scale) — click to apply instantly

---

### Phase 8.5: Testing Sprint + Dead Code Cleanup
Safety net before the multi-launcher architectural refactor.

**Rust Backend Tests (57 tests):**
- VDF parser: 15 tests (pure parsing, escape handling, real-world VDF formats, error cases)
- CacheDb: 29 tests (schema migration, metadata CRUD, sessions, tags, favorites, hidden games, saved filters, snapshots)
- URL parsing: 13 tests (Steam profile URL extraction, vanity URL extraction)

**Frontend Tests (56 new tests, 104 total):**
- Error utilities: 8 tests (AppError extraction, edge cases)
- Sorting: 12 tests (all 6 sort modes, asc/desc, null handling, immutability)
- Shelf filtering: 20 tests (preset filters, shelf filters, global search, hidden games, genre grouping)
- Command palette: 19 tests (action registry validation, search matching, result capping)

**Dead Code Cleanup:**
- Removed orphaned Sidebar.tsx + Sidebar.css (replaced by IconRail in Phase 6)

---

### Phase 9a: Data Model & Trait Abstraction
Universal game identity model — foundation for multi-launcher support.

- UUID string primary key (`game_id`) replaces `appid: u32` across entire stack
- `GameSource` enum (`Steam`, `Manual`) + `source_id` for launcher linkage
- `games` registry table mints stable UUIDs; `UNIQUE(source, source_id)` constraint
- Database schema v5 migration: generates UUIDs for all existing Steam data, preserves favorites/tags/hidden/sessions
- All Rust models, services, commands updated (`game_id: String` / `game_id: &str`)
- All frontend types, stores, utilities, components, tests updated (`gameId: string`)
- Steam internals still use `u32` appids — translation at command/service boundary
- 62 Rust tests + 104 frontend tests passing
- ~42 files changed

### Phase 9b: System Tray & Background Operation
The Roost becomes a background-capable app with system tray support.

- Tauri v2 built-in `tray-icon` feature (TrayIconBuilder in setup hook)
- Minimize to tray on window close (configurable, default: on)
- Left-click tray icon restores window; right-click shows context menu
- Tray menu: "Open The Roost", active session display, 5 recently played games (with "Open in The Roost" / "Launch Game" submenus), "Fully Quit"
- Menu auto-refreshes every 60s + on session changes
- "Open in The Roost" emits `navigate-to-game` event → frontend navigates to GameDetail
- Settings UI checkbox + command palette "Toggle Minimize to Tray" action
- `minimize_to_tray` setting with `#[serde(default)]` = true (backwards-compatible)
- 65 Rust tests + 104 frontend tests passing

### Phase 9c: Process Monitoring & Session Tracking
Universal session tracking via OS-level process monitoring.

- Background Rust service (`process_monitor.rs`) scans running processes every 5 seconds via `sysinfo` crate
- Matches processes against known executable paths from `game_executables` table
- Two-tier matching: fast path (exact exe name) + slow path (install path prefix)
- Detects session start/end with second-level granularity
- Launcher processes excluded from matching (Steam, Epic, GOG, EA, Ubisoft, Battle.net)
- Tray menu integration: active session display, recently played games
- 76 Rust tests + 106 frontend tests passing

### Phase 9d: Onboarding & Polish
Final Phase 9 polish pass (completed out of chronological order, before multi-launcher scanning).

- Revamped onboarding flow with Steam account lookup
- New onboarding step for "Minimize to tray" preference
- Explanatory note on Settings page tray checkbox
- Developer settings panel, window sizing fixes

### Phase 9e: Multi-Launcher Scanning
The Roost detects installed games from 5 additional PC launchers beyond Steam.

**Launcher Scanners** (`src-tauri/src/services/launchers/`):
- Epic Games Store: JSON `.item` manifests from `ProgramData\Epic\...\Manifests\`
- GOG Galaxy: Registry at `HKLM\...\WOW6432Node\GOG.com\Games\{id}`
- EA App: Windows Uninstall registry filtered by publisher "Electronic Arts"
- Ubisoft Connect: `Ubisoft\Launcher\Installs\{id}` registry + uninstall cross-reference for names
- Battle.net: Windows Uninstall registry filtered by publisher "Blizzard Entertainment"

**Architecture:**
- `GameSource` enum extended: `Epic`, `Gog`, `EaApp`, `UbisoftConnect`, `BattleNet`
- Shared `scan_uninstall_registry()` utility for EA/Battle.net (both use publisher filtering + non-game blocklists)
- `scan_external_games` Tauri command: aggregates all scanners, registers in DB, stores install paths + executables
- Library store uses `Promise.allSettled()` to scan Steam + external in parallel with graceful failure handling

**Game Launching:**
- Epic: `com.epicgames.launcher://` URI scheme
- GOG: Direct executable with `goggalaxy://` URI fallback
- Ubisoft: `uplay://launch/{id}/0` URI scheme
- EA App / Battle.net: Direct executable from `game_executables` table

**Frontend:**
- `GameImage` component source-aware: non-Steam games show placeholder (skip Steam CDN)
- `getSourceDisplayName()` maps source IDs to human names
- GameDetail shows "Source · ID" format
- Source filter popover for filtering by launcher
- 91 Rust tests + 107 frontend tests passing

### Phase 9f: Cover Art for Non-Steam Games
Full cover art pipeline for non-Steam games via SteamGridDB integration.

**SteamGridDB Integration** (`src-tauri/src/services/steamgriddb.rs`):
- `SteamGridDbClient` with API key authentication (stored in Windows Credential Manager)
- Game search by name → SGDB game ID resolution
- Three image types: grid (cover art), hero (banner), logo (icon)
- Batch fetching for library-wide cover art population
- GOG public CDN fallback (`fetch_gog_image()`) — no API key needed
- Rate limiting (500ms between requests)

**Cover Art Service** (`src-tauri/src/services/cover_art.rs`):
- `resolve_image()` — fetch + cache a single image URL by game ID + type
- `get_image_options()` — browse multiple art options with optional search query
- `set_cover_art()` — user selects specific art, marked as `user_selected` (skips TTL expiry)
- Database: `game_images` table (schema v8) with `user_selected` flag

**CoverArtPicker Component**:
- Modal overlay (`position: fixed`, z-index 200) with image grid
- Search bar for custom SGDB queries (re-fetches on submit)
- Three modes: "Choose Cover Art" (grid), "Choose Hero Banner" (hero), "Choose Icon Art" (logo)
- Selection saves image URL, clears all cached versions, bumps artVersion for instant re-render

**Library Card Integration:**
- Hover edit icon on non-Steam game cards (next to favorite star) — opens grid art picker
- `artVersion` counter in Zustand forces GameImage re-mount on art change
- Fixed cache invalidation bug (raw type keys instead of mapped keys)

**GameDetail Integration:**
- Hero banner edit button (non-Steam only) — opens hero art picker
- "Set Icon Art" sidebar button — opens logo art picker for command palette icons
- Escape key routing: picker handles its own Escape; modal only closes when picker is not open

**Command Palette:**
- `GameIconImage` component resolves stored logo art for non-Steam games
- Module-level icon cache for instant subsequent renders
- Steam games use CDN icon URL; non-Steam fall back to AppIcon

**Settings:**
- SteamGridDB API key management (store/delete/status check)
- Credential Manager integration via `keyring` crate

- 98 Rust tests + 115 frontend tests passing

### Phase 9g: Custom Games
User-added game entries for games not associated with any launcher.

**Backend:**
- Schema v9 migration: `description TEXT` column on `games` table
- `AppError::Validation` variant for input validation
- CacheDb: 6 new methods — `set_game_description`, `get_game_description`, `update_game_name`, `delete_game_executables`, `delete_game` (cascading delete across 8+ tables), `get_manual_games`
- Custom games command module: `add_custom_game`, `remove_custom_game`, `update_custom_game`
- `launch_game` handles `"manual"` source via direct executable
- `scan_external_games` includes manual games from DB (survive library refreshes)
- `tauri-plugin-dialog` for native OS file picker

**Frontend:**
- `AddCustomGameDialog` component — add/edit modes, native file picker (`.exe` filter), form validation, delete confirmation
- "+ Add Game" button in library controls
- GameDetail sidebar: "Edit Game" and "Remove Game" buttons for manual games
- "Add Custom Game" searchable via command palette (Ctrl+K)
- Library store: `addGame()` / `removeGame()` for instant UI updates without full rescan
- `"plus"` icon across all 7 icon sets
- Description displayed in GameDetail "About" section for manual games
- Play button text adapts per source

**Bug Fixes (pre-existing):**
- `CategoryFilterPopover` Map key type mismatch (string vs number)
- `useTrayListener` invalid log category
- `Input` component supports `forwardRef`

- 104 Rust tests + 116 frontend tests passing

### Phase 9h: Launch Mode Toggle
Per-game launch mode preference for non-Steam games — defaults to launching through the parent launcher instead of the game executable directly.

**Problem:** Games like Overwatch require their parent launcher (Battle.net) for authentication. Launching the game exe directly bypasses the OAuth token handshake, so the game can't sign in. This affects Battle.net, EA App, and potentially other launchers.

**Solution:** Per-game "Launch via" toggle stored in the database, defaulting to "launcher" mode for all non-Steam/non-Manual games.

**Backend:**
- Schema v10 migration: `launch_mode TEXT` column on `games` table (NULL = use source default)
- `resolve_launch_mode()` — Steam/Manual always "fixed"; recognized sources default "launcher" unless user explicitly sets "direct"
- Refactored `launch_game` routing by `(source, mode)` pairs with fallback chains:
  - Epic: launcher = URI scheme; direct = exe (fallback to URI)
  - GOG: launcher = Galaxy URI (fallback to exe); direct = exe (fallback to URI)
  - Ubisoft: launcher = URI scheme; direct = exe (fallback to URI)
  - EA App: launcher = open EA App (registry/path discovery); direct = exe
  - Battle.net: launcher = open Battle.net Launcher (registry discovery); direct = exe
- `find_battlenet_launcher()` / `find_ea_app_launcher()` — Windows registry lookups for launcher executables
- `get_launch_mode` / `set_launch_mode` Tauri commands
- Extracted `launch_direct()` and `launch_uri()` helpers to eliminate duplication

**Frontend:**
- `LaunchMode` type (`"launcher" | "direct"`)
- `gameApi.getLaunchMode()` / `gameApi.setLaunchMode()` in Tauri service
- GameDetail sidebar: `<select>` dropdown below Play button (non-Steam/non-Manual only)
- Options: launcher name (e.g., "Battle.net") or "Direct executable"
- Styled with theme CSS variables, matching sidebar aesthetic

**Research (credential passthrough — rejected):**
- Battle.net uses OAuth2 with cryptographically signed tokens — cannot be replicated by third-party apps
- No documented CLI flags for passing credentials
- All major multi-launcher apps (Playnite, GOG Galaxy 2.0, LaunchBox) solve this the same way: delegate to the native launcher
- The launcher mode toggle is the correct and complete solution

- 104 Rust tests + 116 frontend tests passing

---

### Phase 10: Ultra Mega Interface Update
Comprehensive UI/UX overhaul — working through every screen of the app to improve layout, spacing, visual hierarchy, and overall polish. Collaborative sprint-based approach with screenshot-driven feedback.

**Scope:**
- Review and refine every major view (Library, Activity, Profile, Settings, Debug)
- Navigation & layout improvements (IconRail, header areas, spacing)
- Component-level polish (cards, modals, popovers, forms)
- Typography, color usage, and visual hierarchy fixes
- Responsive behavior and edge case cleanup
- Animation and transition refinements

**Completed Sprints:**
- Edit Shelf dialog overhaul
- Command Center action button layout bug fixes
- Settings page visual bug fixes (Theme Builder)
- App logo: custom roost logo in sidebar (IconRail) + Tauri app icons

**Completed:**
- App logo: custom roost logo in sidebar (IconRail) + Tauri app icons
- Activity Page Overhaul (base): Full restructure with modern layout, 4 Recharts charts (Daily Playtime, Most Played, Session Length, Playtime by Day), NowPlayingBanner, enhanced StatCards with icons/trends, SessionHeatmap auto-sizing via ResizeObserver, ChartCard containers, 2-column responsive grid
- Activity bug fixes: `get_recent_sessions` includes active/unclosed sessions, X-axis label spacing, ChartCard flex-shrink fix
- Activity Customization — Customizable card layout, drill-down overlays, Memories card, tag filtering:

**Activity Customization (complete):**

*Card Layout System:*
- 8 card types: quick-stats, heatmap, daily-playtime, most-played, session-length, playtime-by-day, recent-sessions, memories
- One card per type; CSS Grid 2-column layout with full/half width toggle per card
- Edit mode toggle: clean default view; edit mode shows drag handles, card menus (remove/resize/reset), and "Add Card" button
- Drag-and-drop via `@dnd-kit` (PointerSensor) — DragOverlay with drop slot indicators, direction-aware insertion (up = insert before, down = insert after)
- Per-card options (range, period, tag filters) with inline toolbar controls and reset-to-defaults
- Persistence: `activityLayout` in settings.json, auto-saved on every mutation (follows shelves pattern)
- Types in `src/types/activityLayout.ts`, store in `src/store/activityLayoutSlice.ts`

*Drill-Down System (reusable):*
- Generic `DrillDownOverlay` component (`src/components/common/`) — fixed overlay, title/subtitle, Escape to close
- `useDrillDown<T>()` hook for local state management
- `SessionDrillDown` wraps `SessionTimeline` with filtered sessions
- 5 filter functions in `activityStats.ts`: by date, game, duration range, day of week, tags
- All 5 charts clickable: DailyPlaytime, MostPlayed, SessionLength, PlaytimeByDay, Heatmap

*New Cards & Filtering:*
- Memories card: "on this day" lookback — same calendar week one month and one year ago
- Tag/genre filter: `ChartFilterMenu` component with 5 filter sections (genres, Steam tags, features, custom tags, launchers)
- Portal-based dropdown with scoped data, collapsible sections, searchable tag list
- Filterable cards: daily-playtime, most-played, session-length, playtime-by-day

**Infrastructure & Performance (complete):**

*SteamSpy-First Metadata Refactor:*
- Steam Store API rate-limits after ~200 requests; libraries of 400+ games broke batch metadata fetch
- SteamSpy now primary batch source (genres, devs, publishers, tags); Store API → on-demand enrichment + slow background backfill
- `steamspy_client.rs`: `SteamSpyAppData` struct + `fetch_app_data_batch()` extracts full metadata
- `metadata_service.rs`: complete rewrite — SteamSpy-only batch, on-demand enrichment, `backfill_store_details`
- `store_client.rs`: all batch infrastructure removed (only `fetch_app_details()` remains)
- `LibraryView.tsx`: priority ordering (50 recent → 100 by playtime → rest) + 3-phase background tasks
- Performance: 450 SteamSpy calls (no rate-limit) + background Store API at 1 req/1.5s (invisible to user)

*Debug Log Cleanup:*
- `log_bridge.rs`: filter DEBUG/TRACE from frontend forwarding (only INFO+ forwarded)
- Rust: demoted per-game logs to debug; batch operations use summary counters
- Frontend: removed ~25 noisy debug/info logs across 10 store slices
- Debug panel: requestAnimationFrame event batching for performance

- 108 Rust tests + 193 frontend tests passing

**Previously Planned (resolved):**
- Profile Page Overhaul — drill-down and filtering already implemented via Activity's reusable DrillDownOverlay system
- GameDetail Session Tracking Visuals — heatmap clipping and dead space resolved after achievements were added

---

### Phase 11: System Overlay & Command Center Overhaul
Transformed the Command Center from an in-app portal overlay into a system-wide floating HUD accessible from anywhere on the desktop — even while The Roost is minimized to tray.

**Global Shortcut:**
- `tauri-plugin-global-shortcut` for system-wide hotkey registration
- Default: Ctrl+Space; configurable (Ctrl+Shift+Space, Ctrl+K, Ctrl+J)
- Shortcut re-registered on the fly when user changes setting
- Works even when app is minimized to tray or unfocused

**Overlay Window:**
- Separate Tauri window (`overlay.html`) — lightweight React app (no router, no Zustand)
- Frameless, transparent, always-on-top, skip-taskbar, no shadow
- Centered on primary monitor, upper third positioning
- Created lazily on first toggle; show/hide thereafter (fast)
- Auto-hides on focus loss via `WindowEvent::Focused(false)`
- CSS entrance animation (fade + scale, 150ms)

**Overlay Command Center:**
- Full Command Center functionality: 6 customizable action slots, palette search, game results
- Navigation actions show main window + navigate via `emit_to("main", "navigate-to-route")`
- Game selection: shows main window + navigates to library + selects game via cross-window events
- Theme picker and quick stats popovers render inside overlay
- Slot customization (edit mode) works within overlay
- Now-playing banner: active sessions with live elapsed time + green pulse dot
- Quick stats footer: total games, playtime, installed count

**Architecture:**
- Vite multi-page build: `rollupOptions.input` with main + overlay HTML entries
- `OverlayApp.tsx`: fetches settings, games, active sessions from Rust commands on each show
- `OverlayCommandCenter.tsx`: adapted from old CommandCenter — no createPortal, no React Router
- Cross-window communication: `app.emit_to("main", event, payload)` from Rust
- Main window listener in `useTrayListener.ts`: `navigate-to-route` + `navigate-to-game` events
- Rust service: `services/overlay.rs` — create/toggle/hide + shortcut parsing/registration
- Rust commands: `commands/overlay.rs` — toggle, hide, show_main_and_navigate, overlay_select_game, update_overlay_shortcut
- In-app Command Center portal fully removed from `AppLayout.tsx`; logo click → `invoke("toggle_overlay")`

**Overlay Feature Parity (11a–11f polish pass):**
- Cross-window settings sync: overlay saves → `notify_settings_changed` emits targeted event to main window only → Zustand reloads from disk
- Prop-injectable popovers: ThemePickerPopover, QuickStatsPopover, RandomGamePopover accept optional data props (overlay passes data, main app continues using Zustand hooks)
- Inline popover rendering: replaced floating panel with body-area rendering (3 states: search, popover, slots) — eliminates clipping
- OverlayTagFilter: standalone tag filter for overlay (fetches tags via invoke, applies via cross-window event to main app)
- Game launching from search: `invoke("launch_game")` instead of navigating to GameDetail
- All slot actions functional: random-game and tag-filter toggle inline popovers like theme-picker and quick-stats
- Overlay window sizing: 600×660 (from original 460×520)
- Favorites count fetched for QuickStatsPopover accuracy
- Escape key: context-aware (back out of popover → close overlay); `core:window:allow-hide` capability added
- `useTrayListener.ts`: `settings-changed` + `apply-tag-filter` cross-window event listeners

- 108 Rust tests + 193 frontend tests passing

---

### Phase 11.1: FloatingPanel Enhancements + Window Manager
Matured the overlay panel system before building HUD features — ensuring each future panel drops into a robust framework.

**FloatingPanel Enhancements:**
- Lock icon: pin button toggles to lock icon (all 6 icon sets) when locked; prevents dragging
- Pointer capture fix: control buttons use `stopPropagation` to avoid header's `setPointerCapture` stealing clicks
- Resize handle: optional bottom-right corner grip (pointer events), `resizable` prop with `minWidth`/`minHeight` constraints
- Collision detection: `otherPanelRects` prop; AABB intersection pushes panels to nearest non-overlapping edge
- `OverlayPanelPosition` expanded: `width?`, `height?`, `visible` fields added

**Window Manager Bar:**
- Fixed bar at top center of overlay (z-index 20, frosted glass)
- "HUD" title + icon+label button per registered panel
- Hidden panel: click to show. Visible panel: click for dropdown (Hide / Reset Position)
- Reset Position: `resetKeys` state forces FloatingPanel remount at default position

**Panel Infrastructure:**
- `overlayPanelRegistry.ts` — panel definitions (id, icon, default position/size, resizable flag)
- `panelCollision.ts` — `resolveCollision()` + `resolveResizeCollision()` AABB utilities
- `OverlayApp.tsx` refactored as panel orchestrator: owns all FloatingPanel + OverlayBackdrop rendering
- `OverlayCommandCenter.tsx` simplified to pure content component (no panel wrapper)
- Debounced settings save (300ms) to avoid hammering disk during drag

- 108 Rust tests + 193 frontend tests passing

---

### Phase 11.5: Overlay HUD Features
Extends the system overlay from a command launcher into a full gaming HUD with system monitoring, audio control, media playback controls, and per-game notes.

**Full-Screen Overlay + Floating Panel Framework (complete — see Phase 11.1):**
- Overlay window covers full primary monitor with dimmed backdrop
- `FloatingPanel` component: draggable, lockable, resizable, collision-aware, position-persisted
- Window Manager bar at top center for panel visibility/reset management
- Panel registry + collision utilities established
- Command Center is the first FloatingPanel; future HUD features each get their own

**Process Monitor + Performance Sparklines (complete):**
- `SystemMetrics` struct in `process_monitor.rs` with dual-System architecture: main System for 5s game detection scans, lightweight System for 1s targeted metric refreshes
- GPU monitoring via `gpu_monitor.rs`: NVML for system-wide GPU%/VRAM (NVIDIA), Windows PDH for per-process GPU% (all GPU vendors — NVIDIA, AMD, Intel)
- 4 system metric rows with inline SVG sparklines: CPU, RAM, GPU, VRAM (60-sample rolling history)
- Per-process list with CPU%, RAM, GPU% columns + End Task with confirmation
- Focus protection against external overlay focus theft (Steam, Discord, NVIDIA)
- `session-update` event listener refreshes overlay when games start/stop
- 123 Rust tests + 195 frontend tests passing

**Audio Control Panel (complete):**
- Windows WASAPI per-app volume control: `IAudioSessionManager2` + `IAudioSessionEnumerator` + `ISimpleAudioVolume`
- Per-session volume sliders (0.0–1.0) and mute toggle; active game highlighted with accent border
- Master volume slider with mute toggle
- Input/output device listing via `IMMDeviceEnumerator` with current default indicated
- Default device switching via `IPolicyConfig` (undocumented but stable COM interface)
- Custom device aliases (user-editable display names) stored in settings
- Hidden sessions: auto-hide/reveal with "Show hidden (N)" toggle
- 1-second active polling while panel is visible
- All COM operations use `CoInitializeEx(COINIT_MULTITHREADED)` with proper cleanup

**Media Controls + Media Bookmarks (complete):**
- Windows SMTC integration (`media_controls.rs`): play/pause/skip/prev, track info (title, artist, album, source app)
- 3 visibility modes: Dynamic (auto-show when media playing), Always Visible, Hidden — configurable via HUD bar
- `useMediaSession` hook for dynamic visibility polling (3s interval)
- Hero section layout: media controls prominent in center, bookmarks secondary below divider
- Rapid polling: 500ms base interval; 0/150ms/400ms burst after transport actions for instant UI feedback
- Overlay focus retention: backend re-focuses overlay window 150ms after opening bookmark URLs
- Media bookmarks: SQLite `media_bookmarks` table (schema v14), carousel gallery in overlay panel
- Bookmark carousel: translateX-based sliding, scale/opacity animation by distance from active, dot indicators, arrow navigation
- Full categorized inline emoji grid (7 categories, ~146 emojis) replacing popup picker
- Delete with inline "Confirm?" state (3-second auto-reset)
- Ref-based state reads in save handler to avoid stale closure bugs; `onPointerUp` for save action (Tauri webview reliability)
- Inline add form in overlay + full CRUD/reorder BookmarkManager in Settings
- YouTube playlist autoplay: Rust-side URL rewriting fetches playlist HTML, extracts first video ID
- Reusable `EmojiPicker` component: 7 categories (~146 emojis), compact mode for overlay, popover with category filter
- 131 Rust tests + 195 frontend tests passing

**Quick Notes (complete):**
- Per-game notepad persisted in SQLite (`game_notes` table, schema v13)
- `__general__` note always exists and is not deletable — acts as a general-purpose scratchpad
- Notes persist even when emptied; only explicit Delete removes them
- **Overlay panel**: Tabbed interface (active game + General); debounced auto-save (500ms); character count + saved indicator
- **`/notes` page**: Compendium of all notes; General note pinned at top with accent border; "Create New Note" button with game search; expandable inline editor per note; inline styled delete confirmation (no system dialogs); contextual footer hint text
- **GameDetail sidebar**: Collapsible notes section with auto-save textarea and content indicator dot
- **Navigation**: Icon rail entry (after Profile), command palette "Go to Notes" action
- **Security**: Parameterized SQL queries (no injection), React JSX escaping (no XSS)
- 123 Rust tests + 195 frontend tests passing

---

### Pre-Phase 12: Comprehensive Codebase Audit
Full-stack code audit before the Phase 12 architectural shift. 6 parallel domain audits + 2 validation passes + 3 fix batches.

**Audit scope**: 75 Rust files (~12.5k LOC), 160 TS/TSX files (~25k LOC), 90 CSS files (~11.5k LOC)

**Findings**: 12 validated actionable issues (P0: 3, P1: 5, P2: 7) + 6 P3 backlog + test coverage gap

**P0 fixes (critical)**:
- Shared HTTP client with 15s timeout (`OnceLock` in `steam_client.rs`) replacing bare `reqwest::get()`
- API key sanitization: `.query()` builder + `sanitize_steam_error()` prevents keys leaking in error messages
- `delete_game()` wrapped in transaction + 4 missing tables added (notes, achievements, freshness, news)

**P1 fixes (important)**:
- ErrorBoundary added to overlay (`overlay-main.tsx`)
- `get_process_exe_name()` dead code removed (`audio_control.rs`)
- `batchFetchStarted` reset on failure (`LibraryView.tsx`)
- `cache_game_achievements()` + `cache_game_news()` wrapped in transactions
- `JSON.parse` guard in `parseSavedFilterRow`

**P2 fixes (polish)**:
- `formatLastPlayed` pluralization, `formatBytes` guard, source display names, ARIA role, catch-all route, UTF-8 URL encoding, `$schema` URLs

**Documentation**: Both tech overview docs fully rewritten through Phase 11.5.

- 138 Rust tests + 195 frontend tests passing (333 total)

### Pre-Phase 12: P3 Backlog + Test Coverage Improvement
Cleared all deferred technical debt and significantly expanded test coverage before Phase 12.

**P3 Backlog (6 items resolved):**
- `AppError::LockPoisoned` variant + `MutexExt<T>` trait — replaced 55+ manual `.lock().map_err(...)` calls across 21 files with `db.lock_or_err("DB")?`
- Removed `.expect()` from `SteamGridDbClient::new()` — now returns `Result<Self, AppError>`
- `PRAGMA busy_timeout=5000` added to SQLite connection init — prevents `SQLITE_BUSY` on overlay/main contention
- Atomic settings write — write to `.json.tmp` then `fs::rename` (safe on Windows since Rust 1.58+)
- `clear_all_data` confirmation token — requires `"CONFIRM_DELETE_ALL"` parameter
- Skipped: `steam_client.rs` `.expect()` (`OnceLock` can't return `Result`), `lib.rs:209` (Tauri runtime, no recovery)

**Test Coverage Improvement (107 new frontend tests):**
- Shared test factory file: `src/test/factories.ts` — `makeGame`, `makeMeta`, `makeFilters`, `makeSession`, `makeShelf`, `ts`
- Migrated 6 existing test files to shared factories (eliminated duplicate factory functions)
- New utility tests: `formatLastPlayed` (8 tests), `calculatePlayStreak` + `computePlaytimeInRange` (11 tests)
- New store tests: `metadataSlice` (17), `settingsSlice` (7), `shelvesSlice` (16), `librarySlice` extended (11 store-level + 8 mergeGames)
- New hook tests: `useSettings` (4), `useSteamLibrary` (6) — via `@testing-library/react` `renderHook`
- New component tests: `FloatingPanel` (10), `AddCustomGameDialog` (9)
- V8 coverage config added to `vite.config.ts`

- 138 Rust tests + 302 frontend tests passing (440 total, up from 333)

---

### Phase 12a: Command Palette Standardization
Quality-of-life overhaul of the command palette system — making overlay commands more discoverable, more capable, and properly scoped for cross-window execution.

**Category Prefix Matching:**
- 4 category prefixes: `theme` (24 actions: palettes, fonts, icons, scales), `sort` (7), `filter` (static + dynamic metadata), `go to`/`navigate` (6 nav actions)
- Exclusive mode: typing a prefix word (e.g., "theme") shows ONLY that category's actions — no generic results mixed in
- Refineable: "theme arctic" filters within theme category; "sort name" narrows sort options
- Stacks with existing game action prefixes ("favorite {game}", "notes {game}") — game prefixes checked first
- `matchCategoryPrefix()` function + `CATEGORY_PREFIX_DEFS` constant in `commandPalette.ts`
- Bumped `MAX_ACTION_RESULTS` from 5 → 12, `MAX_FILTER_RESULTS` from 3 → 5

**Hints Dropdown:**
- `?` button on overlay command center search bar
- Dropdown shows 6 categories (Navigate, Filter, Sort, Theme, Favorite, Notes) with icon, label, description
- Click a hint → autofills the prefix text (e.g., "favorite ") into search bar, closes dropdown, refocuses input
- Auto-dismisses when user starts typing
- `PALETTE_HINTS` exported array + `PaletteHint` type

**Reset All Filters Action:**
- `action:reset-filters` clears: search query, installed-only, favorites-only, hidden-only, tag IDs, genre IDs, Steam tag names, category IDs, source filter
- Navigates to `/library` after reset
- Searchable via keywords: "reset", "clear", "filter", "all", "remove"

**Overlay `show_main` Scoping:**
- `overlay_execute_palette_action` Rust command now accepts `show_main: bool` parameter
- `actionNeedsMainWindow()` helper in `OverlayCommandCenter.tsx` determines per-action: theme/font/icons/scale changes, tray toggle, dev mode, refresh, metadata, scan, favorite → `false` (no main window focus); navigation, filters, sort, view changes, dialogs → `true`
- Prevents jarring window focus steal when user is just changing a theme from the overlay

**Bidirectional Overlay Settings Sync:**
- Problem: `AppIcon` reads from `useSettingsStore` (Zustand), but overlay never hydrated Zustand → icons stuck on "classic" after changing icon set
- Fix 1: `OverlayApp.tsx` syncs local settings to `useSettingsStore.setState()` so shared components (`AppIcon`) work
- Fix 2: `notify_settings_changed` now emits to both "main" AND "overlay" windows (was main-only)
- Fix 3: `useTrayListener.ts` palette action handler calls `invoke("notify_settings_changed")` after saving settings
- Overlay listens for `settings-changed` event → reloads settings from disk → updates local state + Zustand

**Files changed**: `commandPalette.ts`, `commandPalette.test.ts`, `overlay.rs` (Rust), `OverlayCommandCenter.tsx`, `OverlayApp.tsx`, `useTrayListener.ts`, `CommandCenter.css`, `types/ui.ts`, `types/index.ts`

- 138 Rust tests + 339 frontend tests passing (477 total, up from 440)

---

### Phase 12b: AI Foundation + Pattern Matcher
Natural language command resolution for the overlay command center — Tier 1 of a two-tier AI architecture (pattern matcher + cloud API).

**Architecture:**
- Two-tier hybrid: Rust pattern matcher (instant, offline) + cloud API (opt-in, future)
- Local LLM tier (originally planned as Tier 2 with Qwen3-0.6B) **removed** — pattern matcher handles structured commands well enough offline, and cloud handles everything else better
- Pattern matcher outputs the SAME action IDs the palette already uses — no new execution paths

**Rust AI Service** (`src-tauri/src/services/ai/`):
- `AiOrchestrator::resolve()` — tier cascade coordinator with clear extension point for cloud API
- `PatternMatcher::resolve()` — tokenize query → run 9 extractors → emit standard action IDs
- `QueryContext` built from CacheDb (games, genres, tags, categories) + static config (themes, fonts, icons, scales, sort fields, sources)
- 9 extractors (priority-ordered): reset, navigation, sort, theme/font/icons/scale, game actions (favorite/notes), quick filters (installed/favorites/hidden), source/launcher, genre+tag+category
- Fuzzy tag matching: `normalize_tag()` strips hyphens/spaces/underscores — "singleplayer" matches "Single-player", "coop" matches "Co-op"
- Preserves original DB casing in action IDs (frontend expects exact case for tag/category filters)

**CacheDb Extensions:**
- `get_all_game_names()` — game_id + name pairs
- `get_distinct_genres()` — genre_id + name from metadata JSON
- `get_distinct_steam_tags()` — tag names from metadata JSON
- `get_distinct_categories()` — category_id + description from metadata JSON

**Frontend Integration:**
- `shouldTriggerAI()` heuristic — 3+ words OR trigger words, not a category prefix, few regular results
- Debounced 150ms async call to `ai_resolve_intent` from overlay command center
- AI suggestion card in `CommandPaletteResults` at index 0 (sparkle icon, accent-tinted styling)
- Selecting the card relays all resolved actions via `overlay_execute_palette_action`
- Monotonic sequence counter prevents stale results from appearing

**Example queries:**
- "installed singleplayer rpg games sorted by playtime" → 3 filters + sort
- "show epic games" → launcher filter
- "games with controller support" → category filter
- "change theme to arctic frost" → theme switch
- "favorite skyrim" → toggle favorite on matched game

- 176 Rust tests + 345 frontend tests passing (521 total, up from 477)

---

### Phase 12c: Cloud AI Integration
Opt-in cloud API tier for reasoning, recommendations, and conversational queries the pattern matcher can't handle.

**Two-Tier AI System:**
- Local pattern matcher (instant, auto-fires on typed queries) + cloud API (user-initiated via "Ask Assistant")
- Split AI commands: `ai_resolve_intent` (pattern matcher only) + `ai_cloud_resolve` (cloud, explicit)
- Pattern matcher confidence scoring based on token coverage ratio (actions/tokens)

**Gemini 3 Flash Integration:**
- API key stored in Windows Credential Manager (keyring crate, service: `app.theroost`)
- Cloud AI "Ask Assistant" button appears below pattern matcher results and regular commands
- Full AI response rendering with markdown (bold/italic), game mention extraction, batch action execution

**Context Builder:**
- Configurable scope: all games, installed only, or recently played
- Exclude/include game lists for fine-grained control
- Per-game context includes genres, tags, playtime (Steam-only), and last-played date

**Settings UI:**
- Provider selection, API key management (store/delete/status)
- Daily request limit configuration
- Context scope and exclude/include list management

**Security & Cost Guardrails:**
- Rate limiting and token budget guardrails
- No sensitive data (API keys, file paths) sent to cloud
- Cross-window relay: overlay command center → Rust → main window for action execution

- 206 Rust tests + 350 frontend tests passing (556 total, up from 521)

---

---

# Version 1.5 — Release & Distribution

Getting The Roost from a dev build to an installable, auto-updating desktop application.

---

### Phase R1+R3: Build Pipeline, Installer & Auto-Updates
From dev build to installable, auto-updating desktop application — completed in a single sprint.

**NSIS Installer:**
- NSIS installer (`.exe`) as primary format with custom icon, install directory picker
- Tauri bundler configured: `bundle` section in `tauri.conf.json` with copyright, descriptions, icon set
- `createUpdaterArtifacts: "v1Compatible"` generates `.nsis.zip` + `.sig` alongside installer

**GitHub Actions CI/CD:**
- **Release workflow** (`release.yml`): triggered on version tags (`v*`), builds installer + updater artifacts, generates `latest.json` manifest, creates GitHub Release with all assets
- **CI workflow** (`ci.yml`): triggered on master pushes — runs ESLint, TypeScript check, `cargo fmt --check`, `cargo clippy -D warnings`, frontend tests, and Rust tests
- Ed25519 signing: private key in GitHub Actions secrets (`TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`), public key embedded in `tauri.conf.json`
- `latest.json` auto-generated with correct `.sig` file content and URL-encoded download links

**Auto-Updates (OTA):**
- `tauri-plugin-updater` v2 — update endpoint: GitHub Releases `latest.json`
- `UpdateBanner` component: automatic check 30s after launch + every 4 hours; dismissible per-version
- Settings UI: "Check for Updates" button, install button with progress states, release notes display
- Detailed error reporting: `tracing::error!` in Rust + frontend error message extraction
- Updater commands: `check_for_update`, `install_update`, `get_app_version`

**Launch on Startup:**
- `tauri-plugin-autostart` v2 — Windows auto-launch via `LaunchAgent`
- Settings UI checkbox with description: "Launch on startup"
- Commands: `get_autostart_enabled`, `set_autostart_enabled`

**Versioning:**
- Semantic versioning synced across `tauri.conf.json`, `package.json`, `Cargo.toml`
- Git tags (`v1.1.0`, `v1.1.1`, `v1.1.2`) trigger release builds
- Current release: **v1.1.2** (3 published releases on GitHub)

**Release Flow (end-to-end, verified working):**
1. Bump version in `tauri.conf.json` + `package.json` + `Cargo.toml` → commit → push tag
2. GitHub Actions: build → sign → generate `latest.json` → create GitHub Release (draft)
3. Developer publishes release
4. Running app instances detect update → UpdateBanner shown → user installs from Settings

- 205 Rust tests + 350 frontend tests passing (555 total)

---

---

# Version 1.2.0 — Stability (Done)

### Route Error Boundaries
Per-route error handling so a crash in one page doesn't take down the whole app.

- `RouteErrorFallback` component using React Router's `useRouteError()` — renders in-place via `<Outlet />`, keeping IconRail visible
- Per-route `errorElement` on all 6 content routes (library, activity, profile, notes, settings, debug)
- "Try Again" (re-mounts route) and "Go to Library" (safe fallback) recovery buttons
- `"routing"` log category — errors forwarded to debug panel with path, message, and stack metadata
- Fixed pre-existing bug: `ErrorBoundary.css` using non-existent CSS variable names (`--bg-*` → `--color-bg-*`)
- 205 Rust tests + 354 frontend tests passing (559 total)

---

---

# Version 1.3.0 — Personal Ratings & Reviews (Done)

### v1.3.0 — Personal Ratings & Reviews
5-star rating system with half-star precision, optional personal reviews, full library integration, and AI awareness.

**Rating System:**
- 5-star with half-star precision (stored as 1-10 integer in SQLite `game_ratings` table, schema v18)
- Interactive `StarRating` component with CSS `clip-path` half-star rendering
- Rate from GameDetail sidebar (after action buttons) with clickable stars + "Clear rating" button
- Quick-rate from game card right-click context menu with inline `StarRating`
- Visual rating badge on game cards (toggleable via Card Display settings): star icon + numeric display (e.g., "4.5")
- Sort library by "My Rating" (unrated games sort to bottom)
- Filter: "Rated" / "Unrated" dropdown in library controls
- List view: "My Rating" column with read-only star display

**Personal Reviews:**
- Per-game review text (separate from notes — notes are for personal reference, reviews are evaluative)
- Collapsible review section in GameDetail sidebar with auto-save textarea (500ms debounce)
- Review stored alongside rating in single `game_ratings` table

**AI Integration:**
- Pattern matcher: `extract_rating_filters()` extractor — "highest rated", "top rated", "rated", "unrated"
- Context builder: user ratings included in game lines (e.g., "Game Name (42h, rated 4.5/5)")
- Orchestrator: `personalRating` sort field with aliases ("my rating", "personal rating", "stars")

**Command Palette:**
- `sort:personalRating` — "Sort by My Rating"
- `filter:rated` / `filter:unrated` — filter by rating status
- `action:reset-filters` updated to clear rating filters

**Backend:**
- `game_ratings` table: `game_id TEXT PK, rating INTEGER CHECK(1-10), review TEXT, updated_at INTEGER`
- CacheDb CRUD: `get_game_rating`, `save_game_rating` (upsert), `delete_game_rating`, `get_all_ratings`, `get_all_ratings_with_names`
- 4 Tauri commands in `commands/ratings.rs`
- Delete cascade: ratings removed with game in `delete_game()` transaction

**Frontend:**
- `ratingsSlice` Zustand store with `Map<string, GameRating>` for O(1) lookups
- `StarRating` component (interactive + read-only modes)
- Extended `LibraryFilters` with `filterByRated` and `filterByMinRating`
- Extended `CardDisplayOptions` with `showRatingBadge`

- 213 Rust tests + 366 frontend tests passing (579 total)

---

# Version 1.3.5 — Settings Tabbed Layout (Done)

### v1.3.5 — Settings Tabbed Layout
Refactored the Settings page from a single scrollable column (14 sections) into a 5-tab layout for quick access.

**Tab Grouping:**
- **General**: Application (version/updates), System Tray, Startup
- **Connections**: Steam Connection, Cover Art (SteamGridDB), Cloud AI
- **Appearance**: Theme Builder, Card Display
- **Navigation**: Overlay shortcut, sidebar mode, media controls, Media Bookmarks
- **Advanced**: Tags, Developer Settings

**Implementation:**
- Tab panels use CSS `display: none` / `display: flex` (not conditional rendering) to preserve sub-component state (TagManager, BookmarkManager, ThemeBuilder internal `useState` and mount-time fetches)
- Save bar moved outside scroll area — always visible regardless of scroll position
- Tab bar between save bar and scrollable content with accent-colored active indicator
- `useBlocker` unsaved-changes modal still works across all tabs
- Theme/scale-aware styling via CSS variables

---

---

# Version 1.4.0 — Manual Playtime Entry (Done)

### v1.4.0 — Manual Playtime Entry
Added manual playtime editing for non-Steam games (Manual, Epic, GOG, EA, Ubisoft, Battle.net).

**Implementation:**
- New `manual_playtime_minutes` column on `games` table (schema v19)
- Two modes: "Set Total" (overwrite) and "Add" (increment)
- Inline editor in GameDetail Quick Stats with hours + minutes inputs
- Process monitor auto-accumulates tracked session duration for non-Steam games
- All playtime queries updated: overlay, AI context, top-games leaderboard
- Non-Steam games now show accurate playtime across profile stats, overlay, and sorting

---

# Version 1.4.1 — Last-Played Fix (Done)

### v1.4.1 — Last-Played Tracking for Non-Steam Games
Patch fix: "sort by last played" now works correctly for non-Steam games.

**Root cause**: Process monitor never called `set_last_played()` when sessions started, and the external scanner hardcoded `last_played: None` when building Game objects for non-Steam games.

**Fixes:**
- Process monitor now calls `set_last_played()` on session start for all games
- External scanner reads `last_played` from DB for both scanned launcher games and manual games
- `update_custom_game` command reads `last_played` from DB
- New `get_last_played()` CacheDb method

---

---

# Version 2.0 — Planned

Each feature below ships as an incremental minor version (v1.9.0, v1.10.0, etc.). Ordered by user-facing value first (backup), then infrastructure (storage, install management), then major integrations (AI, friends, controller). Once all features are shipped, the app elevates to 2.0.0.

---

### v1.5.0 — Custom Game Art Upload ✅ SHIPPED
Centralized Art Management Menu with local image upload, crop/reposition, and SteamGridDB picker — for ALL games including Steam.

- **Art Management Menu**: Single modal with 3 steps (overview → picker → crop) replacing scattered art buttons
- File picker for local images (PNG, JPG, WebP, max 10 MB) with Tauri dialog
- `react-easy-crop` for zoom/pan crop with locked aspect ratios per art type
- Server-side crop + resize via Rust `image` crate (avoids CORS issues)
- All 3 art types: cover (600×900), hero (1920×620), icon (256×256)
- Works for ALL games (Steam + non-Steam) — unified resolution pipeline
- Local storage in `%APPDATA%/app.theroost/art/`, served as data URLs via `read_image_base64` backend command
- Remove button to reset custom art back to default
- Schema v20: `local_path` column added to `game_images` table

---

### v1.6.0 — Manual Shelf Assignment ✅ SHIPPED
Hybrid shelves — filter rules + manual game pins. Users can pin/unpin games to any shelf via context menu or GameDetail sidebar.

- `ShelfConfig` extended with `pinnedGameIds: string[]` (stored in settings.json)
- `processShelfGames()` hybrid pipeline: hidden filter → preset → shelf filters → pin union → global search → sort → slice
- Pinned games always appear regardless of filters, but still respect hidden status and global search
- Right-click context menu: "Shelves" section with checkbox per shelf
- GameDetail sidebar: toggleable shelf chips with pin/plus icons
- Shelf editor: "Manually Pinned" section for bulk management with dead-pin cleanup
- Settings migration: old shelves without `pinnedGameIds` backfill to `[]`
- No Rust changes, no DB migration, no new Tauri commands
- 227 Rust tests + 382 frontend tests passing (609 total)

---

### v1.7.0 — Game News Feed ✅ SHIPPED
Aggregated news feed from your library — only the games you care about.

**Backend (`news_service.rs` + `cache_db.rs`):**
- Steam GetNewsForApp/v2 API — fetches news for favorited + recently played games (last 15 days)
- `FeedNewsItem` model with `source_id` for art resolution, `is_external` flag for source filtering
- `news_read` + `game_news` tables (schema v22), 1-hour TTL with force-refresh bypass
- 6 Tauri commands: `fetch_game_news`, `fetch_followed_games`, `fetch_news_feed`, `mark_news_read`, `get_unread_news_count`, `clear_news_cache`
- Non-Steam games silently skipped (news comes from Steam's API)

**News Feed UI (`/news` route):**
- Chronological feed of `NewsArticleCard` components with game hero art banner, game name, headline, author, date, snippet
- Click to expand: `NewsArticleDetail` modal with full article body + "Open in Browser" button
- `NewsGameFilter` popover: multi-select game dropdown to focus on specific games' news
- Source filter: "All" / "Official Only" / "Third Party Only" segmented control (based on `feed_type`)
- Mark as read (on article open) + "Mark All Read" button
- Unread count badge on icon rail "News" entry
- Force refresh button bypasses 1-hour cache TTL
- "Clear News Cache" in Developer Settings

**Content Parsing (`steamBBCode.ts`):**
- Dual-format parser: detects HTML vs BBCode via `isHtmlContent()` regex
- `parseNewsContent()` — BBCode path converts 15 tag types (headings, lists, URLs, YouTube, spoilers, tables, etc.) to safe HTML; HTML path uses allowlist-based sanitizer (`ALLOWED_TAGS` + attribute filtering + URL validation)
- `stripMarkup()` — plain text extraction for card snippets
- YouTube `[previewyoutube]` tags rendered as styled clickable links (not embeds)
- XSS prevention: HTML entity escaping for BBCode, allowlist sanitization for HTML

**Navigation:**
- `/news` route with `errorElement: <RouteErrorFallback />`
- Icon rail entry with unread badge (pulsing dot when > 0)
- `nav:news` command palette action
- 234 Rust tests + 390 frontend tests passing (624 total)

---

### v1.8.0 — Gaming Recap & Insights ✅ SHIPPED
Auto-generated monthly and yearly gaming recaps — your personal "gaming wrapped" experience.

**Backend (`recap_service.rs` + `fun_comparisons.rs` + `cache_db.rs`):**
- `generate_monthly_recap` / `generate_yearly_recap` — compute recap data from sessions, achievements, game metadata
- `auto_generate_if_needed` — runs 10s after app launch, checks if new month/year recaps are due
- `RecapData` model with sub-structs: `RecapTopGame`, `RecapGenreEntry`, `RecapBusiestDay`, `RecapDiscovery`, `RecapAchievement`, `RecapComparison`, `RecapSummary`
- `fun_comparisons.rs` — ~40 hardcoded activities across 3 tiers, `pick_comparisons` algorithm maps playtime to relatable activities
- `recaps` table (schema v23): `period_key TEXT PK, period_type TEXT, encoded_data TEXT, generated_at INTEGER`
- New DB queries: `get_sessions_in_range`, `get_achievements_in_range`, `get_first_session_per_game`, `get_game_names_bulk`, `get_genres_for_games`
- 4 Tauri commands: `get_recap`, `list_recaps`, `generate_recap`, `delete_recap`

**Monthly Recap Content:**
- Total playtime, sessions, unique games, Game of the Month
- Top 5 games by playtime (BarChart)
- Average/longest session, longest play streak, busiest day
- Genre breakdown (PieChart)
- Trend comparison vs previous month (up/down indicators)
- New discoveries (games first played that month)
- Achievement highlights (top 5 rarest unlocked)
- Fun comparisons ("That's X flights from NYC to Tokyo")

**Yearly Recap (additional):**
- Game of the Year, month-by-month playtime timeline (AreaChart)

**Frontend (`components/activity/recap/`):**
- Activity page header: "Activity" / "Recaps" tab toggle
- `RecapTab` orchestrator + `RecapPeriodSelector` (monthly/yearly period picker)
- `RecapView` with 8 section components: `RecapHeroSection`, `RecapStatsGrid`, `RecapTopGames`, `RecapGenreBreakdown`, `RecapMonthlyTimeline` (yearly only), `RecapDiscoveries`, `RecapAchievements`, `RecapFunComparisons`
- `recapSlice` Zustand store: summaries, currentRecap, selectedPeriodKey
- `recapApi` in `services/tauri.ts`
- CSS: `RecapTab.css`, `RecapView.css`, `RecapSections.css`
- 248 Rust tests + 427 frontend tests passing (675 total)

---

### v1.9.0 — Backup & Restore ✅ SHIPPED
Data safety — package your entire Roost configuration into a single `.roost` ZIP archive and restore it on any machine.

**Backup:**
- "Create Backup" button in Settings > Advanced with pre-backup size estimate
- Contents: `manifest.json` (app version, schema version, timestamps, file counts), `theroost.db` (SQLite database), `settings.json`, `credentials_hint.json` (which API keys were configured — names only, never values), `art/` directory (custom uploaded PNGs)
- WAL checkpoint before copy for SQLite consistency
- Native save dialog (default: Desktop), progress events per phase
- API key values (Windows Credential Manager) are explicitly excluded

**Restore:**
- "Restore from Backup" button → native file picker → archive validation (integrity, schema compatibility)
- Full-screen 4-step RestoreWizard: backup summary → active session check → credential re-entry → restore with progress
- Pre-restore safety backup with automatic rollback on failure
- Schema compatibility: same/older = ok (migrations run on open), newer = warn, 5+ ahead = block
- Credential hints show which API keys the user previously had; wizard prompts for re-entry only for those
- App restart after successful restore

**Implementation:** 7 Tauri commands, `backup_service.rs` (estimate, create, validate, restore, safety backup, rollback, credential hints), `BackupRestoreSection.tsx`, `RestoreWizard.tsx` + CSS, 15 Rust tests + 16 frontend tests

---

### v1.10.0 — Storage Overview ✅ SHIPPED
Game-focused disk usage visualization — see exactly how much space your games consume.

**Scanning approach:**
- Leverages existing `install_path` data from all 6 launcher scanners + custom games
- Windows `GetDiskFreeSpaceExW` API for instant drive-level stats (total/free)
- `walkdir` crate recursively measures each game directory, with progress events to the frontend
- No full-disk scan needed — only walks known game directories

**Storage page (`/storage` route):**
- **Stat cards**: Games on Disk, Game Storage, Largest Game, Drives
- **Drive Overview**: Per-drive stacked bars showing game vs other vs free space, with percentage labels and legend
- **Storage by Launcher**: Recharts donut chart breaking down total game storage by source (Steam, Epic, GOG, etc.)
- **Games by Size**: Horizontal bar chart of all games sorted by disk usage (default: top 20, toggle to show all)
- **Scan info**: Displays scan duration after completion
- Auto-scans on page visit; "Rescan" button for manual refresh
- Loading state with per-game progress ("Scanning 12 of 47 games... Cyberpunk 2077")

**Implementation:** 1 Tauri command (`scan_storage`), `storage_service.rs` (drive stats + walkdir + progress events), `StorageView.tsx` + CSS, `storage` icon in all 6 icon sets, command palette `nav:storage` action, 4 Rust tests + 8 frontend tests
- 267 Rust tests + 451 frontend tests passing (718 total)

---

### v1.11.0 — Steam Install/Uninstall
Manage Steam game installations directly from The Roost — builds on storage overview.

- Browse uninstalled Steam library games (owned but not on disk)
- Install via `steam://install/{appid}` URI scheme (delegates to Steam client)
- Uninstall via `steam://uninstall/{appid}` URI scheme
- Select target drive/Steam library folder for installation
- Installation progress tracking via Steam client IPC or polling
- Integrated with storage overview: see free space before installing

---

### v1.12.0 — Conversational AI Assistant
Full conversational assistant with multi-provider support — evolve the cloud AI into a chat experience.

**Conversational Assistant:**
- Chat-style UI panel (overlay floating panel or dedicated `/assistant` route)
- Conversation history with multi-turn context carry-over
- Richer responses: game comparisons, personalized recommendations with reasoning
- Action suggestions inline with conversation (e.g., "Want me to filter your library to these?")
- Conversation persistence (SQLite-backed chat history)
- Achievement data accessible to cloud AI for richer insights

**Multi-Provider Support:**
- Claude (Anthropic) integration as an alternative cloud provider
- OpenAI (GPT) integration as an alternative cloud provider
- Provider-agnostic abstraction layer in Rust (`AiProvider` trait)
- Per-provider API key management in Windows Credential Manager
- User selects preferred provider in Settings (or lets the app choose based on availability)
- Unified prompt/context format that works across all providers

---

### v1.13.0 — Friends Integration
Pull in friend data from external launchers — see who's online and what they're playing.

**Steam Friends:**
- Fetch friends list via Steam Web API (`GetFriendList`, `GetPlayerSummaries`)
- Display friends with avatar, display name, and online status (Online, Offline, Away, Busy, Snooze)
- Currently playing: show game name + duration for friends in-game
- Friend profile view: public game library, top played games, recent activity (from Steam data)
- Auto-refresh on configurable interval (e.g., every 60s)

**Multi-Launcher Friends (stretch):**
- GOG Galaxy friends (if API access available)
- Epic friends (if API access available)
- Launcher-agnostic friend model in DB: `friends` table with `source`, `source_id`, `display_name`, `avatar_url`

**Friends UI:**
- Friends list panel: sortable by status (online first), searchable by name
- Compact sidebar or dedicated `/friends` route
- "Now Playing" badges on friends currently in-game
- Click friend → view their profile summary
- Overlay integration: friends panel as a FloatingPanel HUD option

---

### v1.14.0 — Controller & Couch Support
Make The Roost fully navigable with a gamepad — same UI, adapted for couch distance and controller input.

**Controller Input:**
- Gamepad API integration (Web Gamepad API or Tauri native plugin)
- D-pad navigation with focus management across all interactive elements
- A = select/launch, B = back/close, X = context action, Y = search/command palette
- Analog stick for smooth scrolling through game grids
- Trigger buttons for page-level navigation (LB/RB = prev/next shelf or section)
- Configurable button mapping

**Couch Adaptation (same app, not a separate layout):**
- "Couch mode" toggle: adjusts UI scale, focus indicators, and hit target sizes for distance viewing
- Builds on existing `data-ui-scale` system with a controller-optimized scale tier
- Visible focus rings on all interactive elements for spatial navigation
- On-screen keyboard for search input when no physical keyboard is available
- Game detail and settings adapted for larger text and high-contrast at distance

**Overlay Integration:**
- Controller-aware overlay variant (navigate HUD panels with gamepad)
- Quick-launch wheel: radial menu of recent/favorite games

---

## Ideas & Backlog

Features that may be explored in future versions:

| Feature | Description |
|---------|-------------|
| Achievements Browser | Dedicated page for browsing per-game achievements, completion %, rarity stats |
| Enhanced Pattern Matcher | Learning from corrections, compound queries, context-aware suggestions |
| Plugin System | User-extensible architecture for custom launchers, data sources, or UI panels |
| Game Deals | Price tracking and deal alerts from IsThereAnyDeal or similar APIs |
