use std::path::{Path, PathBuf};

use chrono::DateTime;
use image::{DynamicImage, GenericImageView, ImageFormat};

use crate::models::assistant::{CellOffset, SpriteCropOffsets, SpriteInfo, SpriteSource};
use crate::utils::error::AppError;

pub const GRID_COLS: u32 = 4;
pub const GRID_ROWS: u32 = 2;
pub const EXPECTED_CELLS: usize = (GRID_COLS * GRID_ROWS) as usize;

/// Get the sprites directory path from the app data directory.
pub fn sprites_dir(app_data: &Path) -> PathBuf {
    app_data.join("sprites")
}

/// Ensure the sprites directory exists.
pub fn ensure_sprites_dir(app_data: &Path) -> Result<PathBuf, AppError> {
    let dir = sprites_dir(app_data);
    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

/// Names of all pre-built sprites that ship with the app.
pub const PREBUILT_SPRITE_NAMES: &[&str] = &[
    "prebuilt-default",
    "prebuilt-pixel",
    "prebuilt-anime",
    "prebuilt-cartoon",
    "prebuilt-painterly",
];

/// Copy pre-built sprite PNGs from the bundled resources directory to the user's sprites directory.
/// Skips files that already exist (won't overwrite user modifications) and silently ignores
/// missing source files (handles dev builds without assets).
pub fn copy_prebuilt_sprites(resource_dir: &Path, sprites_dir: &Path) -> Result<(), AppError> {
    let src_dir = resource_dir.join("resources").join("sprites");
    for name in PREBUILT_SPRITE_NAMES {
        let filename = format!("{}.png", name);
        let src = src_dir.join(&filename);
        let dst = sprites_dir.join(&filename);
        if src.exists() && !dst.exists() {
            std::fs::copy(&src, &dst)?;
            tracing::info!(filename = %filename, "Copied pre-built sprite");
        }
    }
    Ok(())
}

/// Derive display name from sprite filename by stripping the source prefix
/// and replacing dashes with spaces, then titlecasing.
/// "prebuilt-default.png" → "Default"
/// "generated-abc123.png" → "Abc123"
/// "uploaded-my-cool-sprite.png" → "My cool sprite"
pub fn display_name_from_filename(filename: &str) -> String {
    let stem = filename.trim_end_matches(".png");
    let rest = stem
        .strip_prefix("prebuilt-")
        .or_else(|| stem.strip_prefix("generated-"))
        .or_else(|| stem.strip_prefix("uploaded-"))
        .unwrap_or(stem);
    titlecase(&rest.replace('-', " "))
}

fn titlecase(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

/// Extract the source prefix from a filename (e.g. "generated-", "uploaded-").
/// Returns empty string for unknown prefixes.
fn source_prefix(filename: &str) -> &str {
    for prefix in &["prebuilt-", "generated-", "uploaded-"] {
        if filename.starts_with(prefix) {
            return prefix;
        }
    }
    ""
}

/// Slugify a display name for use as a filename component.
/// Lowercases, replaces non-alphanumeric chars with '-', collapses consecutive '-', trims '-'.
pub fn slugify_display_name(name: &str) -> String {
    let slug: String = name
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    // Collapse consecutive dashes and trim
    let mut result = String::with_capacity(slug.len());
    let mut prev_dash = false;
    for c in slug.chars() {
        if c == '-' {
            if !prev_dash && !result.is_empty() {
                result.push('-');
            }
            prev_dash = true;
        } else {
            result.push(c);
            prev_dash = false;
        }
    }
    // Trim trailing dash
    if result.ends_with('-') {
        result.pop();
    }
    result
}

/// Rename a sprite file and its crop sidecar. Returns the new filename.
/// Rejects prebuilt sprites. Preserves source prefix (generated-/uploaded-).
pub fn rename_sprite(
    sprites_dir: &Path,
    old_filename: &str,
    new_display_name: &str,
) -> Result<String, AppError> {
    // Reject prebuilt
    if old_filename.starts_with("prebuilt-") {
        return Err(AppError::Validation(
            "Cannot rename pre-built sprites".into(),
        ));
    }

    let trimmed = new_display_name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("Name cannot be empty".into()));
    }

    let slug = slugify_display_name(trimmed);
    if slug.is_empty() {
        return Err(AppError::Validation(
            "Name must contain at least one letter or number".into(),
        ));
    }

    // Build new filename preserving source prefix
    let prefix = source_prefix(old_filename);
    let new_filename = format!("{}{}.png", prefix, slug);

    // No-op if unchanged
    if new_filename == old_filename {
        return Ok(new_filename);
    }

    // Check destination doesn't already exist
    let new_path = sprites_dir.join(&new_filename);
    if new_path.exists() {
        return Err(AppError::Validation(
            "A sprite with that name already exists".into(),
        ));
    }

    // Rename the PNG
    let old_path = sprites_dir.join(old_filename);
    if !old_path.exists() {
        return Err(AppError::NotFound(format!(
            "Sprite not found: {}",
            old_filename
        )));
    }
    std::fs::rename(&old_path, &new_path)?;

    // Rename crop sidecar if it exists
    let old_sidecar = sprites_dir.join(format!("{}.crops.json", old_filename));
    if old_sidecar.exists() {
        let new_sidecar = sprites_dir.join(format!("{}.crops.json", new_filename));
        std::fs::rename(&old_sidecar, &new_sidecar)?;
    }

    tracing::info!(
        old = old_filename,
        new = new_filename.as_str(),
        "Sprite renamed"
    );
    Ok(new_filename)
}

