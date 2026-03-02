use crate::services::cache_db::{CacheDbHandle, GameImageRow};
use crate::services::credential_store;
use crate::services::steamgriddb::{fetch_gog_image, SgdbImageOption, SteamGridDbClient};
use crate::utils::error::{AppError, MutexExt};

pub struct CoverArtService {
    db: CacheDbHandle,
}

impl CoverArtService {
    pub fn new(db: CacheDbHandle) -> Self {
        Self { db }
    }

    /// Resolve a cover art image URL for a game.
    /// Checks for user-selected custom art first (works for ALL games, including Steam).
    /// Returns `"local:{path}"` for locally-stored art, a URL for remote art, or None.
    pub async fn resolve_image(
        &self,
        game_id: &str,
        image_type: &str,
    ) -> Result<Option<String>, AppError> {
        // 1. Check DB cache — prioritize user-selected / locally-stored art
        {
            let db = self.db.lock_or_err("DB")?;
            if let Some((url, local_path)) = db.get_game_image_with_local(game_id, image_type)? {
                if let Some(lp) = local_path {
                    return Ok(Some(format!("local:{}", lp)));
                }
                if !url.is_empty() {
                    return Ok(Some(url));
                }
            }
        }

        // 2. Look up game source info
        let (source, source_id, name) = {
            let db = self.db.lock_or_err("DB")?;
            match db.get_game_info(game_id)? {
                Some(info) => info,
                None => return Ok(None),
            }
        };

        // 3. Steam games without custom art → return None (frontend handles CDN)
        if source == "steam" {
            return Ok(None);
        }

        // 4. Don't overwrite user-selected images during auto-resolve
        {
            let db = self.db.lock_or_err("DB")?;
            if db.is_user_selected_image(game_id, image_type)? {
                return db.get_game_image(game_id, image_type);
            }
        }

        // 5. For GOG games, try GOG public API first (no key needed)
        if source == "gog" {
            if let Ok(Some(url)) = fetch_gog_image(&source_id).await {
                let db = self.db.lock_or_err("DB")?;
                db.cache_game_image(game_id, image_type, &url, "gog_api", false)?;
                return Ok(Some(url));
            }
        }

        // 6. Try SteamGridDB if API key is configured
        if let Ok(Some(api_key)) = credential_store::load_sgdb_api_key() {
            let client = SteamGridDbClient::new(api_key)?;
            if let Ok(Some(sgdb_id)) = client.search_game(&name).await {
                let image_url = match image_type {
                    // "grid" displays landscape on cards, use hero images
                    "grid" | "hero" => client.fetch_hero_url(sgdb_id).await,
                    "logo" => client.fetch_logo_url(sgdb_id).await,
                    _ => client.fetch_hero_url(sgdb_id).await,
                };
                if let Ok(Some(url)) = image_url {
                    let db = self.db.lock_or_err("DB")?;
                    db.cache_game_image(game_id, image_type, &url, "steamgriddb", false)?;
                    return Ok(Some(url));
                }
            }
        }

        Ok(None)
    }

    /// Get multiple cover art options from SteamGridDB for user to choose from.
    /// If `search_query` is provided, uses that for the SGDB search instead of the game name.
    pub async fn get_image_options(
        &self,
        game_id: &str,
        image_type: &str,
        limit: usize,
        page: u32,
        search_query: Option<&str>,
    ) -> Result<Vec<SgdbImageOption>, AppError> {
        let (_source, _source_id, name) = {
            let db = self.db.lock_or_err("DB")?;
            match db.get_game_info(game_id)? {
                Some(info) => info,
                None => return Err(AppError::NotFound(format!("Game {} not found", game_id))),
            }
        };

        let api_key = credential_store::load_sgdb_api_key()?.ok_or_else(|| {
            AppError::Credential("SteamGridDB API key not configured".to_string())
        })?;

        let client = SteamGridDbClient::new(api_key)?;
        let search_term = search_query.unwrap_or(&name);
        let sgdb_id = client.search_game(search_term).await?.ok_or_else(|| {
            AppError::NotFound(format!("No SteamGridDB results for '{}'", search_term))
        })?;

        match image_type {
            // "grid" picker: return portrait grid images — user crops to landscape in the UI
            "grid" => client.fetch_grid_options(sgdb_id, limit, page).await,
            "hero" => client.fetch_hero_options(sgdb_id, limit, page).await,
            "logo" => client.fetch_logo_options(sgdb_id, limit, page).await,
            _ => client.fetch_hero_options(sgdb_id, limit, page).await,
        }
    }

    /// User explicitly selects a cover art image from SteamGridDB.
    /// Stores the remote URL with user_selected = true.
    pub fn set_user_image(
        &self,
        game_id: &str,
        image_type: &str,
        image_url: &str,
    ) -> Result<(), AppError> {
        let db = self.db.lock_or_err("DB")?;
        db.cache_game_image(game_id, image_type, image_url, "steamgriddb", true)?;
        Ok(())
    }

    /// Store a locally-cropped custom art image in the database.
    pub fn set_user_local_image(
        &self,
        game_id: &str,
        image_type: &str,
        local_path: &str,
    ) -> Result<(), AppError> {
        let db = self.db.lock_or_err("DB")?;
        db.cache_game_image_local(game_id, image_type, local_path, "custom_upload", true)?;
        Ok(())
    }

    /// Remove custom art for a game+type. Deletes the DB row.
    /// Returns the local_path (if any) so the caller can delete the file.
    pub fn remove_custom_image(
        &self,
        game_id: &str,
        image_type: &str,
    ) -> Result<Option<String>, AppError> {
        let db = self.db.lock_or_err("DB")?;
        let local_path = db.get_game_image_local_path(game_id, image_type)?;
        db.delete_game_image(game_id, image_type)?;
        Ok(local_path)
    }

    /// Get all image records for a game (for the Art Management Menu).
    /// Returns `(image_type, image_url, local_path, user_selected)`.
    pub fn get_game_art_info(&self, game_id: &str) -> Result<Vec<GameImageRow>, AppError> {
        let db = self.db.lock_or_err("DB")?;
        db.get_all_game_images(game_id)
    }

    /// Backfill missing cover art for non-Steam games.
    /// Returns the number of images successfully fetched.
    pub async fn backfill_missing(&self, limit: usize) -> Result<usize, AppError> {
        let games = {
            let db = self.db.lock_or_err("DB")?;
            db.get_games_missing_images()?
        };

        let total = games.len().min(limit);
        if total == 0 {
            return Ok(0);
        }

        tracing::info!(count = total, "Backfilling cover art for non-Steam games");
        let mut found = 0;
        let mut not_found = 0;
        let mut errors = 0;

        for (i, (game_id, _source, _source_id, _name)) in games.into_iter().take(limit).enumerate()
        {
            if i > 0 {
                SteamGridDbClient::batch_delay().await;
            }

            match self.resolve_image(&game_id, "grid").await {
                Ok(Some(_)) => {
                    found += 1;
                }
                Ok(None) => {
                    not_found += 1;
                }
                Err(AppError::StoreApi(_)) => {
                    tracing::warn!("Rate limited, stopping backfill at {}/{}", i, total);
                    break;
                }
                Err(_) => {
                    errors += 1;
                }
            }
        }

        tracing::info!(
            found,
            not_found,
            errors,
            total,
            "Cover art backfill complete"
        );
        Ok(found)
    }
}
