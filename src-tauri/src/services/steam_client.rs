use std::sync::OnceLock;
use std::time::Duration;

use crate::models::game::{Game, GameSource, PlayerSummary};
use crate::models::steam_api::*;
use crate::utils::error::AppError;

const STEAM_API_BASE: &str = "https://api.steampowered.com";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

// ── Shared HTTP infrastructure ──────────────────────────────────────
// Used by steam_client, achievement_service, friends_service, and news_service
// to ensure consistent timeouts and prevent API key leakage in error messages.

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .expect("Failed to build Steam API HTTP client")
    })
}

/// Sanitize a reqwest error into an AppError::StoreApi without leaking API keys.
/// Raw reqwest errors include the full URL (with API key in query params)
/// in their Display impl, so we must never propagate them directly.
pub(crate) fn sanitize_steam_error(err: reqwest::Error, endpoint: &str) -> AppError {
    if err.is_timeout() {
        AppError::StoreApi(format!("Steam API request timed out: {endpoint}"))
    } else if err.is_connect() {
        AppError::StoreApi(format!("Failed to connect to Steam API: {endpoint}"))
    } else if let Some(status) = err.status() {
        AppError::StoreApi(format!(
            "Steam API returned HTTP {} for {endpoint}",
            status.as_u16()
        ))
    } else if err.is_decode() {
        AppError::StoreApi(format!("Failed to parse Steam API response: {endpoint}"))
    } else {
        AppError::StoreApi(format!("Steam API request failed: {endpoint}"))
    }
}

/// GET a Steam API endpoint, check status, and deserialize JSON response.
/// Uses shared HTTP client with 15s timeout. Errors sanitized to avoid leaking API keys.
pub(crate) async fn steam_get_json<T: serde::de::DeserializeOwned>(
    endpoint: &str,
    params: &[(&str, &str)],
) -> Result<T, AppError> {
    let url = format!("{}{}", STEAM_API_BASE, endpoint);
    let resp = client()
        .get(&url)
        .query(params)
        .send()
        .await
        .map_err(|e| sanitize_steam_error(e, endpoint))?
        .error_for_status()
        .map_err(|e| sanitize_steam_error(e, endpoint))?;
    resp.json::<T>()
        .await
        .map_err(|e| sanitize_steam_error(e, endpoint))
}

/// GET a Steam API endpoint and return raw response (caller handles status/body).
/// Uses shared HTTP client with 15s timeout. Transport errors sanitized.
pub(crate) async fn steam_get_raw(
    endpoint: &str,
    params: &[(&str, &str)],
) -> Result<reqwest::Response, AppError> {
    let url = format!("{}{}", STEAM_API_BASE, endpoint);
    client()
        .get(&url)
        .query(params)
        .send()
        .await
        .map_err(|e| sanitize_steam_error(e, endpoint))
}

// ── Public API functions ────────────────────────────────────────────

/// Fetch all owned games with playtime data from the Steam Web API.
pub async fn fetch_owned_games(api_key: &str, steam_id: &str) -> Result<Vec<Game>, AppError> {
    tracing::info!(endpoint = "GetOwnedGames/v1", "Steam API request");

    let resp: OwnedGamesResponse = steam_get_json(
        "/IPlayerService/GetOwnedGames/v1/",
        &[
            ("key", api_key),
            ("steamid", steam_id),
            ("include_appinfo", "1"),
            ("include_played_free_games", "1"),
            ("format", "json"),
        ],
    )
    .await?;

    let games = resp
        .response
        .games
        .unwrap_or_default()
        .into_iter()
        .map(|g| Game {
            game_id: String::new(), // Placeholder — caller assigns UUID after DB registration
            source: GameSource::Steam,
            source_id: g.appid.to_string(),
            name: g.name.unwrap_or_else(|| format!("App {}", g.appid)),
            install_dir: None,
            install_path: None,
            size_on_disk: None,
            last_updated: None,
            playtime_forever: g.playtime_forever.unwrap_or(0),
            playtime_2weeks: g.playtime_2weeks,
            last_played: g.rtime_last_played,
            is_installed: false,
            img_icon_url: g.img_icon_url,
            description: None,
            launch_args: None,
        })
        .collect();

    Ok(games)
}

/// Fetch recently played games (last 2 weeks).
pub async fn fetch_recent_games(api_key: &str, steam_id: &str) -> Result<Vec<Game>, AppError> {
    tracing::info!(endpoint = "GetRecentlyPlayedGames/v1", "Steam API request");

    let resp: RecentGamesResponse = steam_get_json(
        "/IPlayerService/GetRecentlyPlayedGames/v1/",
        &[("key", api_key), ("steamid", steam_id), ("format", "json")],
    )
    .await?;

    let games = resp
        .response
        .games
        .unwrap_or_default()
        .into_iter()
        .map(|g| Game {
            game_id: String::new(), // Placeholder — caller assigns UUID after DB registration
            source: GameSource::Steam,
            source_id: g.appid.to_string(),
            name: g.name.unwrap_or_else(|| format!("App {}", g.appid)),
            install_dir: None,
            install_path: None,
            size_on_disk: None,
            last_updated: None,
            playtime_forever: g.playtime_forever.unwrap_or(0),
            playtime_2weeks: g.playtime_2weeks,
            last_played: g.rtime_last_played,
            is_installed: false,
            img_icon_url: g.img_icon_url,
            description: None,
            launch_args: None,
        })
        .collect();

    Ok(games)
}

/// Fetch player profile summary.
pub async fn fetch_player_summary(
    api_key: &str,
    steam_id: &str,
) -> Result<PlayerSummary, AppError> {
    tracing::info!(endpoint = "GetPlayerSummaries/v2", "Steam API request");

    let resp: PlayerSummariesResponse = steam_get_json(
        "/ISteamUser/GetPlayerSummaries/v2/",
        &[("key", api_key), ("steamids", steam_id), ("format", "json")],
    )
    .await?;

    let player = resp
        .response
        .players
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound("Player not found".to_string()))?;

    Ok(PlayerSummary {
        steamid: player.steamid,
        persona_name: player.personaname,
        profile_url: player.profileurl,
        avatar_full: player.avatarfull,
        loc_country_code: player.loccountrycode,
        time_created: player.timecreated,
    })
}

/// Resolve a Steam vanity URL name to a 64-bit Steam ID.
pub async fn resolve_vanity_url(api_key: &str, vanity_name: &str) -> Result<String, AppError> {
    tracing::info!(
        endpoint = "ResolveVanityURL/v1",
        vanity_name = vanity_name,
        "Steam API request"
    );

    let resp: VanityUrlResponse = steam_get_json(
        "/ISteamUser/ResolveVanityURL/v1/",
        &[
            ("key", api_key),
            ("vanityurl", vanity_name),
            ("format", "json"),
        ],
    )
    .await?;

    match resp.response.success {
        1 => {
            let id = resp.response.steamid.ok_or_else(|| {
                AppError::NotFound("Vanity URL resolved but no Steam ID returned".to_string())
            })?;
            tracing::info!("Vanity URL resolved successfully");
            Ok(id)
        }
        _ => {
            tracing::warn!(vanity_name = vanity_name, "Vanity URL resolution failed");
            Err(AppError::NotFound(resp.response.message.unwrap_or_else(
                || "No match found for that username".to_string(),
            )))
        }
    }
}
