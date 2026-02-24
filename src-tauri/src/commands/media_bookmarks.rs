use tauri::{AppHandle, Manager, State};

use crate::models::media_bookmark::{
    CreateMediaBookmarkRequest, MediaBookmark, ReorderMediaBookmarksRequest,
    UpdateMediaBookmarkRequest,
};
use crate::services::cache_db::CacheDbHandle;
use crate::utils::error::{AppError, MutexExt};

fn validate_url(url: &str) -> Result<(), AppError> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(AppError::Validation(
            "URL must start with http:// or https://".to_string(),
        ));
    }
    Ok(())
}

/// Detects YouTube playlist-only URLs and rewrites them to auto-play
/// the first video. Fetches the playlist page to extract the first video ID,
/// then returns `watch?v=FIRST&list=PLAYLIST`.
///
/// Falls back to the original URL on any failure.
async fn maybe_rewrite_youtube_playlist(url: &str) -> String {
    // Match youtube.com/playlist?list=PLAYLIST_ID (no video context)
    let playlist_id = match extract_youtube_playlist_id(url) {
        Some(id) => id,
        None => return url.to_string(),
    };

    tracing::debug!(playlist_id = %playlist_id, "Detected YouTube playlist URL, fetching first video");

    match fetch_first_video_id(&playlist_id).await {
        Some(video_id) => {
            let rewritten = format!(
                "https://www.youtube.com/watch?v={}&list={}",
                video_id, playlist_id
            );
            tracing::info!(
                original = %url,
                rewritten = %rewritten,
                "Rewrote YouTube playlist URL for autoplay"
            );
            rewritten
        }
        None => {
            tracing::warn!("Could not extract first video from playlist, opening original URL");
            url.to_string()
        }
    }
}

/// Returns the playlist ID if this is a YouTube playlist-only URL
/// (i.e. /playlist?list=... without a /watch?v= context).
fn extract_youtube_playlist_id(url: &str) -> Option<String> {
    let url_lower = url.to_lowercase();

    // Must be a YouTube domain
    let is_youtube = url_lower.contains("youtube.com/") || url_lower.contains("youtu.be/");
    if !is_youtube {
        return None;
    }

    // Must be a /playlist path (not /watch with a list param — that already auto-plays)
    if !url_lower.contains("/playlist") {
        return None;
    }

    // Extract list= parameter
    let query = url.split('?').nth(1)?;
    for param in query.split('&') {
        let mut kv = param.splitn(2, '=');
        if kv.next()? == "list" {
            let id = kv.next()?.to_string();
            if !id.is_empty() {
                return Some(id);
            }
        }
    }
    None
}

/// Fetches the YouTube playlist page and extracts the first video ID
/// from the page's embedded JSON data.
async fn fetch_first_video_id(playlist_id: &str) -> Option<String> {
    let page_url = format!("https://www.youtube.com/playlist?list={}", playlist_id);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .ok()?;

    let response = client
        .get(&page_url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .ok()?;

    let body = response.text().await.ok()?;

    // YouTube embeds video IDs in the playlist page as JSON:
    // "playlistVideoRenderer":{"videoId":"dQw4w9WgXcQ",...}
    // We find the first occurrence.
    let marker = r#""videoId":""#;
    let start = body.find(marker)? + marker.len();
    let end = body[start..].find('"')? + start;
    let video_id = &body[start..end];

    // Sanity check: YouTube video IDs are 11 characters, alphanumeric + - + _
    if video_id.len() == 11
        && video_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        Some(video_id.to_string())
    } else {
        None
    }
}

#[tauri::command]
pub async fn get_media_bookmarks(
    db: State<'_, CacheDbHandle>,
) -> Result<Vec<MediaBookmark>, AppError> {
    let db = db.lock_or_err("DB")?;
    db.get_media_bookmarks()
}

#[tauri::command]
pub async fn add_media_bookmark(
    request: CreateMediaBookmarkRequest,
    db: State<'_, CacheDbHandle>,
) -> Result<MediaBookmark, AppError> {
    validate_url(&request.url)?;
    tracing::info!(title = %request.title, "Adding media bookmark");
    let db = db.lock_or_err("DB")?;
    db.add_media_bookmark(&request.title, &request.url, request.icon.as_deref())
}

#[tauri::command]
pub async fn update_media_bookmark(
    request: UpdateMediaBookmarkRequest,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    validate_url(&request.url)?;
    tracing::info!(id = request.id, title = %request.title, "Updating media bookmark");
    let db = db.lock_or_err("DB")?;
    db.update_media_bookmark(
        request.id,
        &request.title,
        &request.url,
        request.icon.as_deref(),
    )
}

#[tauri::command]
pub async fn delete_media_bookmark(id: i64, db: State<'_, CacheDbHandle>) -> Result<(), AppError> {
    tracing::info!(id = id, "Deleting media bookmark");
    let db = db.lock_or_err("DB")?;
    db.delete_media_bookmark(id)
}

#[tauri::command]
pub async fn reorder_media_bookmarks(
    request: ReorderMediaBookmarksRequest,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    let db = db.lock_or_err("DB")?;
    db.reorder_media_bookmarks(&request.bookmark_ids)
}

#[tauri::command]
pub async fn open_media_bookmark(app: AppHandle, url: String) -> Result<(), AppError> {
    validate_url(&url)?;

    // Rewrite YouTube playlist URLs for autoplay
    let final_url = maybe_rewrite_youtube_playlist(&url).await;

    tracing::info!(url = %final_url, "Opening media bookmark in browser");
    open::that(&final_url)?;

    // Re-focus the overlay window so the browser doesn't steal focus.
    // Small delay lets the OS finish processing the URL open before we reclaim.
    let app_clone = app.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        if let Some(win) = app_clone.get_webview_window("overlay") {
            let _ = win.set_focus();
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_youtube_playlist_id() {
        assert_eq!(
            extract_youtube_playlist_id(
                "https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"
            ),
            Some("PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf".to_string())
        );
        assert_eq!(
            extract_youtube_playlist_id("https://youtube.com/playlist?list=PLtest123"),
            Some("PLtest123".to_string())
        );
        // Watch URLs with list param should NOT match (they already auto-play)
        assert_eq!(
            extract_youtube_playlist_id("https://www.youtube.com/watch?v=abc123&list=PLtest"),
            None
        );
        // Non-YouTube
        assert_eq!(
            extract_youtube_playlist_id("https://example.com/playlist?list=PLtest"),
            None
        );
        // No list param
        assert_eq!(
            extract_youtube_playlist_id("https://www.youtube.com/playlist"),
            None
        );
    }

    #[test]
    fn test_extract_youtube_playlist_id_with_extra_params() {
        assert_eq!(
            extract_youtube_playlist_id("https://www.youtube.com/playlist?list=PLabc&si=xyz123"),
            Some("PLabc".to_string())
        );
    }
}
