use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::Emitter;

use crate::models::system_metrics::{ProcessMetrics, SystemMetricsSnapshot, SystemSample};
use crate::services::cache_db::CacheDbHandle;

const POLL_INTERVAL: Duration = Duration::from_secs(5);

/// How often to reload install paths / exe cache from DB (in scan cycles).
/// 12 cycles × 5 seconds = 60 seconds.
const CACHE_RELOAD_INTERVAL: u32 = 12;

/// Maximum number of system-wide samples to keep in the rolling buffer.
/// 60 samples × 5 seconds = 5 minutes of history.
const MAX_HISTORY_SAMPLES: usize = 60;

/// Executables known to NOT be games — skip these during slow-path directory matching.
const EXCLUDED_EXES: &[&str] = &[
    // Steam
    "steam.exe",
    "steamwebhelper.exe",
    "steamservice.exe",
    "gameoverlayui.exe",
    "steamclient.dll",
    // Epic Games Store
    "epicgameslauncher.exe",
    "unrealcefsubprocess.exe",
    "epicwebhelper.exe",
    "eosoverlayrenderer-win64-shipping.exe",
    // GOG Galaxy
    "galaxyclient.exe",
    "galaxyclientservice.exe",
    "galaxycommunication.exe",
    // EA App / Origin
    "eadesktop.exe",
    "eabackgroundservice.exe",
    "ealocalhoststarter.exe",
    "origin.exe",
    "originwebhelperservice.exe",
    // Ubisoft Connect
    "upc.exe",
    "ubisoftconnect.exe",
    "ubisoftgamelauncher.exe",
    "ubisoftgamelauncher64.exe",
    // Battle.net
    "battle.net.exe",
    "agent.exe",
    "blizzardupdater.exe",
    // Generic non-game executables
    "uninstall.exe",
    "setup.exe",
    "installer.exe",
    "crashhandler.exe",
    "crashhandler64.exe",
    "crashreporter.exe",
    "vc_redist.x64.exe",
    "vc_redist.x86.exe",
    "dxsetup.exe",
    "dotnetfx35.exe",
    "vcredist_x86.exe",
    "vcredist_x64.exe",
    "directx_jun2010_redist.exe",
];

/// Normalize a path for case-insensitive comparison on Windows.
/// Lowercases and converts backslashes to forward slashes.
fn normalize_path(path: &str) -> String {
    path.to_lowercase().replace('\\', "/")
}

/// Normalize a path and ensure it ends with `/` for safe prefix matching.
fn normalize_install_path(path: &str) -> String {
    let mut norm = normalize_path(path);
    if !norm.ends_with('/') {
        norm.push('/');
    }
    norm
}

/// In-memory state for the process monitor.
struct ProcessMonitorState {
    /// lowercase exe_name → Vec<(game_id, normalized exe_path)>
    exe_cache: HashMap<String, Vec<(String, String)>>,
    /// normalized install_path (with trailing /) → game_id
    install_paths: HashMap<String, String>,
    /// Set of game_ids currently detected as running
    active_games: HashSet<String>,
    /// Counter for periodic cache reloads
    scan_count: u32,
}

impl ProcessMonitorState {
    fn new() -> Self {
        Self {
            exe_cache: HashMap::new(),
            install_paths: HashMap::new(),
            active_games: HashSet::new(),
            scan_count: 0,
        }
    }

    /// Rebuild caches from database.
    fn load_from_db(&mut self, db: &CacheDbHandle) -> Result<(), String> {
        let db_guard = db.lock().map_err(|e| format!("DB lock poisoned: {}", e))?;

        // Load known executables
        self.exe_cache.clear();
        let exes = db_guard
            .get_all_game_executables()
            .map_err(|e| format!("Failed to load executables: {}", e))?;
        for (game_id, exe_path, exe_name) in exes {
            let key = exe_name.to_lowercase();
            let norm_path = normalize_path(&exe_path);
            self.exe_cache
                .entry(key)
                .or_default()
                .push((game_id, norm_path));
        }

        // Load install paths (with trailing slash for safe prefix matching)
        self.install_paths.clear();
        let paths = db_guard
            .get_all_install_paths()
            .map_err(|e| format!("Failed to load install paths: {}", e))?;
        for (game_id, path) in paths {
            let norm = normalize_install_path(&path);
            self.install_paths.insert(norm, game_id);
        }

        Ok(())
    }
}

