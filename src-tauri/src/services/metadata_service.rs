use std::time::Duration;

use crate::models::metadata::StoreMetadata;
use crate::services::cache_db::CacheDbHandle;
use crate::services::steamspy_client::SteamSpyClient;
use crate::services::store_client::StoreClient;
use crate::utils::error::{AppError, MutexExt};

pub struct MetadataService {
    store_client: StoreClient,
    steamspy_client: SteamSpyClient,
    db: CacheDbHandle,
}

/// Delay between Store API requests during background backfill (~0.67 req/s).
const BACKFILL_DELAY: Duration = Duration::from_millis(1500);

impl MetadataService {
    pub fn new(db: CacheDbHandle) -> Self {
        Self {
            store_client: StoreClient::new(),
            steamspy_client: SteamSpyClient::new(),
            db,
        }
    }

    /// Helper to lock the database, mapping poison errors to AppError.
    fn lock_db(&self) -> Result<std::sync::MutexGuard<'_, crate::services::cache_db::CacheDb>, AppError> {
        self.db.lock_or_err("DB")
    }

    /// Resolve a game_id to its Steam appid (u32). Returns None for non-Steam games.
    fn resolve_steam_appid(&self, game_id: &str) -> Result<Option<u32>, AppError> {
        let db = self.lock_db()?;
        match db.get_game_source(game_id)? {
            Some((source, source_id)) if source == "steam" => {
                Ok(source_id.parse::<u32>().ok())
            }
            _ => Ok(None),
        }
    }

    /// Get metadata for a single game with on-demand Store API enrichment.
    ///
    /// - If fully enriched (has short_description), returns cached data.
    /// - If SteamSpy-only (no short_description), fetches Store API to enrich.
    /// - If not cached at all, does full fetch (Store API + SteamSpy).
    /// - Returns None for non-Steam games.
    pub async fn get_metadata(&self, game_id: &str) -> Result<Option<StoreMetadata>, AppError> {
        // Check cache first
        {
            let db = self.lock_db()?;
            if db.is_metadata_fresh(game_id)? {
                if let Some(cached) = db.get_store_metadata(game_id)? {
                    if cached.short_description.is_some() {
                        // Fully enriched — return as-is
                        return Ok(Some(cached));
                    }
                    // SteamSpy-only data — fall through to enrich from Store API
                }
            }
        }

        // Resolve to Steam appid — non-Steam games have no metadata source yet
        let appid = match self.resolve_steam_appid(game_id)? {
            Some(id) => id,
            None => return Ok(None),
        };

        // Check if we have SteamSpy-only data that needs enrichment
        let existing_tags = {
            let db = self.lock_db()?;
            db.get_store_metadata(game_id)?
                .map(|m| m.steam_tags)
                .unwrap_or_default()
        };

        // Fetch from Store API
        let mut meta = self.store_client.fetch_app_details(appid).await?;

        if let Some(ref mut m) = meta {
            m.game_id = game_id.to_string();

            // If we already have SteamSpy tags, preserve them
            if !existing_tags.is_empty() {
                m.steam_tags = existing_tags;
            } else {
                // No cached tags — fetch from SteamSpy
                match self.steamspy_client.fetch_tags(appid).await {
                    Ok(tags) => {
                        m.steam_tags = tags;
                    }
                    Err(e) => {
                        tracing::warn!(game_id, error = %e, "SteamSpy tags unavailable, continuing without");
                    }
                }
            }

            // If we had SteamSpy-only data, use enrich (UPDATE) to preserve tags.
            // Otherwise use cache (INSERT OR REPLACE) for fresh entries.
            let db = self.lock_db()?;
            if db.is_game_enriched(game_id).unwrap_or(false) {
                // Already enriched somehow (race), just return
            } else if db.get_store_metadata(game_id)?.is_some() {
                // Has SteamSpy-only row — enrich it
                let _ = db.enrich_store_metadata(m);
            } else {
                // No row at all — full insert
                let _ = db.cache_store_metadata(m);
            }
        } else {
            // Store API returned None — try returning SteamSpy-only data if available
            let db = self.lock_db()?;
            if let Some(cached) = db.get_store_metadata(game_id)? {
                return Ok(Some(cached));
            }
        }

        Ok(meta)
    }

    /// Fetch metadata for multiple games using SteamSpy as the primary batch source.
    ///
    /// This avoids the Steam Store API entirely for batch operations, which prevents
    /// rate-limiting. Store API enrichment happens on-demand (get_metadata) or via
    /// background backfill (backfill_store_details).
    pub async fn fetch_library_metadata(
        &self,
        game_ids: &[String],
    ) -> Result<Vec<(String, Option<StoreMetadata>)>, AppError> {
        let mut results: Vec<(String, Option<StoreMetadata>)> = Vec::with_capacity(game_ids.len());
        let mut uncached: Vec<(String, u32)> = Vec::new(); // (game_id, appid) pairs for Steam games

        // Check cache for each
        {
            let db = self.lock_db()?;
            for game_id in game_ids {
                if db.is_metadata_fresh(game_id)? {
                    if let Some(cached) = db.get_store_metadata(game_id)? {
                        results.push((game_id.clone(), Some(cached)));
                        continue;
                    }
                }
                // Resolve to Steam appid for uncached games
                match db.get_game_source(game_id)? {
                    Some((source, source_id)) if source == "steam" => {
                        if let Ok(appid) = source_id.parse::<u32>() {
                            uncached.push((game_id.clone(), appid));
                        } else {
                            results.push((game_id.clone(), None));
                        }
                    }
                    _ => {
                        // Non-Steam game — no metadata source yet
                        results.push((game_id.clone(), None));
                    }
                }
            }
        }

        tracing::info!(
            cached = results.len(),
            uncached = uncached.len(),
            "Metadata batch: cache check complete"
        );

        // Fetch uncached from SteamSpy (primary batch source — no Store API)
        if !uncached.is_empty() {
            let appids: Vec<u32> = uncached.iter().map(|(_, appid)| *appid).collect();

            // Build appid → game_id lookup
            let appid_to_game_id: std::collections::HashMap<u32, &str> = uncached
                .iter()
                .map(|(gid, appid)| (*appid, gid.as_str()))
                .collect();

            tracing::info!(count = appids.len(), "Fetching SteamSpy app data batch");
            let fetched = self.steamspy_client.fetch_app_data_batch(&appids).await;

            // Convert SteamSpyAppData → partial StoreMetadata and cache
            let db = self.lock_db()?;
            for (appid, data) in fetched {
                let game_id = appid_to_game_id
                    .get(&appid)
                    .map(|s| s.to_string())
                    .unwrap_or_default();

                let meta = data.map(|d| StoreMetadata {
                    game_id: game_id.clone(),
                    name: d.name,
                    short_description: None, // Store API-only field
                    header_image_url: None,  // Store API-only field
                    developers: d.developers,
                    publishers: d.publishers,
                    genres: d.genres,
                    categories: Vec::new(),    // Store API-only field
                    screenshots: Vec::new(),   // Store API-only field
                    release_date: None,        // Store API-only field
                    metacritic_score: None,    // Store API-only field
                    metacritic_url: None,      // Store API-only field
                    steam_tags: d.tags,
                });

                if let Some(ref m) = meta {
                    let _ = db.cache_store_metadata(m);
                }
                results.push((game_id, meta));
            }
        }

        Ok(results)
    }

    /// Backfill SteamSpy tags for games that have cached metadata but no tags yet.
    /// This avoids re-fetching from the Store API — only calls SteamSpy.
    pub async fn backfill_steam_tags(&self) -> Result<usize, AppError> {
        let game_ids_to_backfill: Vec<(String, u32)> = {
            let db = self.lock_db()?;
            let game_ids = db.get_game_ids_missing_tags()?;

            // Resolve each game_id to Steam appid
            game_ids
                .into_iter()
                .filter_map(|gid| {
                    match db.get_game_source(&gid) {
                        Ok(Some((source, source_id))) if source == "steam" => {
                            source_id.parse::<u32>().ok().map(|appid| (gid, appid))
                        }
                        _ => None,
                    }
                })
                .collect()
        };

        if game_ids_to_backfill.is_empty() {
            tracing::info!("No games need SteamSpy tag backfill");
            return Ok(0);
        }

        let appids: Vec<u32> = game_ids_to_backfill.iter().map(|(_, a)| *a).collect();
        tracing::info!(count = appids.len(), "Backfilling SteamSpy tags");
        let tag_results = self.steamspy_client.fetch_tags_batch(&appids).await;

        // Build appid → game_id lookup
        let appid_to_game_id: std::collections::HashMap<u32, &str> = game_ids_to_backfill
            .iter()
            .map(|(gid, appid)| (*appid, gid.as_str()))
            .collect();

        let db = self.lock_db()?;

        let mut updated = 0;
        for (appid, tags) in &tag_results {
            if let Some(game_id) = appid_to_game_id.get(appid) {
                if let Err(e) = db.update_steam_tags(game_id, tags) {
                    tracing::warn!(game_id, error = %e, "Failed to update steam_tags");
                } else {
                    updated += 1;
                }
            }
        }

        tracing::info!(updated, total = appids.len(), "SteamSpy tag backfill complete");
        Ok(updated)
    }

    /// Slowly backfill Store API details (descriptions, screenshots, etc.) for games
    /// that only have SteamSpy data. Runs one request every 1.5s to avoid rate limiting.
    /// Stops on rate-limit error (will resume next app launch).
    pub async fn backfill_store_details(&self) -> Result<usize, AppError> {
        let games_to_enrich: Vec<(String, u32)> = {
            let db = self.lock_db()?;
            let game_ids = db.get_games_needing_enrichment()?;

            // Resolve each to Steam appid
            game_ids
                .into_iter()
                .filter_map(|gid| {
                    match db.get_game_source(&gid) {
                        Ok(Some((source, source_id))) if source == "steam" => {
                            source_id.parse::<u32>().ok().map(|appid| (gid, appid))
                        }
                        _ => None,
                    }
                })
                .collect()
        };

        if games_to_enrich.is_empty() {
            tracing::info!("No games need Store API enrichment");
            return Ok(0);
        }

        tracing::info!(count = games_to_enrich.len(), "Starting Store API background enrichment");
        let mut enriched = 0;

        for (game_id, appid) in &games_to_enrich {
            // Slow pace to avoid rate limiting
            tokio::time::sleep(BACKFILL_DELAY).await;

            match self.store_client.fetch_app_details(*appid).await {
                Ok(Some(mut meta)) => {
                    meta.game_id = game_id.clone();

                    // Preserve existing SteamSpy tags — don't overwrite
                    {
                        let db = self.lock_db()?;
                        if let Some(existing) = db.get_store_metadata(game_id)? {
                            meta.steam_tags = existing.steam_tags;
                        }
                        db.enrich_store_metadata(&meta)?;
                    }

                    enriched += 1;
                    if enriched % 25 == 0 {
                        tracing::info!(
                            enriched,
                            total = games_to_enrich.len(),
                            "Store API enrichment progress"
                        );
                    }
                }
                Ok(None) => {
                    // App not found or no data — skip
                    tracing::debug!(game_id, appid, "Store API returned no data, skipping");
                }
                Err(AppError::StoreApi(_)) => {
                    // Rate limited — stop entirely, will resume next launch
                    tracing::warn!(
                        enriched,
                        total = games_to_enrich.len(),
                        "Store API rate limited during enrichment, stopping"
                    );
                    break;
                }
                Err(e) => {
                    tracing::warn!(game_id, error = %e, "Store API enrichment failed, skipping");
                }
            }
        }

        tracing::info!(enriched, total = games_to_enrich.len(), "Store API enrichment complete");
        Ok(enriched)
    }
}
