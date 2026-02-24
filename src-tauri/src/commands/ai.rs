use tauri::State;

use crate::models::ai::{CloudAiUsage, CloudProvider, ResolvedIntent};
use crate::services::ai::cloud_config::CloudConfigHandle;
use crate::services::ai::cloud_resolver::CloudResolver;
use crate::services::ai::context_builder;
use crate::services::ai::orchestrator::AiOrchestrator;
use crate::services::ai::pattern_matcher::PatternMatcher;
use crate::services::cache_db::CacheDbHandle;
use crate::services::credential_store;
use crate::services::settings_store;
use crate::utils::error::{AppError, MutexExt};

/// Pattern-matcher-only AI resolution (instant, local, always available).
/// Called automatically by the frontend for every qualifying search query.
#[tauri::command]
pub fn ai_resolve_intent(
    query: String,
    db: State<'_, CacheDbHandle>,
) -> Result<Option<ResolvedIntent>, AppError> {
    let ctx = {
        let db = db.lock_or_err("DB")?;
        AiOrchestrator::build_context(&db)?
    };

    Ok(PatternMatcher::resolve(&query, &ctx))
}

/// Explicit cloud AI resolution (user-initiated via "Ask Assistant" button).
/// Only called when the user deliberately clicks to send their query.
#[tauri::command]
pub async fn ai_cloud_resolve(
    query: String,
    db: State<'_, CacheDbHandle>,
    cloud: State<'_, CloudConfigHandle>,
    app_handle: tauri::AppHandle,
) -> Result<Option<ResolvedIntent>, AppError> {
    // Read scope settings from disk (infrequent — only on explicit user click)
    let settings = settings_store::load_settings(&app_handle)?;
    let scope = settings.cloud_ai_context_scope;
    let excluded = settings.cloud_ai_excluded_games;
    let included = settings.cloud_ai_included_games;

    // Build context with a short DB lock scope
    let (ctx, library_summary) = {
        let db = db.lock_or_err("DB")?;
        let ctx = AiOrchestrator::build_context(&db)?;
        let summary =
            context_builder::build_filtered_library_summary(&db, &scope, &excluded, &included)?;
        (ctx, summary)
    }; // DB lock dropped

    // Check cloud config
    let can_cloud = {
        let mut config = cloud.lock_or_err("CloudConfig")?;
        config.maybe_reset_daily();
        config.enabled && config.can_request()
    };

    if !can_cloud {
        return Ok(None);
    }

    let config_snapshot = {
        let config = cloud.lock_or_err("CloudConfig")?;
        config.clone()
    };

    let result = CloudResolver::resolve(&query, &ctx, &library_summary, &config_snapshot).await;

    // Record the request and handle rate limiting
    match &result {
        Ok(Some(_)) => {
            let mut config = cloud.lock_or_err("CloudConfig")?;
            config.record_request();
        }
        Err(e) => {
            if let AppError::StoreApi(ref msg) = e {
                if msg.contains("429") {
                    let mut config = cloud.lock_or_err("CloudConfig")?;
                    config.set_rate_limited(60);
                    config.record_request();
                    return Ok(None);
                }
            }
            tracing::warn!(error = %e, "Cloud AI request failed, degrading gracefully");
            return Ok(None);
        }
        Ok(None) => {}
    }

    result
}

#[tauri::command]
pub fn store_cloud_api_key(provider: String, key: String) -> Result<(), AppError> {
    credential_store::store_cloud_key(&provider, &key)
}

#[tauri::command]
pub fn delete_cloud_api_key(provider: String) -> Result<(), AppError> {
    credential_store::delete_cloud_key(&provider)
}

#[tauri::command]
pub fn get_cloud_api_key_status(provider: String) -> Result<bool, AppError> {
    Ok(credential_store::load_cloud_key(&provider)?.is_some())
}

#[tauri::command]
pub async fn test_cloud_api_key(provider: String) -> Result<bool, AppError> {
    let api_key = match credential_store::load_cloud_key(&provider)? {
        Some(key) => key,
        None => return Ok(false),
    };

    let cloud_provider = CloudProvider::from_str(&provider)
        .ok_or_else(|| AppError::Parse(format!("Unknown provider: {provider}")))?;

    use crate::services::ai::cloud_provider::CloudProviderApi;
    use crate::services::ai::gemini_provider::GeminiProvider;

    match cloud_provider {
        CloudProvider::OpenAi | CloudProvider::Claude => {
            return Err(AppError::Parse(format!(
                "{} support coming soon",
                cloud_provider.display_name()
            )));
        }
        CloudProvider::Gemini => {}
    }

    let provider_impl = GeminiProvider;
    match provider_impl
        .send_query(
            "You are a test. Respond with exactly: {\"actions\":[],\"summary\":\"ok\",\"confidence\":1.0}",
            "test",
            &api_key,
        )
        .await
    {
        Ok(_) => Ok(true),
        Err(e) => {
            tracing::warn!(error = %e, "Cloud API key test failed");
            Ok(false)
        }
    }
}

#[tauri::command]
pub fn get_cloud_ai_usage(cloud: State<'_, CloudConfigHandle>) -> Result<CloudAiUsage, AppError> {
    let mut config = cloud.lock_or_err("CloudConfig")?;
    config.maybe_reset_daily();
    Ok(CloudAiUsage {
        requests_today: config.requests_today,
        daily_limit: config.daily_limit,
        provider: config.provider.display_name().to_string(),
        last_reset_date: config.last_reset_date.clone(),
    })
}

#[tauri::command]
pub fn update_cloud_ai_settings(
    enabled: bool,
    provider: String,
    daily_limit: u32,
    cloud: State<'_, CloudConfigHandle>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    let cloud_provider = CloudProvider::from_str(&provider).unwrap_or(CloudProvider::Gemini);

    let clamped_limit = daily_limit.max(1);

    {
        let mut config = cloud.lock_or_err("CloudConfig")?;
        config.enabled = enabled;
        config.provider = cloud_provider;
        config.daily_limit = clamped_limit;
    } // drop lock before disk I/O

    // Persist cloud AI fields to settings.json so they survive app restart
    let mut settings = settings_store::load_settings(&app_handle)?;
    settings.cloud_ai_enabled = enabled;
    settings.cloud_ai_provider = provider.clone();
    settings.cloud_ai_daily_limit = clamped_limit;
    settings_store::save_settings(&app_handle, &settings)?;

    tracing::info!(
        enabled,
        provider = provider.as_str(),
        daily_limit = clamped_limit,
        "Cloud AI settings updated and persisted"
    );
    Ok(())
}