// ── System Metrics (shared state for overlay) ──────────────────────────────

/// Container for system-wide and per-process metrics, shared with Tauri commands.
/// Owns its own lightweight `System` instance for targeted refreshes (CPU, memory,
/// and a handful of known PIDs) — separate from the process monitor's full-scan System.
pub struct SystemMetrics {
    system: System,
    gpu: crate::services::gpu_monitor::GpuMonitor,
    last_gpu_snapshot: Option<crate::services::gpu_monitor::GpuSnapshot>,
    history: VecDeque<SystemSample>,
    /// pid → (game_id, display_name) — updated by process monitor after each scan
    tracked_pids: HashMap<u32, (String, String)>,
    self_pid: u32,
    cpu_count: usize,
    /// Timestamp of last refresh (avoids redundant work when frontend is actively polling)
    last_refresh: i64,
}

impl SystemMetrics {
    pub fn new() -> Self {
        let mut system = System::new();
        // First refresh_cpu_usage() returns 0; needed to prime delta tracking
        system.refresh_cpu_usage();
        let cpu_count = system.cpus().len();
        Self {
            system,
            gpu: crate::services::gpu_monitor::GpuMonitor::new(),
            last_gpu_snapshot: None,
            history: VecDeque::with_capacity(MAX_HISTORY_SAMPLES),
            tracked_pids: HashMap::new(),
            self_pid: std::process::id(),
            cpu_count,
            last_refresh: 0,
        }
    }

    /// Replace the set of tracked game PIDs (called by process monitor after each scan).
    pub fn update_tracked_pids(&mut self, pids: HashMap<u32, (String, String)>) {
        self.tracked_pids = pids;
    }

    /// Check if a PID is a tracked game process (for kill validation).
    pub fn is_tracked_game_process(&self, pid: u32) -> bool {
        self.tracked_pids.contains_key(&pid)
    }

    /// Active refresh — called by `get_system_metrics` command (frontend-driven, 1s).
    /// Does a lightweight targeted sysinfo refresh and returns a fresh snapshot.
    pub fn refresh_and_snapshot(&mut self) -> SystemMetricsSnapshot {
        let now = chrono::Utc::now().timestamp();
        self.do_refresh(now);
        self.build_snapshot()
    }

    /// Warm background sample — called by process monitor every ~10s.
    /// Skips if a recent frontend call already refreshed within the last 5s.
    pub fn warm_sample(&mut self) {
        let now = chrono::Utc::now().timestamp();
        if now - self.last_refresh < 5 {
            return; // Frontend is actively polling — skip redundant warm sample
        }
        self.do_refresh(now);
    }

    /// Lightweight targeted refresh: CPU counters + memory + known PIDs only.
    fn do_refresh(&mut self, now: i64) {
        self.last_refresh = now;

        self.system.refresh_cpu_usage();
        self.system.refresh_memory();

        // Only refresh tracked game PIDs + self (NOT all OS processes)
        let pids: Vec<Pid> = std::iter::once(Pid::from_u32(self.self_pid))
            .chain(self.tracked_pids.keys().map(|&pid| Pid::from_u32(pid)))
            .collect();
        self.system
            .refresh_processes(ProcessesToUpdate::Some(&pids), true);

        // GPU refresh (NVML system metrics + PDH per-process + NVML per-process VRAM)
        let gpu_snap = self.gpu.refresh();

        let sample = SystemSample {
            timestamp: now,
            cpu_percent: self.system.global_cpu_usage(),
            ram_used: self.system.used_memory(),
            ram_total: self.system.total_memory(),
            gpu_percent: gpu_snap.system_gpu_percent,
            gpu_vram_used: gpu_snap.system_vram_used,
            gpu_vram_total: gpu_snap.system_vram_total,
        };
        self.push_sample(sample);
        self.last_gpu_snapshot = Some(gpu_snap);
    }

