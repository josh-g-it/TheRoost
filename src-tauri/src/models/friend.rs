use serde::{Deserialize, Serialize};

// ── GetFriendList/v1 response ──────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct FriendListResponse {
    pub friendslist: FriendListData,
}

#[derive(Debug, Deserialize)]
pub struct FriendListData {
    pub friends: Vec<ApiFriend>,
}

#[derive(Debug, Deserialize)]
pub struct ApiFriend {
    pub steamid: String,
    pub relationship: String,
    pub friend_since: u64,
}

// ── Enriched friend (merged with GetPlayerSummaries) ───────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendInfo {
    pub steam_id: String,
    pub persona_name: String,
    pub avatar_url: String,
    pub profile_url: String,
    /// 0=Offline, 1=Online, 2=Busy, 3=Away, 4=Snooze, 5=Looking to trade, 6=Looking to play
    pub persona_state: u32,
    pub current_game_name: Option<String>,
    pub current_game_id: Option<String>,
    pub friend_since: u64,
}

// ── Friend library (from GetOwnedGames on a friend) ────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendLibrary {
    pub steam_id: String,
    pub games: Vec<FriendGame>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendGame {
    pub appid: u32,
    pub name: String,
    pub playtime_forever: u32,
}
