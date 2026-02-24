use crate::models::game::{Game, PlayerSummary};
use crate::services::steam_client;
use crate::utils::error::AppError;

#[tauri::command]
pub async fn fetch_owned_games(api_key: String, steam_id: String) -> Result<Vec<Game>, AppError> {
    tracing::info!("Fetching owned games from Steam API");
    let result = steam_client::fetch_owned_games(&api_key, &steam_id).await;
    match &result {
        Ok(games) => tracing::info!(count = games.len(), "Owned games fetched"),
        Err(e) => tracing::error!(error = %e, "Failed to fetch owned games"),
    }
    result
}

#[tauri::command]
pub async fn fetch_recent_games(api_key: String, steam_id: String) -> Result<Vec<Game>, AppError> {
    tracing::info!("Fetching recent games from Steam API");
    let result = steam_client::fetch_recent_games(&api_key, &steam_id).await;
    match &result {
        Ok(games) => tracing::info!(count = games.len(), "Recent games fetched"),
        Err(e) => tracing::error!(error = %e, "Failed to fetch recent games"),
    }
    result
}

#[tauri::command]
pub async fn fetch_player_summary(
    api_key: String,
    steam_id: String,
) -> Result<PlayerSummary, AppError> {
    tracing::info!("Fetching player summary");
    let result = steam_client::fetch_player_summary(&api_key, &steam_id).await;
    match &result {
        Ok(p) => tracing::info!(persona_name = %p.persona_name, "Player summary fetched"),
        Err(e) => tracing::error!(error = %e, "Failed to fetch player summary"),
    }
    result
}

/// Resolve user input (vanity URL, profile URL, or raw Steam ID) to a full player profile.
#[tauri::command]
pub async fn resolve_steam_account(
    api_key: String,
    input: String,
) -> Result<PlayerSummary, AppError> {
    tracing::info!(input_type = "user_input", "Resolving Steam account");
    let input = input.trim().to_string();
    let steam_id = resolve_input_to_steam_id(&api_key, &input).await?;
    tracing::info!("Steam ID resolved, fetching profile");
    steam_client::fetch_player_summary(&api_key, &steam_id).await
}

/// Parse user input and resolve to a 64-bit Steam ID.
/// Accepts:
///   - Raw 64-bit Steam ID (17-digit number starting with 7656)
///   - Full profile URL: https://steamcommunity.com/profiles/76561198...
///   - Full profile URL: https://steamcommunity.com/id/vanityname
///   - Vanity name (plain text)
async fn resolve_input_to_steam_id(api_key: &str, input: &str) -> Result<String, AppError> {
    // Check if it's a raw 64-bit Steam ID
    if input.len() == 17 && input.chars().all(|c| c.is_ascii_digit()) && input.starts_with("7656") {
        return Ok(input.to_string());
    }

    // Check if it's a profile URL with /profiles/STEAMID64
    if let Some(id) = extract_steam_id_from_profile_url(input) {
        return Ok(id);
    }

    // Extract vanity name from URL, or use the input directly
    let vanity = extract_vanity_from_url(input).unwrap_or_else(|| input.to_string());

    steam_client::resolve_vanity_url(api_key, &vanity).await
}

fn extract_steam_id_from_profile_url(input: &str) -> Option<String> {
    let pattern = "steamcommunity.com/profiles/";
    if let Some(pos) = input.find(pattern) {
        let after = &input[pos + pattern.len()..];
        let id: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
        if id.len() == 17 && id.starts_with("7656") {
            return Some(id);
        }
    }
    None
}

fn extract_vanity_from_url(input: &str) -> Option<String> {
    let pattern = "steamcommunity.com/id/";
    if let Some(pos) = input.find(pattern) {
        let after = &input[pos + pattern.len()..];
        let vanity: String = after
            .chars()
            .take_while(|c| *c != '/' && *c != '?')
            .collect();
        if !vanity.is_empty() {
            return Some(vanity);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    // extract_steam_id_from_profile_url tests

    #[test]
    fn test_extract_steam_id_https() {
        assert_eq!(
            extract_steam_id_from_profile_url(
                "https://steamcommunity.com/profiles/76561198012345678"
            ),
            Some("76561198012345678".to_string())
        );
    }

    #[test]
    fn test_extract_steam_id_http() {
        assert_eq!(
            extract_steam_id_from_profile_url(
                "http://steamcommunity.com/profiles/76561198012345678"
            ),
            Some("76561198012345678".to_string())
        );
    }

    #[test]
    fn test_extract_steam_id_trailing_slash() {
        assert_eq!(
            extract_steam_id_from_profile_url(
                "https://steamcommunity.com/profiles/76561198012345678/"
            ),
            Some("76561198012345678".to_string())
        );
    }

    #[test]
    fn test_extract_steam_id_non_steam_url() {
        assert_eq!(
            extract_steam_id_from_profile_url("https://example.com/profiles/76561198012345678"),
            None
        );
    }

    #[test]
    fn test_extract_steam_id_short() {
        assert_eq!(
            extract_steam_id_from_profile_url("https://steamcommunity.com/profiles/1234"),
            None
        );
    }

    #[test]
    fn test_extract_steam_id_no_profiles_path() {
        assert_eq!(
            extract_steam_id_from_profile_url("https://steamcommunity.com/id/someuser"),
            None
        );
    }

    #[test]
    fn test_extract_steam_id_wrong_prefix() {
        assert_eq!(
            extract_steam_id_from_profile_url(
                "https://steamcommunity.com/profiles/12345678901234567"
            ),
            None
        );
    }

    // extract_vanity_from_url tests

    #[test]
    fn test_extract_vanity_basic() {
        assert_eq!(
            extract_vanity_from_url("https://steamcommunity.com/id/gaben"),
            Some("gaben".to_string())
        );
    }

    #[test]
    fn test_extract_vanity_trailing_slash() {
        assert_eq!(
            extract_vanity_from_url("https://steamcommunity.com/id/gaben/"),
            Some("gaben".to_string())
        );
    }

    #[test]
    fn test_extract_vanity_query_params() {
        assert_eq!(
            extract_vanity_from_url("https://steamcommunity.com/id/gaben?ref=nav"),
            Some("gaben".to_string())
        );
    }

    #[test]
    fn test_extract_vanity_non_steam() {
        assert_eq!(
            extract_vanity_from_url("https://example.com/id/gaben"),
            None
        );
    }

    #[test]
    fn test_extract_vanity_empty() {
        assert_eq!(
            extract_vanity_from_url("https://steamcommunity.com/id/"),
            None
        );
    }

    #[test]
    fn test_extract_vanity_plain_text() {
        assert_eq!(extract_vanity_from_url("gaben"), None);
    }
}