    fn push_sample(&mut self, sample: SystemSample) {
        if self.history.len() >= MAX_HISTORY_SAMPLES {
            self.history.pop_front();
        }
        self.history.push_back(sample);
    }

    fn build_snapshot(&self) -> SystemMetricsSnapshot {
        let current = self.history.back().cloned().unwrap_or(SystemSample {
            timestamp: 0,
            cpu_percent: 0.0,
            ram_used: 0,
            ram_total: 0,
            gpu_percent: None,
            gpu_vram_used: None,
            gpu_vram_total: None,
        });

        let cpu_div = self.cpu_count.max(1) as f32;
        let mut processes = Vec::new();

        let gpu_snap = self.last_gpu_snapshot.as_ref();

        // The Roost's own process
        if let Some(proc) = self.system.process(Pid::from_u32(self.self_pid)) {
            processes.push(ProcessMetrics {
                pid: self.self_pid,
                game_id: "__self__".to_string(),
                name: "The Roost".to_string(),
                exe_name: proc.name().to_string_lossy().to_string(),
                cpu_percent: proc.cpu_usage() / cpu_div,
                ram_bytes: proc.memory(),
                gpu_percent: gpu_snap.and_then(|g| g.per_process_gpu.get(&self.self_pid).copied()),
                gpu_vram_bytes: gpu_snap
                    .and_then(|g| g.per_process_vram.get(&self.self_pid).copied()),
            });
        }

        // Game processes
        for (&pid, (game_id, name)) in &self.tracked_pids {
            if let Some(proc) = self.system.process(Pid::from_u32(pid)) {
                processes.push(ProcessMetrics {
                    pid,
                    game_id: game_id.clone(),
                    name: name.clone(),
                    exe_name: proc.name().to_string_lossy().to_string(),
                    cpu_percent: proc.cpu_usage() / cpu_div,
                    ram_bytes: proc.memory(),
                    gpu_percent: gpu_snap.and_then(|g| g.per_process_gpu.get(&pid).copied()),
                    gpu_vram_bytes: gpu_snap.and_then(|g| g.per_process_vram.get(&pid).copied()),
                });
            }
        }

        SystemMetricsSnapshot {
            current,
            history: self.history.iter().cloned().collect(),
            processes,
            cpu_count: self.cpu_count,
        }
    }
}

pub type SystemMetricsHandle = Arc<Mutex<SystemMetrics>>;

// ── Main entry point ────────────────────────────────────────────────────────

/// Main entry point — spawned as a background async task.
pub async fn run(app_handle: tauri::AppHandle, db: CacheDbHandle, metrics: SystemMetricsHandle) {
    tracing::info!("Process monitor started (poll interval: 5s)");

    let mut system = System::new();
    let mut state = ProcessMonitorState::new();

    // Build caches from DB (may be empty on first launch before library loads)
    if let Err(e) = state.load_from_db(&db) {
        tracing::error!(error = %e, "Failed to initialize process monitor state");
        return;
    }

    tracing::info!(
        known_exes = state.exe_cache.len(),
        install_paths = state.install_paths.len(),
        "Process monitor caches loaded"
    );

    // Clean up stale sessions (active sessions where the game isn't running)
    cleanup_stale_sessions(&app_handle, &db, &mut system, &mut state);

    let mut interval = tokio::time::interval(POLL_INTERVAL);

    loop {
        interval.tick().await;
        scan_once(&app_handle, &db, &mut system, &mut state, &metrics);
    }
}

