use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

const OVERLAY_LABEL: &str = "overlay";

/// Parse a shortcut string like "Ctrl+Space" into a global shortcut.
pub fn parse_shortcut(s: &str) -> Option<Shortcut> {
    match s {
        "Ctrl+Space" => Some(Shortcut::new(Some(Modifiers::CONTROL), Code::Space)),
        "Ctrl+K" => Some(Shortcut::new(Some(Modifiers::CONTROL), Code::KeyK)),
        "Ctrl+J" => Some(Shortcut::new(Some(Modifiers::CONTROL), Code::KeyJ)),
        "Ctrl+Shift+Space" => Some(Shortcut::new(
            Some(Modifiers::CONTROL | Modifiers::SHIFT),
            Code::Space,
        )),
        _ => None,
    }
}

/// Register the overlay shortcut, unregistering any previously registered shortcut first.
pub fn register_shortcut(app: &AppHandle, shortcut_str: &str) {
    let gs = app.global_shortcut();

    // Unregister all known shortcuts to avoid conflicts
    for candidate in &["Ctrl+Space", "Ctrl+K", "Ctrl+J", "Ctrl+Shift+Space"] {
        if let Some(sc) = parse_shortcut(candidate) {
            let _ = gs.unregister(sc);
        }
    }

    // Register the requested one
    if let Some(sc) = parse_shortcut(shortcut_str) {
        match gs.register(sc) {
            Ok(()) => tracing::info!(shortcut = shortcut_str, "Overlay shortcut registered"),
            Err(e) => tracing::warn!(
                shortcut = shortcut_str,
                error = %e,
                "Failed to register overlay shortcut"
            ),
        }
    } else {
        tracing::warn!(
            shortcut = shortcut_str,
            "Unknown shortcut string, not registered"
        );
    }
}

/// Create the overlay window (hidden). Called lazily on first toggle.
///
/// **No explicit "ready" handshake** is used between windows. This is acceptable
/// because: (1) the overlay loads settings from disk on mount, so a missed
/// `settings-changed` event just means it has the same data it loaded; (2) all
/// cross-window events (`session-update`, `settings-changed`) are idempotent —
/// the next periodic event will correct any stale state; (3) the overlay is
/// built with `visible(false)` and only shown after the webview loads.
pub fn create_overlay(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    if app.get_webview_window(OVERLAY_LABEL).is_some() {
        return Ok(());
    }

    // Cover the full primary monitor for the overlay backdrop
    let monitor = app.primary_monitor()?;
    let (width, height, x, y) = if let Some(ref m) = monitor {
        let size = m.size();
        let scale = m.scale_factor();
        let pos = m.position();
        (
            size.width as f64 / scale,
            size.height as f64 / scale,
            pos.x as f64 / scale,
            pos.y as f64 / scale,
        )
    } else {
        (1920.0, 1080.0, 0.0, 0.0)
    };

    let win = tauri::WebviewWindowBuilder::new(
        app,
        OVERLAY_LABEL,
        tauri::WebviewUrl::App("overlay.html".into()),
    )
    .title("The Roost — Overlay")
    .inner_size(width, height)
    .position(x, y)
    .decorations(false)
    // TEMP: disable transparency to test async fixes in isolation
    // .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .visible(false)
    .focused(true)
    .build()?;

    // Force exact physical size/position after creation. On Windows 11,
    // borderless windows can have invisible DWM frame margins that shrink
    // the client area by ~7px. Setting physical size post-creation ensures
    // the content area covers the entire monitor.
    if let Some(m) = monitor {
        let size = m.size();
        let pos = m.position();
        let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
            size.width,
            size.height,
        )));
        let _ = win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
            pos.x, pos.y,
        )));
    }

    tracing::info!(
        width = width,
        height = height,
        "Overlay window created (full-screen)"
    );
    Ok(())
}

/// Toggle overlay visibility. Creates the window if it doesn't exist yet.
pub fn toggle_overlay(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
        }
    } else {
        if let Err(e) = create_overlay(app) {
            tracing::warn!(error = %e, "Failed to create overlay window");
            return;
        }
        if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

/// Hide the overlay window.
pub fn hide_overlay(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.hide();
    }
}
