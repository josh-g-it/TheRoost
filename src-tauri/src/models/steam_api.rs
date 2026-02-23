use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct OwnedGamesResponse {
    pub response: OwnedGamesData,
}

#[derive(Debug, Deserialize)]
pub struct OwnedGamesData {
    #[allow(dead_code)]
    pub game_count: Option<u32>,
    pub games: Option<Vec<ApiGame>>,
}

#[derive(Debug, Deserialize)]
pub struct ApiGame {
    pub appid: u32,
    pub name: Option<String>,
    pub playtime_forever: Option<u32>,
    pub playtime_2weeks: Option<u32>,
    pub img_icon_url: Option<String>,
    pub rtime_last_played: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct RecentGamesResponse {
    pub response: RecentGamesData,
}

#[derive(Debug, Deserialize)]
pub struct RecentGamesData {
    #[allow(dead_code)]
    pub total_count: Option<u32>,
    pub games: Option<Vec<ApiGame>>,
}

#[derive(Debug, Deserialize)]
pub struct PlayerSummariesResponse {
    pub response: PlayerSummariesData,
}

#[derive(Debug, Deserialize)]
pub struct PlayerSummariesData {
    pub players: Vec<ApiPlayerSummary>,
}

#[derive(Debug, Deserialize)]
pub struct ApiPlayerSummary {
    pub steamid: String,
    pub personaname: String,
    pub profileurl: String,
    pub avatarfull: String,
    pub loccountrycode: Option<String>,
    pub timecreated: Option<u64>,
    /// 0=Offline, 1=Online, 2=Busy, 3=Away, 4=Snooze, 5=Looking to trade, 6=Looking to play
    pub personastate: Option<u32>,
    /// Name of the game currently being played (if any)
    pub gameextrainfo: Option<String>,
    /// AppID of the game currently being played (if any)
    pub gameid: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct VanityUrlResponse {
    pub response: VanityUrlData,
}

#[derive(Debug, Deserialize)]
pub struct VanityUrlData {
    /// 1 = success, 42 = no match
    pub success: u32,
    pub steamid: Option<String>,
    pub message: Option<String>,
}