/// Build a SpriteInfo for a single file in the sprites directory.
pub fn get_sprite_info(sprites_dir: &Path, filename: &str) -> Result<SpriteInfo, AppError> {
    let path = sprites_dir.join(filename);
    if !path.exists() {
        return Err(AppError::NotFound(format!(
            "Sprite not found: {}",
            filename
        )));
    }
    let metadata = std::fs::metadata(&path)?;
    let created_at = metadata
        .modified()
        .ok()
        .map(|t| {
            let dt: DateTime<chrono::Utc> = t.into();
            dt.format("%Y-%m-%d %H:%M:%S").to_string()
        })
        .unwrap_or_default();

    Ok(SpriteInfo {
        display_name: display_name_from_filename(filename),
        source: source_from_filename(filename),
        file_size_bytes: metadata.len(),
        created_at,
        filename: filename.to_string(),
    })
}

/// Determine sprite source from filename prefix.
pub fn source_from_filename(filename: &str) -> SpriteSource {
    if filename.starts_with("prebuilt-") {
        SpriteSource::Prebuilt
    } else if filename.starts_with("generated-") {
        SpriteSource::Generated
    } else {
        // Uploaded or unknown prefix — treat as user-uploaded
        SpriteSource::Uploaded
    }
}

/// Scan the sprites directory and return metadata for each sprite PNG.
pub fn list_sprites(sprites_dir: &Path) -> Result<Vec<SpriteInfo>, AppError> {
    if !sprites_dir.exists() {
        return Ok(Vec::new());
    }

    let mut sprites = Vec::new();
    for entry in std::fs::read_dir(sprites_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("png") {
            continue;
        }
        let filename = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        // Skip crop offset sidecars
        if filename.ends_with(".crops.json") {
            continue;
        }

        let metadata = std::fs::metadata(&path)?;
        let created_at = metadata
            .modified()
            .ok()
            .map(|t| {
                let dt: DateTime<chrono::Utc> = t.into();
                dt.format("%Y-%m-%d %H:%M:%S").to_string()
            })
            .unwrap_or_default();

        sprites.push(SpriteInfo {
            display_name: display_name_from_filename(&filename),
            source: source_from_filename(&filename),
            file_size_bytes: metadata.len(),
            created_at,
            filename,
        });
    }

    // Sort: prebuilt first, then by filename
    sprites.sort_by(|a, b| {
        let a_pre = matches!(a.source, SpriteSource::Prebuilt);
        let b_pre = matches!(b.source, SpriteSource::Prebuilt);
        b_pre.cmp(&a_pre).then_with(|| a.filename.cmp(&b.filename))
    });

    Ok(sprites)
}