/// Clean up any active sessions from before the app restarted.
fn cleanup_stale_sessions(
    app_handle: &tauri::AppHandle,
    db: &CacheDbHandle,
    system: &mut System,
    state: &mut ProcessMonitorState,
) {
    system.refresh_processes(ProcessesToUpdate::All, true);

    // Get currently running game_ids (we only need the set here, not the PID map)
    let (running, _pid_map) = detect_running_games(system, db, state);

    let active_sessions = {
        let db_guard = match db.lock() {
            Ok(g) => g,
            Err(e) => {
                tracing::warn!(error = %e, "DB lock poisoned during stale session cleanup");
                return;
            }
        };
        match db_guard.get_all_active_sessions() {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!(error = %e, "Failed to get active sessions for cleanup");
                return;
            }
        }
    };

    let now = chrono::Utc::now().timestamp();

    // Collect event payloads while holding the lock, then emit AFTER releasing.
    // Same pattern as scan_once — emitting while locked causes deadlocks.
    let mut events: Vec<serde_json::Value> = Vec::new();
    {
        let db_guard = match db.lock() {
            Ok(g) => g,
            Err(e) => {
                tracing::warn!(error = %e, "DB lock poisoned during stale session close");
                state.active_games = running;
                return;
            }
        };

        for session in &active_sessions {
            if !running.contains(&session.game_id) {
                // Game isn't running — close the stale session
                let duration = ((now - session.start_time) / 60).max(1) as u32;
                if let Err(e) = db_guard.close_session(session.id, now, duration) {
                    tracing::warn!(session_id = session.id, error = %e, "Failed to close stale session");
                    continue;
                }
                // Auto-accumulate playtime for non-Steam games (SQL guard filters Steam)
                let _ = db_guard.add_manual_playtime(&session.game_id, duration);
                tracing::info!(
                    game_id = %session.game_id,
                    session_id = session.id,
                    duration_minutes = duration,
                    "Closed stale session from previous run"
                );
                events.push(serde_json::json!({
                    "type": "ended",
                    "gameId": session.game_id,
                    "sessionId": session.id,
                    "durationMinutes": duration
                }));
            }
        }
    } // db_guard dropped here

    for payload in events {
        let _ = app_handle.emit("session-update", payload);
    }

    // Initialize active_games with what's currently running
    state.active_games = running;
}

