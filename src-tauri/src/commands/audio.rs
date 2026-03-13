use std::collections::HashMap;
use tauri::State;

use crate::models::audio::{AudioSessionPref, AudioSnapshot};
use crate::services::audio_control;
use crate::services::cache_db::CacheDbHandle;
use crate::utils::error::{AppError, MutexExt};

/// Get the current audio state, enriched with DB aliases and session prefs.
///
/// Must be `async` so Tauri runs it on the tokio thread pool, NOT the main thread.
/// The Windows COM audio APIs block the calling thread in ways that deadlock the
/// main thread's message pump (same issue as WinRT SMTC in media_controls).
#[tauri::command]
pub async fn get_audio_snapshot(db: State<'_, CacheDbHandle>) -> Result<AudioSnapshot, AppError> {
    let mut snap = audio_control::get_audio_snapshot();

    // Merge device aliases and session prefs from DB (silently ignore errors)
    if let Ok(db) = db.lock() {
        if let Ok(aliases) = db.get_audio_device_aliases() {
            let alias_map: HashMap<String, String> = aliases.into_iter().collect();
            for device in &mut snap.output_devices {
                device.custom_name = alias_map.get(&device.id).cloned();
            }
            for device in &mut snap.input_devices {
                device.custom_name = alias_map.get(&device.id).cloned();
            }
        }
        if let Ok(prefs) = db.get_audio_session_prefs() {
            snap.session_prefs = prefs
                .into_iter()
                .map(|(exe_name, hidden)| AudioSessionPref { exe_name, hidden })
                .collect();
        }
    }

    Ok(snap)
}

/// Set volume for a specific audio session.
#[tauri::command]
pub async fn set_session_volume(pid: u32, volume: f32) -> Result<(), AppError> {
    audio_control::set_session_volume(pid, volume)
        .map_err(|e| AppError::StoreApi(format!("Audio control failed: {}", e)))
}

/// Set mute state for a specific audio session.
#[tauri::command]
pub async fn set_session_mute(pid: u32, muted: bool) -> Result<(), AppError> {
    audio_control::set_session_mute(pid, muted)
        .map_err(|e| AppError::StoreApi(format!("Audio control failed: {}", e)))
}

/// Set the master volume level.
#[tauri::command]
pub async fn set_master_volume(volume: f32) -> Result<(), AppError> {
    audio_control::set_master_volume(volume)
        .map_err(|e| AppError::StoreApi(format!("Audio control failed: {}", e)))
}

/// Set the master mute state.
#[tauri::command]
pub async fn set_master_mute(muted: bool) -> Result<(), AppError> {
    audio_control::set_master_mute(muted)
        .map_err(|e| AppError::StoreApi(format!("Audio control failed: {}", e)))
}

/// Set the default output (render) device.
#[tauri::command]
pub async fn set_default_output_device(device_id: String) -> Result<(), AppError> {
    audio_control::set_default_output_device(&device_id)
        .map_err(|e| AppError::StoreApi(format!("Audio control failed: {}", e)))
}

/// Set the default input (capture) device.
#[tauri::command]
pub async fn set_default_input_device(device_id: String) -> Result<(), AppError> {
    audio_control::set_default_input_device(&device_id)
        .map_err(|e| AppError::StoreApi(format!("Audio control failed: {}", e)))
}

/// Set or update a custom name for an audio device.
#[tauri::command]
pub async fn set_audio_device_alias(
    device_id: String,
    custom_name: String,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    let db = db.lock_or_err("DB")?;
    db.set_audio_device_alias(&device_id, &custom_name)
}

/// Remove a custom name for an audio device.
#[tauri::command]
pub async fn delete_audio_device_alias(
    device_id: String,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    let db = db.lock_or_err("DB")?;
    db.delete_audio_device_alias(&device_id)
}

/// Set whether an audio session (by exe name) should be hidden.
#[tauri::command]
pub async fn set_audio_session_hidden(
    exe_name: String,
    hidden: bool,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    let db = db.lock_or_err("DB")?;
    db.set_audio_session_hidden(&exe_name, hidden)
}
