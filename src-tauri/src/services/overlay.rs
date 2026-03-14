use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

const OVERLAY_LABEL: &str = "overlay";

/// Parse a shortcut string like "Ctrl+Space" into a global shortcut.
///
/// Supports arbitrary modifier+key combos in the format "Mod1+Mod2+Key".
/// Known modifiers: Ctrl, Shift, Alt, Super. Key names map to `Code` variants.
pub fn parse_shortcut(s: &str) -> Option<Shortcut> {
    let parts: Vec<&str> = s.split('+').collect();
    if parts.is_empty() {
        return None;
    }

    let mut mods = Modifiers::empty();
    for part in &parts[..parts.len() - 1] {
        match part.to_lowercase().as_str() {
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "shift" => mods |= Modifiers::SHIFT,
            "alt" => mods |= Modifiers::ALT,
            "super" | "win" | "meta" => mods |= Modifiers::SUPER,
            _ => return None, // unknown modifier
        }
    }

    let key_str = parts.last()?;
    let code = match key_str.to_lowercase().as_str() {
        "space" => Code::Space,
        "`" | "backquote" => Code::Backquote,
        "a" => Code::KeyA,
        "b" => Code::KeyB,
        "c" => Code::KeyC,
        "d" => Code::KeyD,
        "e" => Code::KeyE,
        "f" => Code::KeyF,
        "g" => Code::KeyG,
        "h" => Code::KeyH,
        "i" => Code::KeyI,
        "j" => Code::KeyJ,
        "k" => Code::KeyK,
        "l" => Code::KeyL,
        "m" => Code::KeyM,
        "n" => Code::KeyN,
        "o" => Code::KeyO,
        "p" => Code::KeyP,
        "q" => Code::KeyQ,
        "r" => Code::KeyR,
        "s" => Code::KeyS,
        "t" => Code::KeyT,
        "u" => Code::KeyU,
        "v" => Code::KeyV,
        "w" => Code::KeyW,
        "x" => Code::KeyX,
        "y" => Code::KeyY,
        "z" => Code::KeyZ,
        "0" => Code::Digit0,
        "1" => Code::Digit1,
        "2" => Code::Digit2,
        "3" => Code::Digit3,
        "4" => Code::Digit4,
        "5" => Code::Digit5,
        "6" => Code::Digit6,
        "7" => Code::Digit7,
        "8" => Code::Digit8,
        "9" => Code::Digit9,
        "f1" => Code::F1,
        "f2" => Code::F2,
        "f3" => Code::F3,
        "f4" => Code::F4,
        "f5" => Code::F5,
        "f6" => Code::F6,
        "f7" => Code::F7,
        "f8" => Code::F8,
        "f9" => Code::F9,
        "f10" => Code::F10,
        "f11" => Code::F11,
        "f12" => Code::F12,
        "escape" | "esc" => Code::Escape,
        "tab" => Code::Tab,
        "enter" | "return" => Code::Enter,
        "backspace" => Code::Backspace,
        "delete" => Code::Delete,
        "insert" => Code::Insert,
        "home" => Code::Home,
        "end" => Code::End,
        "pageup" => Code::PageUp,
        "pagedown" => Code::PageDown,
        "arrowup" | "up" => Code::ArrowUp,
        "arrowdown" | "down" => Code::ArrowDown,
        "arrowleft" | "left" => Code::ArrowLeft,
        "arrowright" | "right" => Code::ArrowRight,
        "-" | "minus" => Code::Minus,
        "=" | "equal" => Code::Equal,
        "[" | "bracketleft" => Code::BracketLeft,
        "]" | "bracketright" => Code::BracketRight,
        "\\" | "backslash" => Code::Backslash,
        ";" | "semicolon" => Code::Semicolon,
        "'" | "quote" => Code::Quote,
        "," | "comma" => Code::Comma,
        "." | "period" => Code::Period,
        "/" | "slash" => Code::Slash,
        _ => return None,
    };

    let mod_opt = if mods.is_empty() { None } else { Some(mods) };
    Some(Shortcut::new(mod_opt, code))
}

/// Register the overlay shortcut, unregistering any previously registered shortcut first.
pub fn register_shortcut(app: &AppHandle, shortcut_str: &str) {
    let gs = app.global_shortcut();

    // Unregister all shortcuts to avoid conflicts
    let _ = gs.unregister_all();

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
    .transparent(true)
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