/// One scan cycle: refresh processes, detect transitions, update sessions.
fn scan_once(
    app_handle: &tauri::AppHandle,
    db: &CacheDbHandle,
    system: &mut System,
    state: &mut ProcessMonitorState,
    metrics: &SystemMetricsHandle,
) {
    // Periodically reload caches from DB to pick up newly-added install paths
    state.scan_count += 1;
    if state.scan_count.is_multiple_of(CACHE_RELOAD_INTERVAL) {
        let old_path_count = state.install_paths.len();
        let old_exe_count = state.exe_cache.len();
        if let Err(e) = state.load_from_db(db) {
            tracing::warn!(error = %e, "Failed to reload process monitor caches");
        } else if state.install_paths.len() != old_path_count
            || state.exe_cache.len() != old_exe_count
        {
            tracing::info!(
                install_paths = state.install_paths.len(),
                known_exes = state.exe_cache.len(),
                "Process monitor caches reloaded"
            );
        }
    }

    // Full process scan for game detection (session tracking)
    system.refresh_processes(ProcessesToUpdate::All, true);

    let (running, pid_game_map) = detect_running_games(system, db, state);
    let now = chrono::Utc::now().timestamp();

    // ── Update tracked PIDs + warm background metrics ───────────────────────

    {
        // Acquire db lock once for all name lookups (not per-game in loop)
        let tracked: HashMap<u32, (String, String)> = if let Ok(db_guard) = db.lock() {
            pid_game_map
                .iter()
                .map(|(&pid, game_id)| {
                    let name = db_guard
                        .get_game_name(game_id)
                        .ok()
                        .flatten()
                        .unwrap_or_else(|| "Unknown Game".to_string());
                    (pid, (game_id.clone(), name))
                })
                .collect()
        } else {
            pid_game_map
                .iter()
                .map(|(&pid, game_id)| (pid, (game_id.clone(), "Unknown Game".to_string())))
                .collect()
        };

        if let Ok(mut m) = metrics.lock() {
            m.update_tracked_pids(tracked);
            // Warm sample every 2nd cycle (~10s) to keep sparkline history populated
            // when the overlay is closed. Skips if frontend is actively polling.
            if state.scan_count.is_multiple_of(2) {
                m.warm_sample();
            }
        }
    }

    // ── Session tracking (existing behavior) ────────────────────────────────

    // Find games that just started (in running but not in active_games)
    let started: Vec<String> = running.difference(&state.active_games).cloned().collect();

    // Find games that just stopped (in active_games but not in running)
    let stopped: Vec<String> = state.active_games.difference(&running).cloned().collect();

    let has_transitions = !started.is_empty() || !stopped.is_empty();

    if has_transitions {
        // Collect event payloads while holding the lock, then emit AFTER releasing.
        // Emitting while holding the lock causes a deadlock: the event triggers
        // overlay listeners that call get_active_sessions, which also needs the lock.
        let mut events: Vec<serde_json::Value> = Vec::new();

        {
            let db_guard = match db.lock() {
                Ok(g) => g,
                Err(e) => {
                    tracing::warn!(error = %e, "DB lock poisoned during scan");
                    return;
                }
            };

            for game_id in &started {
                match db_guard.start_session(game_id, now) {
                    Ok(session_id) => {
                        let _ = db_guard.set_last_played(game_id, now as u64);
                        tracing::info!(game_id = %game_id, session_id, "Session started (process detected)");
                        events.push(serde_json::json!({
                            "type": "started",
                            "gameId": game_id,
                            "sessionId": session_id
                        }));
                    }
                    Err(e) => {
                        tracing::warn!(game_id = %game_id, error = %e, "Failed to start session");
                    }
                }
            }

            for game_id in &stopped {
                match db_guard.get_active_session(game_id) {
                    Ok(Some(session)) => {
                        let duration = ((now - session.start_time) / 60).max(1) as u32;
                        if let Err(e) = db_guard.close_session(session.id, now, duration) {
                            tracing::warn!(game_id = %game_id, error = %e, "Failed to close session");
                            continue;
                        }
                        // Auto-accumulate playtime for non-Steam games (SQL guard filters Steam)
                        let _ = db_guard.add_manual_playtime(game_id, duration);
                        tracing::info!(
                            game_id = %game_id,
                            session_id = session.id,
                            duration_minutes = duration,
                            "Session ended (process stopped)"
                        );
                        events.push(serde_json::json!({
                            "type": "ended",
                            "gameId": game_id,
                            "sessionId": session.id,
                            "durationMinutes": duration
                        }));
                    }
                    Ok(None) => {
                        tracing::debug!(game_id = %game_id, "Game stopped but no active session found");
                    }
                    Err(e) => {
                        tracing::warn!(game_id = %game_id, error = %e, "Failed to query active session");
                    }
                }
            }
        } // db_guard dropped here — lock released BEFORE any events or tray refresh

        // Now safe to emit events — listeners can freely acquire the db lock
        for payload in events {
            let _ = app_handle.emit("session-update", payload);
        }

        // Refresh tray menu on a background task so we don't block this scan cycle.
        // Tray menu operations may dispatch to the main thread (SendMessage on Windows),
        // and blocking here while overlay commands compete for the db lock causes freezes.
        let tray_app = app_handle.clone();
        let tray_db = db.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = crate::services::tray::refresh_tray_menu(&tray_app, &tray_db) {
                tracing::warn!(error = %e, "Failed to refresh tray menu after session change");
            }
        });
    }

    state.active_games = running;
}

