use std::time::Duration;

use crate::utils::error::AppError;

/// A single image option returned from SteamGridDB, for the art picker UI.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SgdbImageOption {
    pub id: u64,
    pub url: String,
    pub thumb: String,
    pub width: u32,
    pub height: u32,
}

const SGDB_BASE: &str = "https://www.steamgriddb.com/api/v2";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const BATCH_DELAY: Duration = Duration::from_millis(500);

pub struct SteamGridDbClient {
    client: reqwest::Client,
    api_key: String,
}

impl SteamGridDbClient {
    pub fn new(api_key: String) -> Result<Self, AppError> {
        let client = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()?;
        Ok(Self { client, api_key })
    }

    /// Search for a game by name. Returns the first matching SteamGridDB game ID.
    pub async fn search_game(&self, name: &str) -> Result<Option<u64>, AppError> {
        let url = format!("{}/search/autocomplete/{}", SGDB_BASE, urlencoded(name));
        tracing::debug!(name, "SteamGridDB: searching for game");

        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await?;

        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            tracing::warn!("SteamGridDB rate limited (429)");
            return Err(AppError::StoreApi("SteamGridDB rate limited".to_string()));
        }

        if !resp.status().is_success() {
            tracing::warn!(status = %resp.status(), "SteamGridDB search failed");
            return Ok(None);
        }

        let body: serde_json::Value = resp.json().await?;

        // Response: { "success": true, "data": [{ "id": 12345, "name": "...", ... }] }
        let sgdb_id = body
            .get("data")
            .and_then(|d| d.as_array())
            .and_then(|arr| arr.first())
            .and_then(|item| item.get("id"))
            .and_then(|id| id.as_u64());

        if let Some(id) = sgdb_id {
            tracing::debug!(sgdb_id = id, name, "SteamGridDB: game found");
        } else {
            tracing::debug!(name, "SteamGridDB: no results");
        }