/// Save sprite bytes to the sprites directory. Returns the SpriteInfo.
pub fn save_sprite(
    sprites_dir: &Path,
    filename: &str,
    data: &[u8],
) -> Result<SpriteInfo, AppError> {
    // Validate it's a loadable image
    image::load_from_memory(data)
        .map_err(|e| AppError::Validation(format!("Invalid image data: {}", e)))?;

    let path = sprites_dir.join(filename);
    std::fs::write(&path, data)?;

    let metadata = std::fs::metadata(&path)?;
    let created_at = metadata
        .modified()
        .ok()
        .map(|t| {
            let dt: DateTime<chrono::Utc> = t.into();
            dt.format("%Y-%m-%d %H:%M:%S").to_string()
        })
        .unwrap_or_default();

    Ok(SpriteInfo {
        display_name: display_name_from_filename(filename),
        source: source_from_filename(filename),
        file_size_bytes: metadata.len(),
        created_at,
        filename: filename.to_string(),
    })
}

/// Delete a sprite file and its crop sidecar. Returns error if prebuilt.
pub fn delete_sprite(sprites_dir: &Path, filename: &str) -> Result<(), AppError> {
    if filename.starts_with("prebuilt-") {
        return Err(AppError::Validation(
            "Cannot delete pre-built sprites".into(),
        ));
    }

    let path = sprites_dir.join(filename);
    if !path.exists() {
        return Err(AppError::NotFound(format!(
            "Sprite not found: {}",
            filename
        )));
    }
    std::fs::remove_file(&path)?;

    // Also remove crop sidecar if present
    let sidecar = sprites_dir.join(format!("{}.crops.json", filename));
    if sidecar.exists() {
        let _ = std::fs::remove_file(&sidecar);
    }

    Ok(())
}

/// Read the full sprite sheet as a base64-encoded data URL.
pub fn read_sprite_as_data_url(sprites_dir: &Path, filename: &str) -> Result<String, AppError> {
    let path = sprites_dir.join(filename);
    if !path.exists() {
        return Err(AppError::NotFound(format!(
            "Sprite not found: {}",
            filename
        )));
    }
    let bytes = std::fs::read(&path)?;
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Read a single expression frame from a sprite sheet, returning base64 PNG.
#[allow(dead_code)] // Phase C: will be used by expression engine commands
pub fn read_sprite_frame(
    sprites_dir: &Path,
    filename: &str,
    expression_index: u8,
    crop_offset: &CellOffset,
) -> Result<String, AppError> {
    if expression_index as usize >= EXPECTED_CELLS {
        return Err(AppError::Validation(format!(
            "Expression index {} out of range (0-7)",
            expression_index
        )));
    }

    let path = sprites_dir.join(filename);
    if !path.exists() {
        return Err(AppError::NotFound(format!(
            "Sprite not found: {}",
            filename
        )));
    }

    let img = image::open(&path)
        .map_err(|e| AppError::Validation(format!("Failed to load sprite: {}", e)))?;

    let frame = extract_frame(&img, expression_index, crop_offset)?;

    // Encode frame as PNG bytes
    let mut buf = std::io::Cursor::new(Vec::new());
    frame
        .write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| AppError::Validation(format!("Failed to encode frame: {}", e)))?;

    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buf.into_inner());
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Extract a single frame from a sprite sheet, applying crop offset.
#[allow(dead_code)] // Phase C: will be used by expression engine commands
fn extract_frame(
    sheet: &DynamicImage,
    expression_index: u8,
    crop_offset: &CellOffset,
) -> Result<DynamicImage, AppError> {
    let (w, h) = sheet.dimensions();
    let cell_w = w / GRID_COLS;
    let cell_h = h / GRID_ROWS;
    let col = (expression_index as u32) % GRID_COLS;
    let row = (expression_index as u32) / GRID_COLS;

    // Base position + crop offset, clamped to sheet bounds
    let x = ((col * cell_w) as i32 + crop_offset.x)
        .max(0)
        .min((w - cell_w) as i32) as u32;
    let y = ((row * cell_h) as i32 + crop_offset.y)
        .max(0)
        .min((h - cell_h) as i32) as u32;

    Ok(sheet.crop_imm(x, y, cell_w, cell_h))
}