/// Scan all processes and return:
/// - The set of game_ids that are currently running
/// - A map of PID → game_id for matched processes (used for per-process metrics)
///
/// Uses two-tier matching: fast path (known exe name) then slow path (install dir).
fn detect_running_games(
    system: &System,
    db: &CacheDbHandle,
    state: &mut ProcessMonitorState,
) -> (HashSet<String>, HashMap<u32, String>) {
    let mut running = HashSet::new();
    let mut pid_game_map: HashMap<u32, String> = HashMap::new();
    // Collect newly discovered exes to persist after the scan (batched, single lock acquisition)
    let mut discovered_exes: Vec<(String, String, String)> = Vec::new();

    for (pid, process) in system.processes() {
        let exe_path = match process.exe() {
            Some(p) => p,
            None => continue,
        };

        let exe_name = match exe_path.file_name() {
            Some(n) => n.to_string_lossy().to_string(),
            None => continue,
        };

        let exe_name_lower = exe_name.to_lowercase();

        // Skip known non-game executables
        if EXCLUDED_EXES.iter().any(|&ex| ex == exe_name_lower) {
            continue;
        }

        // Fast path: known exe name → check full path match
        if let Some(entries) = state.exe_cache.get(&exe_name_lower) {
            let norm_exe = normalize_path(&exe_path.to_string_lossy());
            for (game_id, norm_cached_path) in entries {
                if norm_exe == *norm_cached_path {
                    running.insert(game_id.clone());
                    pid_game_map.insert(pid.as_u32(), game_id.clone());
                }
            }
            // Even if fast path matched, no need for slow path on this process
            continue;
        }

        // Slow path: check if exe is inside a known game install directory
        // Install paths have trailing '/' so "Portal 2/" won't match "Portal 2 Episode 1/"
        let norm_exe = normalize_path(&exe_path.to_string_lossy());
        for (norm_install, game_id) in &state.install_paths {
            if norm_exe.starts_with(norm_install.as_str()) {
                running.insert(game_id.clone());
                pid_game_map.insert(pid.as_u32(), game_id.clone());

                // Discovery! Save this exe for fast-path future lookups
                let full_path = exe_path.to_string_lossy().to_string();
                tracing::debug!(
                    game_id = %game_id,
                    exe_name = %exe_name,
                    "Discovered new game executable"
                );

                // Queue for batched DB write (don't lock per-discovery)
                discovered_exes.push((game_id.clone(), full_path.clone(), exe_name_lower.clone()));

                // Update in-memory cache immediately
                state
                    .exe_cache
                    .entry(exe_name_lower.clone())
                    .or_default()
                    .push((game_id.clone(), normalize_path(&full_path)));

                break; // Only match one install path per process
            }
        }
    }

    // Persist all discovered exes in a single lock acquisition
    if !discovered_exes.is_empty() {
        if let Ok(db_guard) = db.lock() {
            for (game_id, full_path, exe_name) in &discovered_exes {
                let _ = db_guard.add_game_executable(game_id, full_path, exe_name);
            }
        }
    }

    (running, pid_game_map)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_path() {
        assert_eq!(
            normalize_path(r"D:\SteamLibrary\steamapps\common\Portal 2"),
            "d:/steamlibrary/steamapps/common/portal 2"
        );
        assert_eq!(normalize_path("C:/Games/Dota 2"), "c:/games/dota 2");
        assert_eq!(normalize_path("c:/games/half-life"), "c:/games/half-life");
    }

    #[test]
    fn test_normalize_install_path_adds_trailing_slash() {
        assert_eq!(
            normalize_install_path(r"D:\SteamLibrary\steamapps\common\Portal 2"),
            "d:/steamlibrary/steamapps/common/portal 2/"
        );
        // Already has trailing slash
        assert_eq!(
            normalize_install_path(r"D:\Games\Dota 2\"),
            "d:/games/dota 2/"
        );
    }

    #[test]
    fn test_trailing_slash_prevents_false_prefix_match() {
        let install = normalize_install_path(r"D:\Games\Portal 2");
        let exe_in_game = normalize_path(r"D:\Games\Portal 2\portal2.exe");
        let exe_in_other = normalize_path(r"D:\Games\Portal 2 Episode 1\ep1.exe");

        assert!(exe_in_game.starts_with(&install));
        assert!(!exe_in_other.starts_with(&install));
    }

    #[test]
    fn test_excluded_exes() {
        let excluded: HashSet<&str> = EXCLUDED_EXES.iter().copied().collect();
        assert!(excluded.contains("steam.exe"));
        assert!(excluded.contains("steamwebhelper.exe"));
        assert!(excluded.contains("crashhandler.exe"));
        assert!(excluded.contains("dxsetup.exe"));
        assert!(!excluded.contains("portal2.exe"));
        assert!(!excluded.contains("game.exe"));
    }

    #[test]
    fn test_state_new_is_empty() {
        let state = ProcessMonitorState::new();
        assert!(state.exe_cache.is_empty());
        assert!(state.install_paths.is_empty());
        assert!(state.active_games.is_empty());
        assert_eq!(state.scan_count, 0);
    }

    #[test]
    fn test_state_cache_update() {
        let mut state = ProcessMonitorState::new();

        // Simulate adding an install path (with trailing slash)
        state.install_paths.insert(
            normalize_install_path(r"D:\SteamLibrary\steamapps\common\Portal 2"),
            "game-uuid-1".to_string(),
        );

        // Simulate discovering an exe
        let exe_name = "portal2.exe".to_string();
        let exe_path = normalize_path(r"D:\SteamLibrary\steamapps\common\Portal 2\portal2.exe");
        state
            .exe_cache
            .entry(exe_name.clone())
            .or_default()
            .push(("game-uuid-1".to_string(), exe_path.clone()));

        // Fast path lookup should work
        assert!(state.exe_cache.contains_key("portal2.exe"));
        let entries = state.exe_cache.get("portal2.exe").unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].0, "game-uuid-1");

        // Simulate tracking an active game
        state.active_games.insert("game-uuid-1".to_string());
        assert!(state.active_games.contains("game-uuid-1"));
    }

    // ── SystemMetrics tests ─────────────────────────────────────────────────

    fn make_sample(timestamp: i64, cpu: f32) -> SystemSample {
        SystemSample {
            timestamp,
            cpu_percent: cpu,
            ram_used: 8_000_000_000,
            ram_total: 32_000_000_000,
            gpu_percent: None,
            gpu_vram_used: None,
            gpu_vram_total: None,
        }
    }

    #[test]
    fn test_system_metrics_push_sample() {
        let mut metrics = SystemMetrics::new();
        assert!(metrics.history.is_empty());

        metrics.push_sample(make_sample(1000, 45.0));
        assert_eq!(metrics.history.len(), 1);
        assert_eq!(metrics.history.back().unwrap().cpu_percent, 45.0);
    }

    #[test]
    fn test_system_metrics_max_history() {
        let mut metrics = SystemMetrics::new();
        for i in 0..70 {
            metrics.push_sample(make_sample(i as i64, i as f32));
        }
        assert_eq!(metrics.history.len(), MAX_HISTORY_SAMPLES);
        // Oldest should be sample #10 (70 pushed - 60 kept = first 10 dropped)
        assert_eq!(metrics.history.front().unwrap().timestamp, 10);
        assert_eq!(metrics.history.back().unwrap().timestamp, 69);
    }

    #[test]
    fn test_system_metrics_build_snapshot_with_history() {
        let mut metrics = SystemMetrics::new();
        metrics.push_sample(make_sample(1000, 45.0));

        let snap = metrics.build_snapshot();
        // cpu_count is auto-set by SystemMetrics::new() from the real system
        assert!(snap.cpu_count > 0);
        assert_eq!(snap.history.len(), 1);
        assert_eq!(snap.current.cpu_percent, 45.0);
        assert_eq!(snap.current.ram_used, 8_000_000_000);
        // The Roost process should appear (since we're running in a test process)
        assert!(
            snap.processes.iter().any(|p| p.game_id == "__self__") || snap.processes.is_empty()
        );
    }

    #[test]
    fn test_system_metrics_build_snapshot_empty() {
        let metrics = SystemMetrics::new();
        let snap = metrics.build_snapshot();
        assert_eq!(snap.current.timestamp, 0);
        assert_eq!(snap.current.cpu_percent, 0.0);
        assert!(snap.history.is_empty());
        // cpu_count should be auto-detected
        assert!(snap.cpu_count > 0);
    }

    #[test]
    fn test_system_metrics_tracked_pids() {
        let mut metrics = SystemMetrics::new();
        assert!(!metrics.is_tracked_game_process(1234));

        let mut pids = HashMap::new();
        pids.insert(1234, ("game-1".to_string(), "Test Game".to_string()));
        metrics.update_tracked_pids(pids);

        assert!(metrics.is_tracked_game_process(1234));
        assert!(!metrics.is_tracked_game_process(5678));
    }

    #[test]
    fn test_system_metrics_warm_sample_skips_recent() {
        let mut metrics = SystemMetrics::new();
        // Set last_refresh to "now" so warm_sample skips
        metrics.last_refresh = chrono::Utc::now().timestamp();
        let before = metrics.history.len();
        metrics.warm_sample();
        assert_eq!(metrics.history.len(), before); // Nothing added

        // Set last_refresh to long ago so warm_sample runs
        metrics.last_refresh = 0;
        metrics.warm_sample();
        assert_eq!(metrics.history.len(), before + 1); // Sample added
    }
}
