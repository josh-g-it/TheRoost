use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use futures::stream::{self, StreamExt};
use tokio::time::Instant;

use crate::models::metadata::{GenreInfo, SteamTagInfo};
use crate::utils::error::AppError;

/// Richer data extracted from a SteamSpy appdetails response.
/// Used as the primary batch metadata source (tags + genres + basic info).
pub struct SteamSpyAppData {
    pub name: String,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    pub genres: Vec<GenreInfo>,
    pub tags: Vec<SteamTagInfo>,
}

const STEAMSPY_API_BASE: &str = "https://steamspy.com/api.php";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const STEAMSPY_CONCURRENCY: usize = 5;
/// Minimum interval between SteamSpy request starts.
const MIN_REQUEST_INTERVAL: Duration = Duration::from_millis(100);
/// Initial backoff when rate limited before retrying.
const INITIAL_BACKOFF: Duration = Duration::from_secs(15);
/// Maximum number of retry attempts after rate limiting.
const MAX_RETRIES: usize = 5;
/// Number of requests before inserting a proactive cooldown pause.
const COOLDOWN_BATCH_SIZE: usize = 50;
/// Duration of the cooldown pause between batches.
const COOLDOWN_DURATION: Duration = Duration::from_secs(3);

/// Sanitize a reqwest error into an AppError::StoreApi without leaking
/// the request URL. SteamSpy URLs contain appids (not secrets) but we
/// still follow the project-wide convention of never propagating raw
/// reqwest errors to the frontend.
fn sanitize_steamspy_error(err: reqwest::Error, endpoint: &str) -> AppError {
    if err.is_timeout() {
        AppError::StoreApi(format!("SteamSpy request timed out: {endpoint}"))
    } else if err.is_connect() {
        AppError::StoreApi(format!("Failed to connect to SteamSpy: {endpoint}"))
    } else if let Some(status) = err.status() {
        AppError::StoreApi(format!(
            "SteamSpy returned HTTP {} for {endpoint}",
            status.as_u16()
        ))
    } else if err.is_decode() {
        AppError::StoreApi(format!("Failed to parse SteamSpy response: {endpoint}"))
    } else {
        AppError::StoreApi(format!("SteamSpy request failed: {endpoint}"))
    }
}

pub struct SteamSpyClient {
    client: reqwest::Client,
}

