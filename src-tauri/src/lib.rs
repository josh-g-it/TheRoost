mod commands;
mod models;
mod services;
mod utils;

use std::sync::{Arc, Mutex};

use commands::{achievements, ai, audio, autostart, cover_art, custom_games, developer, external_scanner, favorites, friends, game_launcher, hidden_games, media_bookmarks, media_controls, metadata, news, notes, overlay, saved_filters, sessions, settings, steam_api, steam_scanner, system_monitor, tags, updater};
use models::ai::CloudProvider;
use services::ai::cloud_config::CloudConfig;
use services::cache_db::CacheDb;
use services::log_bridge::TauriLogLayer;
use services::{library_sync, process_monitor};
use services::settings_store;
use tauri::Manager;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        services::overlay::toggle_overlay(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            steam_scanner::scan_local_library,
            steam_scanner::get_full_library,
            steam_api::fetch_owned_games,
            steam_api::fetch_recent_games,
            steam_api::fetch_player_summary,
            steam_api::resolve_steam_account,
            settings::load_settings,
            settings::save_settings,
            game_launcher::launch_game,
            game_launcher::get_launch_mode,
            game_launcher::set_launch_mode,
            metadata::fetch_game_metadata,
            metadata::fetch_library_metadata,
            metadata::invalidate_metadata_cache,
            metadata::backfill_steam_tags,
            metadata::backfill_store_details,
            sessions::get_game_sessions,
            sessions::get_recent_sessions,
            sessions::get_active_sessions,
            tags::get_all_tags,
            tags::create_tag,
            tags::update_tag,
            tags::delete_tag,
            tags::reorder_tags,
            tags::set_game_tags,
            tags::get_game_tag_ids,
            tags::get_all_game_tags,
            tags::bulk_add_tag,
            favorites::toggle_favorite,
            favorites::get_all_favorites,
            hidden_games::toggle_hidden,
            hidden_games::get_all_hidden,
            saved_filters::save_filter,
            saved_filters::get_all_saved_filters,
            saved_filters::delete_saved_filter,
            developer::clear_all_data,
            external_scanner::scan_external_games,
            cover_art::get_cover_art_url,
            cover_art::fetch_cover_art_batch,
            cover_art::store_sgdb_api_key,
            cover_art::get_sgdb_key_status,
            cover_art::delete_sgdb_api_key,
            cover_art::get_cover_art_options,
            cover_art::set_cover_art,
            custom_games::add_custom_game,
            custom_games::remove_custom_game,
            custom_games::update_custom_game,
            achievements::fetch_game_achievements,
            achievements::get_all_achievement_stats,
            achievements::batch_fetch_achievements,
            achievements::clear_achievement_cache,
            friends::fetch_friends_list,
            friends::fetch_friend_library,
            news::fetch_game_news,
            news::fetch_followed_games,
            overlay::toggle_overlay,
            overlay::hide_overlay,
            overlay::show_main_and_navigate,
            overlay::overlay_select_game,
            overlay::update_overlay_shortcut,
            overlay::get_overlay_library,
            overlay::overlay_apply_tag_filter,
            overlay::overlay_execute_palette_action,
            overlay::notify_settings_changed,
            notes::get_game_note,
            notes::save_game_note,
            notes::delete_game_note,
            notes::get_all_notes_with_content,
            system_monitor::get_system_metrics,
            system_monitor::kill_game_process,
            media_controls::get_media_session,
            media_controls::media_toggle_play_pause,
            media_controls::media_skip_next,
            media_controls::media_skip_previous,
            media_bookmarks::get_media_bookmarks,
            media_bookmarks::add_media_bookmark,
            media_bookmarks::update_media_bookmark,
            media_bookmarks::delete_media_bookmark,
            media_bookmarks::reorder_media_bookmarks,
            media_bookmarks::open_media_bookmark,
            audio::get_audio_snapshot,
            audio::set_session_volume,
            audio::set_session_mute,
            audio::set_master_volume,
            audio::set_master_mute,
            audio::set_default_output_device,
            audio::set_default_input_device,
            audio::set_audio_device_alias,
            audio::delete_audio_device_alias,
            audio::set_audio_session_hidden,
            ai::ai_resolve_intent,
            ai::ai_cloud_resolve,
            ai::store_cloud_api_key,
            ai::delete_cloud_api_key,
            ai::get_cloud_api_key_status,
            ai::test_cloud_api_key,
            ai::get_cloud_ai_usage,
            ai::update_cloud_ai_settings,
            updater::check_for_update,
            updater::install_update,
            updater::get_app_version,
            autostart::get_autostart_enabled,
            autostart::set_autostart_enabled,
        ])
        .setup(|app| {
            // Initialize tracing with our custom layer that forwards events to the frontend
            let tauri_layer = TauriLogLayer::new(app.handle().clone());
            tracing_subscriber::registry()
                .with(tauri_layer)
                .with(tracing_subscriber::filter::LevelFilter::DEBUG)
                .init();

            tracing::info!("The Roost backend initialized");

            // Initialize SQLite cache database
            let app_data = app.path().app_data_dir()
                .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::NotFound, e.to_string())))?;
            std::fs::create_dir_all(&app_data)?;
            let db_path = app_data.join("theroost.db");
            let cache_db = CacheDb::new(&db_path)
                .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
            let db_handle = Arc::new(Mutex::new(cache_db));
            app.manage(db_handle.clone());
            tracing::info!("Cache database initialized");

            // Initialize cloud AI config from settings
            let cloud_settings = settings_store::load_settings(app.handle())
                .unwrap_or_default();
            let cloud_provider = CloudProvider::from_str(&cloud_settings.cloud_ai_provider)
                .unwrap_or_default();
            let cloud_config = CloudConfig::new(
                cloud_settings.cloud_ai_enabled,
                cloud_provider,
                cloud_settings.cloud_ai_daily_limit,
            );
            app.manage(Arc::new(Mutex::new(cloud_config)));
            tracing::info!("Cloud AI config initialized");

            // Spawn library sync background task (Steam API polling every 30 min)
            let sync_handle = app.handle().clone();
            let sync_db = db_handle.clone();
            tauri::async_runtime::spawn(async move {
                library_sync::run(sync_handle, sync_db).await;
            });

            // Create system metrics shared state (read by overlay commands)
            let metrics_handle = Arc::new(Mutex::new(
                process_monitor::SystemMetrics::new()
            ));
            app.manage(metrics_handle.clone());

            // Spawn process monitor background task (5-second process scanning + metrics)
            let monitor_handle = app.handle().clone();
            let monitor_db = db_handle.clone();
            let monitor_metrics = metrics_handle.clone();
            tauri::async_runtime::spawn(async move {
                process_monitor::run(monitor_handle, monitor_db, monitor_metrics).await;
            });
            tracing::info!("Background tasks started (library sync + process monitor)");

            // Initialize system tray
            services::tray::init_tray(app, db_handle.clone())?;

            // Register global shortcut for overlay (read from settings)
            {
                let shortcut_str = settings_store::load_settings(app.handle())
                    .map(|s| s.command_center_shortcut)
                    .unwrap_or_else(|_| "Ctrl+Space".to_string());
                services::overlay::register_shortcut(app.handle(), &shortcut_str);
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    let label = window.label();
                    if label == "overlay" {
                        // Overlay always hides instead of closing
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        // Main window: check minimize-to-tray setting
                        let app = window.app_handle();
                        let should_minimize = settings_store::load_settings(app)
                            .map(|s| s.minimize_to_tray)
                            .unwrap_or(true);
                        if should_minimize {
                            api.prevent_close();
                            let _ = window.hide();
                            tracing::debug!("Window hidden to tray");
                        }
                    }
                }
                tauri::WindowEvent::Focused(false) => {
                    // Auto-hide overlay when it loses focus
                    if window.label() == "overlay" {
                        let _ = window.hide();
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
