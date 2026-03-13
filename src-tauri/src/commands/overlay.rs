use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::models::game::{Game, GameLibrary, GameSource};
use crate::services::cache_db::CacheDb;
use crate::services::overlay;
use crate::utils::error::{AppError, MutexExt};

type CacheDbHandle = Arc<Mutex<CacheDb>>;

#[tauri::command]
pub fn toggle_overlay(app: AppHandle) {
    overlay::toggle_overlay(&app);
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle) {
    overlay::hide_overlay(&app);
}

/// Show the main window, navigate it to a route, and hide the overlay.
///
/// Returns an error if the main window is not available (06-F7).
#[tauri::command]
pub async fn show_main_and_navigate(app: AppHandle, route: String) -> Result<(), AppError> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::Validation("Main window is not available".to_string()))?;
    if let Err(e) = win.unminimize() {
        tracing::warn!(error = %e, "Failed to unminimize main window");
    }
    if let Err(e) = win.show() {
        tracing::warn!(error = %e, "Failed to show main window");
    }
    if let Err(e) = win.set_focus() {
        tracing::warn!(error = %e, "Failed to focus main window");
    }
    if let Err(e) = app.emit_to("main", "navigate-to-route", &route) {
        tracing::warn!(error = %e, window = "main", event = "navigate-to-route", "emit_to failed");
    }
    overlay::hide_overlay(&app);
    Ok(())
}

/// Re-register the overlay global shortcut (called when user changes setting).
#[tauri::command]
pub fn update_overlay_shortcut(app: AppHandle, shortcut: String) {
    overlay::register_shortcut(&app, &shortcut);
}

/// Show the main window, navigate to library, select a game, and hide the overlay.
///
/// Returns an error if the main window is not available (06-F7).
#[tauri::command]
pub async fn overlay_select_game(app: AppHandle, game_id: String) -> Result<(), AppError> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::Validation("Main window is not available".to_string()))?;
    if let Err(e) = win.unminimize() {
        tracing::warn!(error = %e, "Failed to unminimize main window");
    }
    if let Err(e) = win.show() {
        tracing::warn!(error = %e, "Failed to show main window");
    }
    if let Err(e) = win.set_focus() {
        tracing::warn!(error = %e, "Failed to focus main window");
    }
    if let Err(e) = app.emit_to("main", "navigate-to-route", "/library") {
        tracing::warn!(error = %e, window = "main", event = "navigate-to-route", "emit_to failed");
    }
    if let Err(e) = app.emit_to("main", "navigate-to-game", &game_id) {
        tracing::warn!(error = %e, window = "main", event = "navigate-to-game", "emit_to failed");
    }
    overlay::hide_overlay(&app);
    Ok(())
}

/// Notify both windows that settings were changed.
/// Each listener reloads from disk — no loop since loading doesn't trigger save.
#[tauri::command]
pub async fn notify_settings_changed(app: AppHandle) {
    if let Err(e) = app.emit_to("main", "settings-changed", ()) {
        tracing::warn!(error = %e, window = "main", event = "settings-changed", "emit_to failed");
    }
    if let Err(e) = app.emit_to("overlay", "settings-changed", ()) {
        tracing::warn!(error = %e, window = "overlay", event = "settings-changed", "emit_to failed");
    }
}

/// Apply tag filters: show main window, navigate to library, emit tag filter event, hide overlay.
///
/// Returns an error if the main window is not available (06-F7).
#[tauri::command]
pub async fn overlay_apply_tag_filter(app: AppHandle, tag_ids: Vec<i64>) -> Result<(), AppError> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::Validation("Main window is not available".to_string()))?;
    if let Err(e) = win.unminimize() {
        tracing::warn!(error = %e, "Failed to unminimize main window");
    }
    if let Err(e) = win.show() {
        tracing::warn!(error = %e, "Failed to show main window");
    }
    if let Err(e) = win.set_focus() {
        tracing::warn!(error = %e, "Failed to focus main window");
    }
    if let Err(e) = app.emit_to("main", "navigate-to-route", "/library") {
        tracing::warn!(error = %e, window = "main", event = "navigate-to-route", "emit_to failed");
    }
    if let Err(e) = app.emit_to("main", "apply-tag-filter", &tag_ids) {
        tracing::warn!(error = %e, window = "main", event = "apply-tag-filter", "emit_to failed");
    }
    overlay::hide_overlay(&app);
    Ok(())
}

/// Execute a command palette action on the main window.
/// The overlay has separate JS stores, so palette actions that modify UI state
/// (filters, view mode, sort) must be relayed to the main window for execution.
/// `show_main` controls whether the main window is brought to focus — false for
/// settings-only actions (theme, font, etc.) that don't require navigation.
///
/// Returns an error if the main window is not available (06-F7).
#[tauri::command]
pub async fn overlay_execute_palette_action(
    app: AppHandle,
    action_id: String,
    game_id: Option<String>,
    show_main: bool,
) -> Result<(), AppError> {
    // Settings-only actions (theme, font, etc.) are emitted globally
    // and don't require the main window to be present.
    let main_available = app.get_webview_window("main").is_some();
    if show_main {
        let win = app
            .get_webview_window("main")
            .ok_or_else(|| AppError::Validation("Main window is not available".to_string()))?;
        if let Err(e) = win.unminimize() {
            tracing::warn!(error = %e, "Failed to unminimize main window");
        }
        if let Err(e) = win.show() {
            tracing::warn!(error = %e, "Failed to show main window");
        }
        if let Err(e) = win.set_focus() {
            tracing::warn!(error = %e, "Failed to focus main window");
        }
    } else if !main_available {
        // Non-navigation action but main is gone — still emit, it will just warn
        tracing::warn!(
            action_id,
            "Main window unavailable for palette action relay"
        );
    }
    let payload = serde_json::json!({
        "actionId": action_id,
        "gameId": game_id,
    });
    if let Err(e) = app.emit_to("main", "execute-palette-action", &payload) {
        tracing::warn!(error = %e, window = "main", event = "execute-palette-action", "emit_to failed");
    }
    overlay::hide_overlay(&app);
    Ok(())
}

/// Lightweight library read for the overlay — reads from SQLite, no API calls.
///
/// Must be `async` so the DB lock doesn't block the main thread. During AI
/// `assemble_context`, the DB lock can be held for hundreds of milliseconds;
/// a sync command waiting for the lock would freeze the entire IPC pipeline.
#[tauri::command]
pub async fn get_overlay_library(db: State<'_, CacheDbHandle>) -> Result<GameLibrary, AppError> {
    let db = db.lock_or_err("DB")?;
    let rows = db.get_overlay_games()?;
    let games: Vec<Game> = rows
        .into_iter()
        .map(
            |(game_id, source, source_id, name, install_path, playtime): (
                String,
                String,
                String,
                String,
                Option<String>,
                u32,
            )| {
                let game_source = GameSource::from_str(&source).unwrap_or(GameSource::Steam);
                let installed = install_path.is_some();
                Game {
                    game_id,
                    source: game_source,
                    source_id,
                    name,
                    install_dir: None,
                    install_path,
                    size_on_disk: None,
                    last_updated: None,
                    playtime_forever: playtime,
                    playtime_2weeks: None,
                    last_played: None,
                    is_installed: installed,
                    img_icon_url: None,
                    description: None,
                    launch_args: None,
                }
            },
        )
        .collect();
    let total_count = games.len();
    Ok(GameLibrary {
        games,
        total_count,
        warnings: Vec::new(),
    })
}