impl SteamSpyClient {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .expect("Failed to build SteamSpy HTTP client");
        Self { client }
    }

    /// Fetch community tags for a single game from SteamSpy.
    /// Returns tags sorted by votes descending (most popular first).
    pub async fn fetch_tags(&self, appid: u32) -> Result<Vec<SteamTagInfo>, AppError> {
        Self::fetch_tags_impl(&self.client, appid).await
    }

    /// Fetch tags using a client reference.
    /// Extracted so `fetch_tags_batch` can clone the client for concurrent use.
    async fn fetch_tags_impl(
        client: &reqwest::Client,
        appid: u32,
    ) -> Result<Vec<SteamTagInfo>, AppError> {
        let url = format!("{}?request=appdetails&appid={}", STEAMSPY_API_BASE, appid);

        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| sanitize_steamspy_error(e, "appdetails"))?;

        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            tracing::warn!(appid, "SteamSpy rate limited (429)");
            return Err(AppError::StoreApi("SteamSpy rate limited".to_string()));
        }

        if !resp.status().is_success() {
            tracing::warn!(appid, status = %resp.status(), "SteamSpy API error");
            return Ok(Vec::new());
        }

        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| sanitize_steamspy_error(e, "appdetails"))?;

        // SteamSpy returns: { "tags": { "TagName": voteCount, ... }, ... }
        let tags = match body.get("tags") {
            Some(serde_json::Value::Object(map)) => {
                let mut tag_list: Vec<SteamTagInfo> = map
                    .iter()
                    .filter_map(|(name, votes)| {
                        votes.as_u64().map(|v| SteamTagInfo {
                            name: name.clone(),
                            votes: v as u32,
                        })
                    })
                    .collect();
                tag_list.sort_by(|a, b| b.votes.cmp(&a.votes));
                tag_list
            }
            _ => Vec::new(),
        };

        Ok(tags)
    }

    /// Run one concurrent pass over the given appids. Returns results and the set of
    /// appids that were rate-limited (either got 429 or were skipped after a 429).
    async fn fetch_tags_batch_pass(
        &self,
        appids: &[u32],
    ) -> (Vec<(u32, Vec<SteamTagInfo>)>, Vec<u32>) {
        let rate_limited = Arc::new(AtomicBool::new(false));
        let rate_limited_appids = Arc::new(StdMutex::new(Vec::<u32>::new()));
        let next_slot = Arc::new(StdMutex::new(Instant::now()));

        let results: Vec<(u32, Vec<SteamTagInfo>)> = stream::iter(appids.iter().copied())
            .map(|appid| {
                let client = self.client.clone();
                let rate_limited = Arc::clone(&rate_limited);
                let rate_limited_appids = Arc::clone(&rate_limited_appids);
                let next_slot = Arc::clone(&next_slot);
                async move {
                    if rate_limited.load(Ordering::Relaxed) {
                        rate_limited_appids.lock().unwrap().push(appid);
                        return (appid, Vec::new());
                    }

                    // Wait for our time slot to respect API rate limits
                    let wait_until = {
                        let mut slot = next_slot.lock().unwrap();
                        let target = *slot;
                        *slot = (*slot).max(Instant::now()) + MIN_REQUEST_INTERVAL;
                        target
                    };
                    tokio::time::sleep_until(wait_until).await;

                    match Self::fetch_tags_impl(&client, appid).await {
                        Ok(tags) => (appid, tags),
                        Err(AppError::StoreApi(_)) => {
                            tracing::warn!(appid, "SteamSpy rate limited, signaling stop");
                            rate_limited.store(true, Ordering::Relaxed);
                            rate_limited_appids.lock().unwrap().push(appid);
                            (appid, Vec::new())
                        }
                        Err(e) => {
                            tracing::warn!(appid, error = %e, "SteamSpy fetch failed");
                            (appid, Vec::new())
                        }
                    }
                }
            })
            .buffer_unordered(STEAMSPY_CONCURRENCY)
            .collect()
            .await;

        let failed = rate_limited_appids.lock().unwrap().clone();
        let with_tags = results.iter().filter(|(_, tags)| !tags.is_empty()).count();
        tracing::info!(
            requested = appids.len(),
            with_tags,
            rate_limited = failed.len(),
            "SteamSpy batch pass complete"
        );
        (results, failed)
    }

    /// Fetch tags for multiple games concurrently with bounded concurrency.
    /// Retries rate-limited requests with exponential backoff.
    /// Returns results for all appids; failed fetches return empty tag lists.
    pub async fn fetch_tags_batch(&self, appids: &[u32]) -> Vec<(u32, Vec<SteamTagInfo>)> {
        let mut all_results: Vec<(u32, Vec<SteamTagInfo>)> = Vec::with_capacity(appids.len());
        let mut pending: Vec<u32> = appids.to_vec();
        let mut backoff = INITIAL_BACKOFF;

        for attempt in 0..=MAX_RETRIES {
            if pending.is_empty() {
                break;
            }

            if attempt > 0 {
                tracing::info!(
                    attempt,
                    remaining = pending.len(),
                    backoff_secs = backoff.as_secs(),
                    "SteamSpy rate limited — waiting before retry"
                );
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(Duration::from_secs(120));
            }

            // Process in chunks with cooldown pauses to proactively avoid rate limits
            let chunks: Vec<Vec<u32>> = pending
                .chunks(COOLDOWN_BATCH_SIZE)
                .map(|c| c.to_vec())
                .collect();
            let chunk_count = chunks.len();
            let mut attempt_failed: Vec<u32> = Vec::new();
            let mut chunks_processed = 0;

            for (i, chunk) in chunks.iter().enumerate() {
                let (results, failed) = self.fetch_tags_batch_pass(chunk).await;
                let failed_set: std::collections::HashSet<u32> = failed.iter().copied().collect();

                for (appid, tags) in results {
                    if !failed_set.contains(&appid) {
                        all_results.push((appid, tags));
                    }
                }

                chunks_processed = i + 1;

                if !failed.is_empty() {
                    attempt_failed.extend(failed);
                    break;
                }

                // Proactive cooldown between chunks (skip after last chunk)
                if i + 1 < chunk_count {
                    tracing::info!(
                        completed = (i + 1) * COOLDOWN_BATCH_SIZE,
                        total = pending.len(),
                        cooldown_secs = COOLDOWN_DURATION.as_secs(),
                        "SteamSpy cooldown pause"
                    );
                    tokio::time::sleep(COOLDOWN_DURATION).await;
                }
            }

            // Any chunks we didn't attempt (broke early) go back to pending
            for chunk in chunks.iter().skip(chunks_processed) {
                attempt_failed.extend(chunk);
            }

            pending = attempt_failed;

            if !pending.is_empty() {
                tracing::warn!(
                    rate_limited = pending.len(),
                    attempt,
                    "SteamSpy: some requests rate limited, will retry"
                );
            }
        }

        // Any still pending after max retries get empty tags
        for appid in &pending {
            tracing::warn!(appid, "SteamSpy: gave up after max retries");
            all_results.push((*appid, Vec::new()));
        }

        all_results
    }

    // ── Richer app data methods (tags + genres + developers + publishers) ──

    /// Fetch richer game data for a single game from SteamSpy.
    #[allow(dead_code)]
    pub async fn fetch_app_data(&self, appid: u32) -> Result<Option<SteamSpyAppData>, AppError> {
        Self::fetch_app_data_impl(&self.client, appid).await
    }

    /// Parse richer data from a SteamSpy response.
    async fn fetch_app_data_impl(
        client: &reqwest::Client,
        appid: u32,
    ) -> Result<Option<SteamSpyAppData>, AppError> {
        let url = format!("{}?request=appdetails&appid={}", STEAMSPY_API_BASE, appid);

        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| sanitize_steamspy_error(e, "appdetails"))?;

        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            tracing::warn!(appid, "SteamSpy rate limited (429)");
            return Err(AppError::StoreApi("SteamSpy rate limited".to_string()));
        }

        if !resp.status().is_success() {
            tracing::warn!(appid, status = %resp.status(), "SteamSpy API error");
            return Ok(None);
        }

        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| sanitize_steamspy_error(e, "appdetails"))?;

        let name = body
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // developer / publisher / genre are comma-separated strings
        let developers = Self::split_csv_field(&body, "developer");
        let publishers = Self::split_csv_field(&body, "publisher");
        let genre_names = Self::split_csv_field(&body, "genre");

        let genres: Vec<GenreInfo> = genre_names
            .into_iter()
            .map(|g| GenreInfo {
                id: g.clone(),
                description: g,
            })
            .collect();

        let tags = match body.get("tags") {
            Some(serde_json::Value::Object(map)) => {
                let mut tag_list: Vec<SteamTagInfo> = map
                    .iter()
                    .filter_map(|(name, votes)| {
                        votes.as_u64().map(|v| SteamTagInfo {
                            name: name.clone(),
                            votes: v as u32,
                        })
                    })
                    .collect();
                tag_list.sort_by(|a, b| b.votes.cmp(&a.votes));
                tag_list
            }
            _ => Vec::new(),
        };

        // Empty name + no tags = invalid/nonexistent appid
        if name.is_empty() && tags.is_empty() {
            return Ok(None);
        }

        Ok(Some(SteamSpyAppData {
            name,
            developers,
            publishers,
            genres,
            tags,
        }))
    }

    /// Split a comma-separated string field from SteamSpy JSON.
    fn split_csv_field(body: &serde_json::Value, field: &str) -> Vec<String> {
        body.get(field)
            .and_then(|v| v.as_str())
            .map(|s| {
                s.split(',')
                    .map(|p| p.trim().to_string())
                    .filter(|p| !p.is_empty())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Run one concurrent pass for richer app data.
    async fn fetch_app_data_batch_pass(
        &self,
        appids: &[u32],
    ) -> (Vec<(u32, Option<SteamSpyAppData>)>, Vec<u32>) {
        let rate_limited = Arc::new(AtomicBool::new(false));
        let rate_limited_appids = Arc::new(StdMutex::new(Vec::<u32>::new()));
        let next_slot = Arc::new(StdMutex::new(Instant::now()));

        let results: Vec<(u32, Option<SteamSpyAppData>)> = stream::iter(appids.iter().copied())
            .map(|appid| {
                let client = self.client.clone();
                let rate_limited = Arc::clone(&rate_limited);
                let rate_limited_appids = Arc::clone(&rate_limited_appids);
                let next_slot = Arc::clone(&next_slot);
                async move {
                    if rate_limited.load(Ordering::Relaxed) {
                        rate_limited_appids.lock().unwrap().push(appid);
                        return (appid, None);
                    }

                    let wait_until = {
                        let mut slot = next_slot.lock().unwrap();
                        let target = *slot;
                        *slot = (*slot).max(Instant::now()) + MIN_REQUEST_INTERVAL;
                        target
                    };
                    tokio::time::sleep_until(wait_until).await;

                    match Self::fetch_app_data_impl(&client, appid).await {
                        Ok(data) => (appid, data),
                        Err(AppError::StoreApi(_)) => {
                            tracing::warn!(appid, "SteamSpy rate limited, signaling stop");
                            rate_limited.store(true, Ordering::Relaxed);
                            rate_limited_appids.lock().unwrap().push(appid);
                            (appid, None)
                        }
                        Err(e) => {
                            tracing::warn!(
                                appid,
                                error = %e,
                                "SteamSpy fetch failed"
                            );
                            (appid, None)
                        }
                    }
                }
            })
            .buffer_unordered(STEAMSPY_CONCURRENCY)
            .collect()
            .await;

        let failed = rate_limited_appids.lock().unwrap().clone();
        let with_data = results.iter().filter(|(_, d)| d.is_some()).count();
        tracing::info!(
            requested = appids.len(),
            with_data,
            rate_limited = failed.len(),
            "SteamSpy app data batch pass complete"
        );
        (results, failed)
    }

    /// Fetch richer app data for multiple games with bounded concurrency.
    /// Retries rate-limited requests with exponential backoff.
    pub async fn fetch_app_data_batch(
        &self,
        appids: &[u32],
    ) -> Vec<(u32, Option<SteamSpyAppData>)> {
        let mut all_results: Vec<(u32, Option<SteamSpyAppData>)> = Vec::with_capacity(appids.len());
        let mut pending: Vec<u32> = appids.to_vec();
        let mut backoff = INITIAL_BACKOFF;

        for attempt in 0..=MAX_RETRIES {
            if pending.is_empty() {
                break;
            }

            if attempt > 0 {
                tracing::info!(
                    attempt,
                    remaining = pending.len(),
                    backoff_secs = backoff.as_secs(),
                    "SteamSpy rate limited — waiting before retry"
                );
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(Duration::from_secs(120));
            }

            let chunks: Vec<Vec<u32>> = pending
                .chunks(COOLDOWN_BATCH_SIZE)
                .map(|c| c.to_vec())
                .collect();
            let chunk_count = chunks.len();
            let mut attempt_failed: Vec<u32> = Vec::new();
            let mut chunks_processed = 0;

            for (i, chunk) in chunks.iter().enumerate() {
                let (results, failed) = self.fetch_app_data_batch_pass(chunk).await;
                let failed_set: std::collections::HashSet<u32> = failed.iter().copied().collect();

                for (appid, data) in results {
                    if !failed_set.contains(&appid) {
                        all_results.push((appid, data));
                    }
                }

                chunks_processed = i + 1;

                if !failed.is_empty() {
                    attempt_failed.extend(failed);
                    break;
                }

                if i + 1 < chunk_count {
                    tracing::info!(
                        completed = (i + 1) * COOLDOWN_BATCH_SIZE,
                        total = pending.len(),
                        cooldown_secs = COOLDOWN_DURATION.as_secs(),
                        "SteamSpy cooldown pause"
                    );
                    tokio::time::sleep(COOLDOWN_DURATION).await;
                }
            }

            for chunk in chunks.iter().skip(chunks_processed) {
                attempt_failed.extend(chunk);
            }

            pending = attempt_failed;

            if !pending.is_empty() {
                tracing::warn!(
                    rate_limited = pending.len(),
                    attempt,
                    "SteamSpy: some requests rate limited, will retry"
                );
            }
        }

        for appid in &pending {
            tracing::warn!(appid, "SteamSpy: gave up after max retries");
            all_results.push((*appid, None));
        }

        all_results
    }
}
