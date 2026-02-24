use std::time::Duration;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

use crate::services::cache_db::CacheDbHandle;

/// Initialize the system tray icon with context menu.
/// Called from `lib.rs` setup hook.
pub fn init_tray(app: &tauri::App, db: CacheDbHandle) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_tray_menu(app.handle(), &db)?;

    let db_for_event = db.clone();
    let _tray = TrayIconBuilder::with_id("theroost-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("The Roost")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .on_menu_event(move |app, event| {
            handle_menu_event(app, &event, &db_for_event);
        })
        .build(app)?;

    // Spawn background task to refresh tray menu periodically
    let handle = app.handle().clone();
    let db_clone = db.clone();
    tauri::async_runtime::spawn(async move {
        tray_refresh_loop(handle, db_clone).await;
    });

    tracing::info!("System tray initialized");
    Ok(())
}

/// Rebuild and replace the tray menu. Called by the refresh loop and session tracker.
pub fn refresh_tray_menu(
    app: &AppHandle,
    db: &CacheDbHandle,
) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_tray_menu(app, db)?;
    if let Some(tray) = app.tray_by_id("theroost-tray") {
        tray.set_menu(Some(menu))?;
    }
    Ok(())
}

// ── Menu builder ──────────────────────────────────────────────

fn build_tray_menu(
    app: &AppHandle,
    db: &CacheDbHandle,
) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let menu = Menu::new(app)?;

    // "Open The Roost" at the top
    let open_item = MenuItem::with_id(app, "open", "Open The Roost", true, None::<&str>)?;
    menu.append(&open_item)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // Current session section
    build_session_section(app, db, &menu)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // Recently played section
    build_recent_section(app, db, &menu)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // "Fully Quit" at the bottom
    let quit_item = MenuItem::with_id(app, "quit", "Fully Quit", true, None::<&str>)?;
    menu.append(&quit_item)?;

    Ok(menu)
}

fn build_session_section(
    app: &AppHandle,
    db: &CacheDbHandle,
    menu: &Menu<tauri::Wry>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Acquire lock, clone data, release lock BEFORE any Tauri menu API calls.
    // Menu operations may dispatch to the main thread (SendMessage on Windows),
    // and holding the db lock during that wait causes deadlocks with overlay commands.
    let active = {
        let db_guard = db.lock().map_err(|e| format!("DB lock: {}", e))?;
        db_guard.get_active_sessions_with_names()?
    };

    if active.is_empty() {
        let item = MenuItem::with_id(app, "no-session", "No active session", false, None::<&str>)?;
        menu.append(&item)?;
    } else {
        for (game_id, name, start_time) in &active {
            let elapsed = format_elapsed(*start_time);
            let label = format!("Playing: {} ({})", name, elapsed);
            let item = MenuItem::with_id(
                app,
                format!("session:{}", game_id),
                &label,
                false, // disabled — informational only
                None::<&str>,
            )?;
            menu.append(&item)?;
        }
    }

    Ok(())
}

fn build_recent_section(
    app: &AppHandle,
    db: &CacheDbHandle,
    menu: &Menu<tauri::Wry>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Same pattern: release db lock before menu API calls to avoid deadlocks
    let recent = {
        let db_guard = db.lock().map_err(|e| format!("DB lock: {}", e))?;
        db_guard.get_recently_played_games(5)?
    };

    if recent.is_empty() {
        let item = MenuItem::with_id(app, "no-recent", "No recent games", false, None::<&str>)?;
        menu.append(&item)?;
    } else {
        for (game_id, name) in &recent {
            let open_item = MenuItem::with_id(
                app,
                format!("open-game:{}", game_id),
                "Open in The Roost",
                true,
                None::<&str>,
            )?;
            let launch_item = MenuItem::with_id(
                app,
                format!("launch-game:{}", game_id),
                "Launch Game",
                true,
                None::<&str>,
            )?;
            let submenu = Submenu::with_id_and_items(
                app,
                format!("recent:{}", game_id),
                name,
                true,
                &[&open_item, &launch_item],
            )?;
            menu.append(&submenu)?;
        }
    }

    Ok(())
}

// ── Event handlers ────────────────────────────────────────────

fn handle_menu_event(app: &AppHandle, event: &tauri::menu::MenuEvent, db: &CacheDbHandle) {
    let id = event.id().as_ref();

    match id {
        "open" => {
            show_main_window(app);
        }
        "quit" => {
            tracing::info!("User selected Fully Quit from tray");
            app.exit(0);
        }
        _ if id.starts_with("open-game:") => {
            let game_id = &id["open-game:".len()..];
            show_main_window(app);
            let _ = app.emit("navigate-to-game", game_id.to_string());
            tracing::info!(game_id = %game_id, "Tray: open game in The Roost");
        }
        _ if id.starts_with("launch-game:") => {
            let game_id = &id["launch-game:".len()..];
            if let Ok(db_guard) = db.lock() {
                if let Ok(Some((source, source_id))) = db_guard.get_game_source(game_id) {
                    match source.as_str() {
                        "steam" => {
                            let url = format!("steam://rungameid/{}", source_id);
                            tracing::info!(game_id = %game_id, url = %url, "Tray: launching game");
                            let _ = open::that(&url);
                        }
                        _ => {
                            tracing::warn!(source = %source, "No tray launcher for source type");
                        }
                    }
                }
            }
        }
        _ => {
            tracing::debug!(menu_id = %id, "Unhandled tray menu event");
        }
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

// ── Helpers ───────────────────────────────────────────────────

fn format_elapsed(start_time: i64) -> String {
    let now = chrono::Utc::now().timestamp();
    let elapsed_secs = (now - start_time).max(0);
    let hours = elapsed_secs / 3600;
    let minutes = (elapsed_secs % 3600) / 60;
    if hours > 0 {
        format!("{}h {}m", hours, minutes)
    } else {
        format!("{}m", minutes)
    }
}

async fn tray_refresh_loop(app: AppHandle, db: CacheDbHandle) {
    let mut interval = tokio::time::interval(Duration::from_secs(60));
    loop {
        interval.tick().await;
        if let Err(e) = refresh_tray_menu(&app, &db) {
            tracing::warn!(error = %e, "Failed to refresh tray menu");
        }
    }
}
