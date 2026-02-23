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
#[tauri::command]
pub fn show_main_and_navigate(app: AppHandle, route: String) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
    let _ = app.emit_to("main", "navigate-to-route", &route);
    overlay::hide_overlay(&app);
}

/// Re-register the overlay global shortcut (called when user changes setting).
#[tauri::command]
pub fn update_overlay_shortcut(app: AppHandle, shortcut: String) {
    overlay::register_shortcut(&app, &shortcut);
}

/// Show the main window, navigate to library, select a game, and hide the overlay.
#[tauri::command]
pub fn overlay_select_game(app: AppHandle, game_id: String) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
    let _ = app.emit_to("main", "navigate-to-route", "/library");
    let _ = app.emit_to("main", "navigate-to-game", &game_id);
    overlay::hide_overlay(&app);
}

/// Notify both windows that settings were changed.
/// Each listener reloads from disk — no loop since loading doesn't trigger save.
#[tauri::command]
pub fn notify_settings_changed(app: AppHandle) {
    let _ = app.emit_to("main", "settings-changed", ());
    let _ = app.emit_to("overlay", "settings-changed", ());
}

/// Apply tag filters: show main window, navigate to library, emit tag filter event, hide overlay.
#[tauri::command]
pub fn overlay_apply_tag_filter(app: AppHandle, tag_ids: Vec<i64>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
    let _ = app.emit_to("main", "navigate-to-route", "/library");
    let _ = app.emit_to("main", "apply-tag-filter", &tag_ids);
    overlay::hide_overlay(&app);
}

/// Execute a command palette action on the main window.
/// The overlay has separate JS stores, so palette actions that modify UI state
/// (filters, view mode, sort) must be relayed to the main window for execution.
/// `show_main` controls whether the main window is brought to focus — false for
/// settings-only actions (theme, font, etc.) that don't require navigation.
#[tauri::command]
pub fn overlay_execute_palette_action(
    app: AppHandle,
    action_id: String,
    game_id: Option<String>,
    show_main: bool,
) {
    if show_main {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.unminimize();
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
    let payload = serde_json::json!({
        "actionId": action_id,
        "gameId": game_id,
    });
    let _ = app.emit_to("main", "execute-palette-action", &payload);
    overlay::hide_overlay(&app);
}

/// Lightweight library read for the overlay — reads from SQLite, no API calls.
#[tauri::command]
pub fn get_overlay_library(db: State<'_, CacheDbHandle>) -> Result<GameLibrary, AppError> {
    let db = db.lock_or_err("DB")?;
    let rows = db.get_overlay_games()?;
    let games: Vec<Game> = rows
        .into_iter()
        .map(|(game_id, source, source_id, name, install_path, playtime):
             (String, String, String, String, Option<String>, u32)| {
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
        })
        .collect();
    let total_count = games.len();
    Ok(GameLibrary {
        games,
        total_count,
        warnings: Vec::new(),
    })
}