/// Validate a sprite image: must be loadable as PNG and have reasonable dimensions.
pub fn validate_sprite(data: &[u8]) -> Result<(u32, u32), AppError> {
    let img = image::load_from_memory(data)
        .map_err(|e| AppError::Validation(format!("Invalid image: {}", e)))?;

    let (w, h) = img.dimensions();

    // Minimum: at least 4 columns × 2 rows of 64px each
    if w < 256 || h < 128 {
        return Err(AppError::Validation(format!(
            "Image too small ({}×{}). Minimum 256×128 pixels.",
            w, h
        )));
    }

    Ok((w, h))
}

/// Save crop offsets to a JSON sidecar file.
pub fn save_crop_offsets(
    sprites_dir: &Path,
    filename: &str,
    offsets: &SpriteCropOffsets,
) -> Result<(), AppError> {
    if offsets.cells.len() != EXPECTED_CELLS {
        return Err(AppError::Validation(format!(
            "Expected {} cell offsets, got {}",
            EXPECTED_CELLS,
            offsets.cells.len()
        )));
    }

    let sidecar_path = sprites_dir.join(format!("{}.crops.json", filename));
    let json = serde_json::to_string_pretty(offsets)
        .map_err(|e| AppError::Validation(format!("Failed to serialize crop offsets: {}", e)))?;
    std::fs::write(sidecar_path, json)?;
    Ok(())
}

