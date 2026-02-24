use std::collections::HashMap;

use crate::models::friend::*;
use crate::models::steam_api::{
    ApiGame, ApiPlayerSummary, OwnedGamesResponse, PlayerSummariesResponse,
};
use crate::services::steam_client::{steam_get_json, steam_get_raw};
use crate::utils::error::AppError;

/// Fetch the user's friend list enriched with profile data (online status, current game).
pub async fn fetch_friends(api_key: &str, steam_id: &str) -> Result<Vec<FriendInfo>, AppError> {
    tracing::info!("Fetching friend list from Steam API");

    // Step 1: Get friend list
    let resp: FriendListResponse = steam_get_json(
        "/ISteamUser/GetFriendList/v1/",
        &[
            ("key", api_key),
            ("steamid", steam_id),
            ("relationship", "friend"),
            ("format", "json"),
        ],
    )
    .await?;
    let friends = resp.friendslist.friends;

    if friends.is_empty() {
        tracing::info!("Friend list is empty");
        return Ok(Vec::new());
    }

    // Build friend_since lookup
    let friend_since_map: HashMap<String, u64> = friends
        .iter()
        .map(|f| (f.steamid.clone(), f.friend_since))
        .collect();

    // Step 2: Batch fetch player summaries (max 100 per request)
    let friend_ids: Vec<&str> = friends.iter().map(|f| f.steamid.as_str()).collect();
    let mut all_summaries: Vec<ApiPlayerSummary> = Vec::new();

    for chunk in friend_ids.chunks(100) {
        let ids = chunk.join(",");
        let resp = steam_get_raw(
            "/ISteamUser/GetPlayerSummaries/v2/",
            &[("key", api_key), ("steamids", &ids), ("format", "json")],
        )
        .await?;
        match resp.json::<PlayerSummariesResponse>().await {
            Ok(resp) => all_summaries.extend(resp.response.players),
            Err(e) => {
                tracing::warn!(error = %e, "Failed to fetch batch of player summaries");
            }
        }
    }

    // Step 3: Merge friend_since with profile data
    let result: Vec<FriendInfo> = all_summaries
        .into_iter()
        .map(|p| {
            let friend_since = friend_since_map.get(&p.steamid).copied().unwrap_or(0);
            FriendInfo {
                steam_id: p.steamid,
                persona_name: p.personaname,
                avatar_url: p.avatarfull,
                profile_url: p.profileurl,
                persona_state: p.personastate.unwrap_or(0),
                current_game_name: p.gameextrainfo,
                current_game_id: p.gameid,
                friend_since,
            }
        })
        .collect();

    tracing::info!(count = result.len(), "Friends list fetched with profiles");
    Ok(result)
}

/// Fetch a friend's game library. Returns empty library if profile is private.
pub async fn fetch_friend_library(
    api_key: &str,
    friend_steam_id: &str,
) -> Result<FriendLibrary, AppError> {
    tracing::info!(friend_steam_id, "Fetching friend library");

    let resp = steam_get_raw(
        "/IPlayerService/GetOwnedGames/v1/",
        &[
            ("key", api_key),
            ("steamid", friend_steam_id),
            ("include_appinfo", "1"),
            ("include_played_free_games", "1"),
            ("format", "json"),
        ],
    )
    .await?;

    // Private profiles may return 200 but with empty response
    let owned: OwnedGamesResponse = match resp.json().await {
        Ok(data) => data,
        Err(e) => {
            tracing::debug!(friend_steam_id, error = %e, "Could not parse friend library (likely private profile)");
            return Ok(FriendLibrary {
                steam_id: friend_steam_id.to_string(),
                games: Vec::new(),
            });
        }
    };

    let games: Vec<FriendGame> = owned
        .response
        .games
        .unwrap_or_default()
        .into_iter()
        .map(|g: ApiGame| FriendGame {
            appid: g.appid,
            name: g.name.unwrap_or_else(|| format!("App {}", g.appid)),
            playtime_forever: g.playtime_forever.unwrap_or(0),
        })
        .collect();

    tracing::info!(
        friend_steam_id,
        count = games.len(),
        "Friend library fetched"
    );
    Ok(FriendLibrary {
        steam_id: friend_steam_id.to_string(),
        games,
    })
}
