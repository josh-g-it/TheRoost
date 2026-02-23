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
        tracing::warn!(shortcut = shortcut_str, "Unknown shortcut string, not registered");
    }
}

/// Create the overlay window (hidden). Called lazily on first toggle.
pub fn create_overlay(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    if app.get_webview_window(OVERLAY_LABEL).is_some() {
        return Ok(());
    }

    // Cover the full primary monitor for the overlay backdrop
    let (width, height, x, y) = if let Some(monitor) = app.primary_monitor()? {
        let size = monitor.size();
        let scale = monitor.scale_factor();
        let pos = monitor.position();
        (
            size.width as f64 / scale,
            size.height as f64 / scale,
            pos.x as f64 / scale,
            pos.y as f64 / scale,
        )
    } else {
        (1920.0, 1080.0, 0.0, 0.0)
    };

    tauri::WebviewWindowBuilder::new(
        app,
        OVERLAY_LABEL,
        tauri::WebviewUrl::App("overlay.html".into()),
    )
    .title("The Roost — Overlay")
    .inner_size(width, height)
    .position(x, y)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .visible(false)
    .focused(true)
    .build()?;

    tracing::info!(width = width, height = height, "Overlay window created (full-screen)");
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