/// Load crop offsets from a JSON sidecar file. Returns defaults if not found.
#[allow(dead_code)] // Phase C: will be used by expression engine commands
pub fn load_crop_offsets(sprites_dir: &Path, filename: &str) -> SpriteCropOffsets {
    let sidecar_path = sprites_dir.join(format!("{}.crops.json", filename));
    if !sidecar_path.exists() {
        return SpriteCropOffsets::default();
    }

    std::fs::read_to_string(&sidecar_path)
        .ok()
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default()
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};
    use std::fs;
    use tempfile::TempDir;

    /// Create a test sprite sheet with distinct colors per cell.
    fn create_test_sheet(width: u32, height: u32) -> DynamicImage {
        let colors: [Rgba<u8>; 8] = [
            Rgba([255, 0, 0, 255]),   // neutral - red
            Rgba([0, 255, 0, 255]),   // speaking - green
            Rgba([0, 0, 255, 255]),   // listening - blue
            Rgba([255, 255, 0, 255]), // sleepy - yellow
            Rgba([255, 0, 255, 255]), // happy - magenta
            Rgba([0, 255, 255, 255]), // sad - cyan
            Rgba([128, 128, 0, 255]), // interested - olive
            Rgba([128, 0, 128, 255]), // bored - purple
        ];

        let cell_w = width / GRID_COLS;
        let cell_h = height / GRID_ROWS;

        let img = ImageBuffer::from_fn(width, height, |x, y| {
            let col = x / cell_w;
            let row = y / cell_h;
            let idx = (row * GRID_COLS + col) as usize;
            colors[idx.min(7)]
        });

        DynamicImage::ImageRgba8(img)
    }

    fn save_test_sheet(dir: &Path, filename: &str, width: u32, height: u32) -> Vec<u8> {
        let img = create_test_sheet(width, height);
        let path = dir.join(filename);
        img.save_with_format(&path, ImageFormat::Png).unwrap();
        fs::read(&path).unwrap()
    }

    #[test]
    fn test_display_name_from_filename() {
        assert_eq!(
            display_name_from_filename("prebuilt-default.png"),
            "Default"
        );
        assert_eq!(display_name_from_filename("prebuilt-pixel.png"), "Pixel");
        assert_eq!(
            display_name_from_filename("generated-abcd1234-5678.png"),
            "Abcd1234 5678"
        );
        assert_eq!(
            display_name_from_filename("uploaded-abcd1234-5678.png"),
            "Abcd1234 5678"
        );
        // Renamed sprites
        assert_eq!(
            display_name_from_filename("generated-my-cool-sprite.png"),
            "My cool sprite"
        );
        assert_eq!(display_name_from_filename("custom.png"), "Custom");
    }

    #[test]
    fn test_source_from_filename() {
        assert!(matches!(
            source_from_filename("prebuilt-default.png"),
            SpriteSource::Prebuilt
        ));
        assert!(matches!(
            source_from_filename("generated-abc.png"),
            SpriteSource::Generated
        ));
        assert!(matches!(
            source_from_filename("uploaded-abc.png"),
            SpriteSource::Uploaded
        ));
        assert!(matches!(
            source_from_filename("other.png"),
            SpriteSource::Uploaded
        ));
    }

    #[test]
    fn test_ensure_sprites_dir_creates_directory() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();
        assert!(dir.exists());
        assert!(dir.is_dir());
    }

    #[test]
    fn test_list_sprites_empty() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();
        let result = list_sprites(&dir).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_list_sprites_with_files() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();

        save_test_sheet(&dir, "prebuilt-default.png", 2048, 1024);
        save_test_sheet(&dir, "generated-abc123.png", 2048, 1024);

        let result = list_sprites(&dir).unwrap();
        assert_eq!(result.len(), 2);
        // Prebuilt should come first
        assert_eq!(result[0].filename, "prebuilt-default.png");
        assert_eq!(result[1].filename, "generated-abc123.png");
    }

    #[test]
    fn test_list_sprites_ignores_non_png() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();

        save_test_sheet(&dir, "prebuilt-default.png", 2048, 1024);
        fs::write(dir.join("readme.txt"), "hello").unwrap();
        fs::write(dir.join("test.crops.json"), "{}").unwrap();

        let result = list_sprites(&dir).unwrap();
        assert_eq!(result.len(), 1);
    }

    #[test]
    fn test_save_and_read_sprite() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();

        let img = create_test_sheet(2048, 1024);
        let mut buf = std::io::Cursor::new(Vec::new());
        img.write_to(&mut buf, ImageFormat::Png).unwrap();

        let info = save_sprite(&dir, "uploaded-test.png", buf.get_ref()).unwrap();
        assert_eq!(info.filename, "uploaded-test.png");
        assert!(matches!(info.source, SpriteSource::Uploaded));
        assert!(info.file_size_bytes > 0);

        // Read it back as data URL
        let data_url = read_sprite_as_data_url(&dir, "uploaded-test.png").unwrap();
        assert!(data_url.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn test_delete_sprite() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();

        save_test_sheet(&dir, "uploaded-test.png", 2048, 1024);
        // Also write a crop sidecar
        fs::write(dir.join("uploaded-test.png.crops.json"), "{}").unwrap();

        delete_sprite(&dir, "uploaded-test.png").unwrap();
        assert!(!dir.join("uploaded-test.png").exists());
        assert!(!dir.join("uploaded-test.png.crops.json").exists());
    }

    #[test]
    fn test_delete_prebuilt_rejected() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();
        save_test_sheet(&dir, "prebuilt-default.png", 2048, 1024);

        let result = delete_sprite(&dir, "prebuilt-default.png");
        assert!(result.is_err());
        assert!(dir.join("prebuilt-default.png").exists());
    }

    #[test]
    fn test_delete_nonexistent_sprite() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();
        let result = delete_sprite(&dir, "nonexistent.png");
        assert!(result.is_err());
    }

    #[test]
    fn test_extract_frame_standard_sheet() {
        let sheet = create_test_sheet(2048, 1024);

        // Neutral (index 0) should be red
        let frame = extract_frame(&sheet, 0, &CellOffset { x: 0, y: 0 }).unwrap();
        assert_eq!(frame.dimensions(), (512, 512));
        let pixel = frame.get_pixel(256, 256);
        assert_eq!(pixel, Rgba([255, 0, 0, 255]));

        // Speaking (index 1) should be green
        let frame = extract_frame(&sheet, 1, &CellOffset { x: 0, y: 0 }).unwrap();
        let pixel = frame.get_pixel(256, 256);
        assert_eq!(pixel, Rgba([0, 255, 0, 255]));

        // Happy (index 4) should be magenta
        let frame = extract_frame(&sheet, 4, &CellOffset { x: 0, y: 0 }).unwrap();
        let pixel = frame.get_pixel(256, 256);
        assert_eq!(pixel, Rgba([255, 0, 255, 255]));

        // Bored (index 7) should be purple
        let frame = extract_frame(&sheet, 7, &CellOffset { x: 0, y: 0 }).unwrap();
        let pixel = frame.get_pixel(256, 256);
        assert_eq!(pixel, Rgba([128, 0, 128, 255]));
    }

    #[test]
    fn test_extract_frame_non_standard_dimensions() {
        // 1024×512 — should still work, producing 256×256 cells
        let sheet = create_test_sheet(1024, 512);
        let frame = extract_frame(&sheet, 0, &CellOffset { x: 0, y: 0 }).unwrap();
        assert_eq!(frame.dimensions(), (256, 256));
    }

    #[test]
    fn test_crop_offset_shifts_correctly() {
        let sheet = create_test_sheet(2048, 1024);
        // Shift neutral cell 10px right — should still extract a 512×512 frame
        let frame = extract_frame(&sheet, 0, &CellOffset { x: 10, y: 0 }).unwrap();
        assert_eq!(frame.dimensions(), (512, 512));
    }

    #[test]
    fn test_crop_offset_clamped_to_bounds() {
        let sheet = create_test_sheet(2048, 1024);
        // Large positive offset — should clamp to max valid position
        let frame = extract_frame(&sheet, 0, &CellOffset { x: 9999, y: 9999 }).unwrap();
        assert_eq!(frame.dimensions(), (512, 512));

        // Large negative offset — should clamp to 0,0
        let frame = extract_frame(&sheet, 7, &CellOffset { x: -9999, y: -9999 }).unwrap();
        assert_eq!(frame.dimensions(), (512, 512));
    }

    #[test]
    fn test_validate_sprite_valid() {
        let img = create_test_sheet(2048, 1024);
        let mut buf = std::io::Cursor::new(Vec::new());
        img.write_to(&mut buf, ImageFormat::Png).unwrap();
        let (w, h) = validate_sprite(buf.get_ref()).unwrap();
        assert_eq!((w, h), (2048, 1024));
    }

    #[test]
    fn test_validate_sprite_too_small() {
        let img = ImageBuffer::from_pixel(100, 50, Rgba([0u8, 0, 0, 255]));
        let dyn_img = DynamicImage::ImageRgba8(img);
        let mut buf = std::io::Cursor::new(Vec::new());
        dyn_img.write_to(&mut buf, ImageFormat::Png).unwrap();
        let result = validate_sprite(buf.get_ref());
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_sprite_invalid_data() {
        let result = validate_sprite(b"not an image");
        assert!(result.is_err());
    }

    #[test]
    fn test_save_and_load_crop_offsets() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();

        let offsets = SpriteCropOffsets {
            version: 1,
            cells: vec![
                CellOffset { x: 5, y: -3 },
                CellOffset { x: 0, y: 0 },
                CellOffset { x: 0, y: 0 },
                CellOffset { x: 0, y: 0 },
                CellOffset { x: 10, y: 10 },
                CellOffset { x: 0, y: 0 },
                CellOffset { x: 0, y: 0 },
                CellOffset { x: -2, y: 4 },
            ],
        };

        save_crop_offsets(&dir, "test.png", &offsets).unwrap();
        let loaded = load_crop_offsets(&dir, "test.png");
        assert_eq!(loaded.cells.len(), 8);
        assert_eq!(loaded.cells[0].x, 5);
        assert_eq!(loaded.cells[0].y, -3);
        assert_eq!(loaded.cells[4].x, 10);
        assert_eq!(loaded.cells[7].y, 4);
    }

    #[test]
    fn test_load_crop_offsets_missing_sidecar_returns_defaults() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();
        let offsets = load_crop_offsets(&dir, "nonexistent.png");
        assert_eq!(offsets.cells.len(), 8);
        assert_eq!(offsets.cells[0].x, 0);
        assert_eq!(offsets.cells[0].y, 0);
    }

    #[test]
    fn test_save_crop_offsets_wrong_count_rejected() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();
        let offsets = SpriteCropOffsets {
            version: 1,
            cells: vec![CellOffset { x: 0, y: 0 }; 5], // wrong count
        };
        let result = save_crop_offsets(&dir, "test.png", &offsets);
        assert!(result.is_err());
    }

    #[test]
    fn test_read_sprite_frame_out_of_range() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();
        save_test_sheet(&dir, "test.png", 2048, 1024);

        let result = read_sprite_frame(&dir, "test.png", 8, &CellOffset { x: 0, y: 0 });
        assert!(result.is_err());
    }

    #[test]
    fn test_read_sprite_frame_success() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();
        save_test_sheet(&dir, "test.png", 2048, 1024);

        let result = read_sprite_frame(&dir, "test.png", 0, &CellOffset { x: 0, y: 0 });
        assert!(result.is_ok());
        assert!(result.unwrap().starts_with("data:image/png;base64,"));
    }

    #[test]
    fn test_copy_prebuilt_sprites_copies_existing_files() {
        let tmp = TempDir::new().unwrap();
        let sprites = ensure_sprites_dir(tmp.path()).unwrap();

        // Create a fake resource dir with one pre-built sprite
        let resource_dir = tmp.path().join("resource_root");
        let src_sprites = resource_dir.join("resources").join("sprites");
        fs::create_dir_all(&src_sprites).unwrap();
        save_test_sheet(&src_sprites, "prebuilt-default.png", 2048, 1024);

        copy_prebuilt_sprites(&resource_dir, &sprites).unwrap();

        assert!(sprites.join("prebuilt-default.png").exists());
        // Others should not exist (source files missing)
        assert!(!sprites.join("prebuilt-pixel.png").exists());
    }

    #[test]
    fn test_copy_prebuilt_sprites_skips_existing_destination() {
        let tmp = TempDir::new().unwrap();
        let sprites = ensure_sprites_dir(tmp.path()).unwrap();

        // Create source
        let resource_dir = tmp.path().join("resource_root");
        let src_sprites = resource_dir.join("resources").join("sprites");
        fs::create_dir_all(&src_sprites).unwrap();
        save_test_sheet(&src_sprites, "prebuilt-default.png", 2048, 1024);

        // Pre-create destination with different content
        fs::write(sprites.join("prebuilt-default.png"), b"existing").unwrap();
        let before = fs::read(sprites.join("prebuilt-default.png")).unwrap();

        copy_prebuilt_sprites(&resource_dir, &sprites).unwrap();

        // Should NOT have been overwritten
        let after = fs::read(sprites.join("prebuilt-default.png")).unwrap();
        assert_eq!(before, after);
    }

    #[test]
    fn test_copy_prebuilt_sprites_handles_missing_source_dir() {
        let tmp = TempDir::new().unwrap();
        let sprites = ensure_sprites_dir(tmp.path()).unwrap();
        let resource_dir = tmp.path().join("nonexistent");

        // Should succeed silently (no source files to copy)
        let result = copy_prebuilt_sprites(&resource_dir, &sprites);
        assert!(result.is_ok());
    }

    // ── Slugify tests ────────────────────────────────────────────────

    #[test]
    fn test_slugify_display_name_basic() {
        assert_eq!(slugify_display_name("My Cool Sprite"), "my-cool-sprite");
    }

    #[test]
    fn test_slugify_display_name_special_chars() {
        assert_eq!(slugify_display_name("Hello, World!"), "hello-world");
    }

    #[test]
    fn test_slugify_display_name_consecutive_special() {
        assert_eq!(slugify_display_name("a---b"), "a-b");
        assert_eq!(slugify_display_name("  spaced  out  "), "spaced-out");
    }

    #[test]
    fn test_slugify_display_name_no_leading_trailing_dashes() {
        assert_eq!(slugify_display_name("--hello--"), "hello");
        assert_eq!(slugify_display_name("!test!"), "test");
    }

    #[test]
    fn test_slugify_display_name_pure_special_returns_empty() {
        assert_eq!(slugify_display_name("!!!"), "");
    }

    // ── Rename tests ─────────────────────────────────────────────────

    #[test]
    fn test_rename_sprite_basic() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();
        save_test_sheet(&dir, "generated-abc123.png", 2048, 1024);

        let new_name = rename_sprite(&dir, "generated-abc123.png", "My Bot").unwrap();
        assert_eq!(new_name, "generated-my-bot.png");
        assert!(dir.join("generated-my-bot.png").exists());
        assert!(!dir.join("generated-abc123.png").exists());
    }

    #[test]
    fn test_rename_sprite_preserves_prefix() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();
        save_test_sheet(&dir, "uploaded-old.png", 2048, 1024);

        let new_name = rename_sprite(&dir, "uploaded-old.png", "New Name").unwrap();
        assert_eq!(new_name, "uploaded-new-name.png");
    }

    #[test]
    fn test_rename_sprite_renames_crop_sidecar() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();
        save_test_sheet(&dir, "generated-abc.png", 2048, 1024);
        fs::write(dir.join("generated-abc.png.crops.json"), "{}").unwrap();

        rename_sprite(&dir, "generated-abc.png", "New").unwrap();
        assert!(dir.join("generated-new.png.crops.json").exists());
        assert!(!dir.join("generated-abc.png.crops.json").exists());
    }

    #[test]
    fn test_rename_sprite_rejects_prebuilt() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();
        save_test_sheet(&dir, "prebuilt-default.png", 2048, 1024);

        let result = rename_sprite(&dir, "prebuilt-default.png", "Custom");
        assert!(result.is_err());
        assert!(dir.join("prebuilt-default.png").exists());
    }

    #[test]
    fn test_rename_sprite_rejects_empty_name() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();
        save_test_sheet(&dir, "generated-abc.png", 2048, 1024);

        let result = rename_sprite(&dir, "generated-abc.png", "   ");
        assert!(result.is_err());
    }

    #[test]
    fn test_rename_sprite_rejects_duplicate_target() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();
        save_test_sheet(&dir, "generated-abc.png", 2048, 1024);
        save_test_sheet(&dir, "generated-existing.png", 2048, 1024);

        let result = rename_sprite(&dir, "generated-abc.png", "Existing");
        assert!(result.is_err());
    }

    #[test]
    fn test_rename_sprite_noop_when_unchanged() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();
        save_test_sheet(&dir, "generated-hello.png", 2048, 1024);

        let new_name = rename_sprite(&dir, "generated-hello.png", "Hello").unwrap();
        assert_eq!(new_name, "generated-hello.png");
        assert!(dir.join("generated-hello.png").exists());
    }

    #[test]
    fn test_rename_sprite_not_found() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();

        let result = rename_sprite(&dir, "generated-nonexistent.png", "New");
        assert!(result.is_err());
    }

    #[test]
    fn test_get_sprite_info_returns_correct_data() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();
        save_test_sheet(&dir, "uploaded-test.png", 2048, 1024);

        let info = get_sprite_info(&dir, "uploaded-test.png").unwrap();
        assert_eq!(info.filename, "uploaded-test.png");
        assert_eq!(info.display_name, "Test");
        assert!(matches!(info.source, SpriteSource::Uploaded));
        assert!(info.file_size_bytes > 0);
    }

    #[test]
    fn test_get_sprite_info_not_found() {
        let tmp = TempDir::new().unwrap();
        let dir = ensure_sprites_dir(tmp.path()).unwrap();

        let result = get_sprite_info(&dir, "nonexistent.png");
        assert!(result.is_err());
    }
}
