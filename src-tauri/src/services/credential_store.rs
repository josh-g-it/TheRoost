use crate::utils::error::AppError;

const SERVICE_NAME: &str = "app.theroost";
const API_KEY_ACCOUNT: &str = "steam_api_key";
const SGDB_API_KEY_ACCOUNT: &str = "steamgriddb_api_key";

pub fn store_api_key(key: &str) -> Result<(), AppError> {
    tracing::info!("Storing API key in credential manager");
    let entry = keyring::Entry::new(SERVICE_NAME, API_KEY_ACCOUNT)
        .map_err(|e| AppError::Credential(format!("Keyring init error: {e}")))?;
    entry
        .set_password(key)
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to store API key");
            AppError::Credential(format!("Keyring store error: {e}"))
        })?;
    tracing::info!("API key stored successfully");
    Ok(())
}

pub fn load_api_key() -> Result<Option<String>, AppError> {
    tracing::debug!("Loading API key from credential manager");
    let entry = keyring::Entry::new(SERVICE_NAME, API_KEY_ACCOUNT)
        .map_err(|e| AppError::Credential(format!("Keyring init error: {e}")))?;
    match entry.get_password() {
        Ok(_key) => {
            tracing::debug!("API key loaded from credential manager");
            Ok(Some(_key))
        }
        Err(keyring::Error::NoEntry) => {
            tracing::debug!("No API key found in credential manager");
            Ok(None)
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to load API key");
            Err(AppError::Credential(format!("Keyring load error: {e}")))
        }
    }
}

pub fn delete_api_key() -> Result<(), AppError> {
    tracing::debug!("Deleting API key from credential manager");
    let entry = keyring::Entry::new(SERVICE_NAME, API_KEY_ACCOUNT)
        .map_err(|e| AppError::Credential(format!("Keyring init error: {e}")))?;
    match entry.delete_credential() {
        Ok(()) => {
            tracing::info!("API key deleted from credential manager");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => {
            tracing::error!(error = %e, "Failed to delete API key");
            Err(AppError::Credential(format!("Keyring delete error: {e}")))
        }
    }
}

// ── SteamGridDB API Key ─────────────────────────────────────────

pub fn store_sgdb_api_key(key: &str) -> Result<(), AppError> {
    tracing::info!("Storing SteamGridDB API key in credential manager");
    let entry = keyring::Entry::new(SERVICE_NAME, SGDB_API_KEY_ACCOUNT)
        .map_err(|e| AppError::Credential(format!("Keyring init error: {e}")))?;
    entry
        .set_password(key)
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to store SteamGridDB API key");
            AppError::Credential(format!("Keyring store error: {e}"))
        })?;
    tracing::info!("SteamGridDB API key stored successfully");
    Ok(())
}

pub fn load_sgdb_api_key() -> Result<Option<String>, AppError> {
    tracing::debug!("Loading SteamGridDB API key from credential manager");
    let entry = keyring::Entry::new(SERVICE_NAME, SGDB_API_KEY_ACCOUNT)
        .map_err(|e| AppError::Credential(format!("Keyring init error: {e}")))?;
    match entry.get_password() {
        Ok(key) => {
            tracing::debug!("SteamGridDB API key loaded");
            Ok(Some(key))
        }
        Err(keyring::Error::NoEntry) => {
            tracing::debug!("No SteamGridDB API key found");
            Ok(None)
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to load SteamGridDB API key");
            Err(AppError::Credential(format!("Keyring load error: {e}")))
        }
    }
}

pub fn delete_sgdb_api_key() -> Result<(), AppError> {
    tracing::debug!("Deleting SteamGridDB API key from credential manager");
    let entry = keyring::Entry::new(SERVICE_NAME, SGDB_API_KEY_ACCOUNT)
        .map_err(|e| AppError::Credential(format!("Keyring init error: {e}")))?;
    match entry.delete_credential() {
        Ok(()) => {
            tracing::info!("SteamGridDB API key deleted");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => {
            tracing::error!(error = %e, "Failed to delete SteamGridDB API key");
            Err(AppError::Credential(format!("Keyring delete error: {e}")))
        }
    }
}

// ── Cloud AI API Keys ─────────────────────────────────────────

/// Store a cloud AI provider API key. Account name: `cloud_ai_{provider}`.
pub fn store_cloud_key(provider: &str, key: &str) -> Result<(), AppError> {
    let account = format!("cloud_ai_{provider}");
    tracing::info!(provider, "Storing cloud AI API key");
    let entry = keyring::Entry::new(SERVICE_NAME, &account)
        .map_err(|e| AppError::Credential(format!("Keyring init error: {e}")))?;
    entry
        .set_password(key)
        .map_err(|e| {
            tracing::error!(provider, error = %e, "Failed to store cloud AI API key");
            AppError::Credential(format!("Keyring store error: {e}"))
        })?;
    tracing::info!(provider, "Cloud AI API key stored");
    Ok(())
}

/// Load a cloud AI provider API key. Returns None if not configured.
pub fn load_cloud_key(provider: &str) -> Result<Option<String>, AppError> {
    let account = format!("cloud_ai_{provider}");
    let entry = keyring::Entry::new(SERVICE_NAME, &account)
        .map_err(|e| AppError::Credential(format!("Keyring init error: {e}")))?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => {
            tracing::error!(provider, error = %e, "Failed to load cloud AI API key");
            Err(AppError::Credential(format!("Keyring load error: {e}")))
        }
    }
}

/// Delete a cloud AI provider API key.
pub fn delete_cloud_key(provider: &str) -> Result<(), AppError> {
    let account = format!("cloud_ai_{provider}");
    tracing::debug!(provider, "Deleting cloud AI API key");
    let entry = keyring::Entry::new(SERVICE_NAME, &account)
        .map_err(|e| AppError::Credential(format!("Keyring init error: {e}")))?;
    match entry.delete_credential() {
        Ok(()) => {
            tracing::info!(provider, "Cloud AI API key deleted");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => {
            tracing::error!(provider, error = %e, "Failed to delete cloud AI API key");
            Err(AppError::Credential(format!("Keyring delete error: {e}")))
        }
    }
}
