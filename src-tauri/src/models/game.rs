use serde::{Deserialize, Serialize};

/// The source/launcher a game comes from.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GameSource {
    Steam,
    Manual,
    Epic,
    Gog,
    EaApp,
    #[serde(rename = "ubisoft")]
    UbisoftConnect,
    #[serde(rename = "battlenet")]
    BattleNet,
}

impl GameSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            GameSource::Steam => "steam",
            GameSource::Manual => "manual",
            GameSource::Epic => "epic",
            GameSource::Gog => "gog",
            GameSource::EaApp => "ea_app",
            GameSource::UbisoftConnect => "ubisoft",
            GameSource::BattleNet => "battlenet",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "steam" => Some(GameSource::Steam),
            "manual" => Some(GameSource::Manual),
            "epic" => Some(GameSource::Epic),
            "gog" => Some(GameSource::Gog),
            "ea_app" => Some(GameSource::EaApp),
            "ubisoft" => Some(GameSource::UbisoftConnect),
            "battlenet" => Some(GameSource::BattleNet),
            _ => None,
        }
    }
}

/// Universal game identity with launcher linkage.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub game_id: String,
    pub source: GameSource,
    pub source_id: String,
    pub name: String,
    pub install_dir: Option<String>,
    pub install_path: Option<String>,
    pub size_on_disk: Option<u64>,
    pub last_updated: Option<u64>,
    pub playtime_forever: u32,
    pub playtime_2weeks: Option<u32>,
    pub last_played: Option<u64>,
    pub is_installed: bool,
    pub img_icon_url: Option<String>,
    pub description: Option<String>,
    pub launch_args: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLibrary {
    pub games: Vec<Game>,
    pub total_count: usize,
    #[serde(default)]
    pub warnings: Vec<String>,
}

/// Raw local game info from filesystem scanning.
/// Still uses u32 appid because ACF manifests contain integer appids.
/// The caller is responsible for resolving this to a game_id.
#[derive(Debug, Clone)]
pub struct LocalGameInfo {
    pub appid: u32,
    pub name: String,
    pub install_dir: String,
    pub size_on_disk: u64,
    pub last_updated: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_game_source_as_str() {
        assert_eq!(GameSource::Steam.as_str(), "steam");
        assert_eq!(GameSource::Manual.as_str(), "manual");
        assert_eq!(GameSource::Epic.as_str(), "epic");
        assert_eq!(GameSource::Gog.as_str(), "gog");
        assert_eq!(GameSource::EaApp.as_str(), "ea_app");
        assert_eq!(GameSource::UbisoftConnect.as_str(), "ubisoft");
        assert_eq!(GameSource::BattleNet.as_str(), "battlenet");
    }

    #[test]
    fn test_game_source_from_str() {
        assert_eq!(GameSource::from_str("steam"), Some(GameSource::Steam));
        assert_eq!(GameSource::from_str("manual"), Some(GameSource::Manual));
        assert_eq!(GameSource::from_str("epic"), Some(GameSource::Epic));
        assert_eq!(GameSource::from_str("gog"), Some(GameSource::Gog));
        assert_eq!(GameSource::from_str("ea_app"), Some(GameSource::EaApp));
        assert_eq!(
            GameSource::from_str("ubisoft"),
            Some(GameSource::UbisoftConnect)
        );
        assert_eq!(
            GameSource::from_str("battlenet"),
            Some(GameSource::BattleNet)
        );
        assert_eq!(GameSource::from_str("unknown"), None);
        assert_eq!(GameSource::from_str(""), None);
    }

    #[test]
    fn test_game_source_roundtrip() {
        let sources = [
            GameSource::Steam,
            GameSource::Manual,
            GameSource::Epic,
            GameSource::Gog,
            GameSource::EaApp,
            GameSource::UbisoftConnect,
            GameSource::BattleNet,
        ];
        for source in sources {
            let s = source.as_str();
            let recovered =
                GameSource::from_str(s).unwrap_or_else(|| panic!("from_str failed for '{}'", s));
            assert_eq!(recovered, source);
        }
    }

    #[test]
    fn test_game_source_serde_roundtrip() {
        let sources = [
            GameSource::Steam,
            GameSource::Epic,
            GameSource::Gog,
            GameSource::EaApp,
            GameSource::UbisoftConnect,
            GameSource::BattleNet,
        ];
        for source in &sources {
            let json = serde_json::to_string(source).unwrap();
            let recovered: GameSource = serde_json::from_str(&json).unwrap();
            assert_eq!(&recovered, source);
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSummary {
    pub steamid: String,
    pub persona_name: String,
    pub profile_url: String,
    pub avatar_full: String,
    pub loc_country_code: Option<String>,
    pub time_created: Option<u64>,
}