        Ok(sgdb_id)
    }

    /// Fetch a grid (cover art) image URL for a SteamGridDB game ID.
    /// Prefers 600x900 portrait format for game cards.
    pub async fn fetch_grid_url(&self, sgdb_id: u64) -> Result<Option<String>, AppError> {
        let url = format!("{}/grids/game/{}?dimensions=600x900", SGDB_BASE, sgdb_id);
        self.fetch_image_url(&url, "grid", sgdb_id).await
    }

    /// Fetch a hero (banner) image URL for a SteamGridDB game ID.
    pub async fn fetch_hero_url(&self, sgdb_id: u64) -> Result<Option<String>, AppError> {
        let url = format!("{}/heroes/game/{}", SGDB_BASE, sgdb_id);
        self.fetch_image_url(&url, "hero", sgdb_id).await
    }

    /// Fetch multiple grid image options for the art picker.
    pub async fn fetch_grid_options(
        &self,
        sgdb_id: u64,
        limit: usize,
    ) -> Result<Vec<SgdbImageOption>, AppError> {
        let url = format!(
            "{}/grids/game/{}?dimensions=600x900,460x215,920x430",
            SGDB_BASE, sgdb_id
        );
        self.fetch_image_options(&url, limit).await
    }

    /// Fetch a logo (icon) image URL for a SteamGridDB game ID.
    pub async fn fetch_logo_url(&self, sgdb_id: u64) -> Result<Option<String>, AppError> {
        let url = format!("{}/logos/game/{}", SGDB_BASE, sgdb_id);
        self.fetch_image_url(&url, "logo", sgdb_id).await
    }

    /// Fetch multiple logo image options for the art picker.
    pub async fn fetch_logo_options(
        &self,
        sgdb_id: u64,
        limit: usize,
    ) -> Result<Vec<SgdbImageOption>, AppError> {
        let url = format!("{}/logos/game/{}", SGDB_BASE, sgdb_id);
        self.fetch_image_options(&url, limit).await
    }

    /// Fetch multiple hero image options for the art picker.
    pub async fn fetch_hero_options(
        &self,
        sgdb_id: u64,
        limit: usize,
    ) -> Result<Vec<SgdbImageOption>, AppError> {
        let url = format!("{}/heroes/game/{}", SGDB_BASE, sgdb_id);
        self.fetch_image_options(&url, limit).await
    }

    async fn fetch_image_options(
        &self,
        url: &str,
        limit: usize,
    ) -> Result<Vec<SgdbImageOption>, AppError> {
        let resp = self
            .client
            .get(url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await?;

        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AppError::StoreApi("SteamGridDB rate limited".to_string()));
        }
        if !resp.status().is_success() {
            return Ok(vec![]);
        }

        let body: serde_json::Value = resp.json().await?;
        let results: Vec<SgdbImageOption> = body
            .get("data")
            .and_then(|d| d.as_array())
            .map(|arr| {
                arr.iter()
                    .take(limit)
                    .filter_map(|item| {
                        Some(SgdbImageOption {
                            id: item.get("id")?.as_u64()?,
                            url: item.get("url")?.as_str()?.to_string(),
                            thumb: item.get("thumb")?.as_str()?.to_string(),
                            width: item.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                            height: item.get("height").and_then(|v| v.as_u64()).unwrap_or(0)
                                as u32,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        tracing::debug!(count = results.len(), "SteamGridDB: fetched image options");
        Ok(results)
    }

    async fn fetch_image_url(
        &self,
        url: &str,
        image_type: &str,
        sgdb_id: u64,
    ) -> Result<Option<String>, AppError> {
        let resp = self
            .client
            .get(url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await?;

        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            tracing::warn!("SteamGridDB rate limited (429)");
            return Err(AppError::StoreApi("SteamGridDB rate limited".to_string()));
        }

        if !resp.status().is_success() {
            tracing::warn!(sgdb_id, image_type, status = %resp.status(), "SteamGridDB image fetch failed");
            return Ok(None);
        }

        let body: serde_json::Value = resp.json().await?;

        // Response: { "success": true, "data": [{ "url": "https://cdn2.steamgriddb.com/...", ... }] }
        let image_url = body
            .get("data")
            .and_then(|d| d.as_array())
            .and_then(|arr| arr.first())
            .and_then(|item| item.get("url"))
            .and_then(|u| u.as_str())
            .map(|s| s.to_string());

        if image_url.is_some() {
            tracing::debug!(sgdb_id, image_type, "SteamGridDB: image found");
        }

        Ok(image_url)
    }

    /// Delay between batch requests to respect rate limits.
    pub async fn batch_delay() {
        tokio::time::sleep(BATCH_DELAY).await;
    }
}

/// Fetch a cover image URL for a GOG game using GOG's public product API (no key needed).
pub async fn fetch_gog_image(product_id: &str) -> Result<Option<String>, AppError> {
    let url = format!(
        "https://api.gog.com/products/{}?expand=images",
        product_id
    );
    tracing::debug!(product_id, "Fetching GOG product images");

    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()?;

    let resp = client.get(&url).send().await?;

    if !resp.status().is_success() {
        tracing::debug!(product_id, status = %resp.status(), "GOG product API returned non-success");
        return Ok(None);
    }

    let body: serde_json::Value = resp.json().await?;

    // GOG response: { "images": { "logo2x": "//images-1.gog.com/...", ... } }
    let image_url = body
        .get("images")
        .and_then(|imgs| imgs.get("logo2x"))
        .and_then(|u| u.as_str())
        .map(|s| {
            // GOG returns protocol-relative URLs like "//images-1.gog.com/..."
            if s.starts_with("//") {
                format!("https:{}", s)
            } else {
                s.to_string()
            }
        });

    if image_url.is_some() {
        tracing::debug!(product_id, "GOG image found");
    } else {
        tracing::debug!(product_id, "GOG: no image in product response");
    }

    Ok(image_url)
}

/// Percent-encode a string for use in URL path segments.
/// Encodes each UTF-8 byte individually so non-ASCII characters are handled correctly.
fn urlencoded(s: &str) -> String {
    let mut result = String::with_capacity(s.len() * 2);
    for byte in s.bytes() {
        if byte.is_ascii_alphanumeric() || b"-._~".contains(&byte) {
            result.push(byte as char);
        } else {
            result.push_str(&format!("%{:02X}", byte));
        }
    }
    result
}
