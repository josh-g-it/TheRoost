use std::time::Duration;

use crate::models::metadata::{
    CategoryInfo, GenreInfo, ScreenshotInfo, StoreMetadata,
};
use crate::models::store_api::StoreAppDetailsWrapper;
use crate::utils::error::AppError;

const STORE_API_BASE: &str = "https://store.steampowered.com/api";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

pub struct StoreClient {
    client: reqwest::Client,
}

impl StoreClient {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .expect("Failed to build HTTP client");
        Self { client }
    }

    /// Fetch app details for a single game from the Steam Store API.
    /// Used for on-demand enrichment (GameDetail open) and slow background backfill.
    pub async fn fetch_app_details(
        &self,
        appid: u32,
    ) -> Result<Option<StoreMetadata>, AppError> {
        let url = format!("{}/appdetails?appids={}", STORE_API_BASE, appid);

        let resp = self.client.get(&url).send().await?;

        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            tracing::warn!(appid, "Store API rate limited (429)");
            return Err(AppError::StoreApi("Rate limited".to_string()));
        }

        if !resp.status().is_success() {
            tracing::warn!(appid, status = %resp.status(), "Store API error");
            return Ok(None);
        }

        let body: serde_json::Value = resp.json().await?;

        // Response is keyed by appid string: { "123456": { "success": true, "data": {...} } }
        let key = appid.to_string();
        let wrapper = match body.get(&key) {
            Some(val) => match serde_json::from_value::<StoreAppDetailsWrapper>(val.clone()) {
                Ok(w) => w,
                Err(e) => {
                    tracing::warn!(appid, error = %e, "Failed to parse store response");
                    return Ok(None);
                }
            },
            None => return Ok(None),
        };

        if !wrapper.success {
            return Ok(None);
        }

        let data = match wrapper.data {
            Some(d) => d,
            None => return Ok(None),
        };

        let metadata = StoreMetadata {
            game_id: String::new(), // Placeholder — caller sets real game_id
            name: data.name,
            short_description: data.short_description,
            header_image_url: data.header_image,
            developers: data.developers.unwrap_or_default(),
            publishers: data.publishers.unwrap_or_default(),
            genres: data
                .genres
                .unwrap_or_default()
                .into_iter()
                .map(|g| GenreInfo {
                    id: g.id,
                    description: g.description,
                })
                .collect(),
            categories: data
                .categories
                .unwrap_or_default()
                .into_iter()
                .map(|c| CategoryInfo {
                    id: c.id,
                    description: c.description,
                })
                .collect(),
            screenshots: data
                .screenshots
                .unwrap_or_default()
                .into_iter()
                .map(|s| ScreenshotInfo {
                    id: s.id,
                    thumbnail_url: s.path_thumbnail,
                    full_url: s.path_full,
                })
                .collect(),
            release_date: data.release_date.and_then(|rd| rd.date),
            metacritic_score: data.metacritic.as_ref().map(|m| m.score),
            metacritic_url: data.metacritic.and_then(|m| m.url),
            steam_tags: Vec::new(), // Populated by SteamSpy via MetadataService
        };

        Ok(Some(metadata))
    }
}
