use std::path::{Path, PathBuf};

use image::{DynamicImage, GenericImageView, ImageFormat};

use crate::utils::error::AppError;

/// Crop coordinates from the frontend (pixel values relative to original image).
#[derive(Debug, Clone, serde::Deserialize)]
pub struct CropArea {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Target dimensions for each image type.
pub struct ImageDimensions {
    pub width: u32,
    pub height: u32,
}

/// Returns the recommended target dimensions for a given image type.
pub fn dimensions_for_type(image_type: &str) -> ImageDimensions {
    match image_type {
        "grid" => ImageDimensions {
            width: 920,
            height: 430,
        },
        "hero" => ImageDimensions {
            width: 1920,
            height: 620,
        },
        "logo" => ImageDimensions {
            width: 256,
            height: 256,
        },
        _ => ImageDimensions {
            width: 920,
            height: 430,
        },
    }
}

const MAX_UPLOAD_SIZE: u64 = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp"];

/// Validate an uploaded file: check extension and size.
pub fn validate_upload(path: &Path) -> Result<(), AppError> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return Err(AppError::Validation(
            "Unsupported image format. Use PNG, JPG, or WebP.".to_string(),
        ));
    }

    let metadata = std::fs::metadata(path)?;
    if metadata.len() > MAX_UPLOAD_SIZE {
        return Err(AppError::Validation(format!(
            "Image too large ({:.1} MB). Maximum is 10 MB.",
            metadata.len() as f64 / 1_048_576.0
        )));
    }

    Ok(())
}

/// Read image bytes from a local file path.
pub fn read_local_image(path: &Path) -> Result<DynamicImage, AppError> {
    let bytes = std::fs::read(path)?;
    image::load_from_memory(&bytes)
        .map_err(|e| AppError::Validation(format!("Invalid image file: {}", e)))
}

/// Download an image from a URL (for SteamGridDB images).
pub async fn download_image(url: &str) -> Result<DynamicImage, AppError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;
    let bytes = client.get(url).send().await?.bytes().await?;
    image::load_from_memory(&bytes)
        .map_err(|e| AppError::Validation(format!("Invalid image data from URL: {}", e)))
}

/// Ensure the art directory exists under app_data.
pub fn ensure_art_dir(app_data: &Path) -> Result<PathBuf, AppError> {
    let art_dir = app_data.join("art");
    std::fs::create_dir_all(&art_dir)?;
    Ok(art_dir)
}

/// Crop and resize an image, then save to the art directory.
/// Returns the absolute path where the image was saved.
pub fn crop_and_save(
    img: &DynamicImage,
    crop: &CropArea,
    image_type: &str,
    game_id: &str,
    art_dir: &Path,
) -> Result<PathBuf, AppError> {
    // Validate crop bounds
    let (iw, ih) = img.dimensions();
    if crop.x + crop.width > iw || crop.y + crop.height > ih {
        return Err(AppError::Validation(format!(
            "Crop area ({},{} {}x{}) exceeds image bounds ({}x{})",
            crop.x, crop.y, crop.width, crop.height, iw, ih
        )));
    }
    if crop.width == 0 || crop.height == 0 {
        return Err(AppError::Validation(
            "Crop area must have non-zero dimensions".to_string(),
        ));
    }

    // Crop
    let cropped = img.crop_imm(crop.x, crop.y, crop.width, crop.height);

    // Resize to target dimensions
    let dims = dimensions_for_type(image_type);
    let resized = cropped.resize_exact(
        dims.width,
        dims.height,
        image::imageops::FilterType::Lanczos3,
    );

    // Save as PNG
    let filename = format!("{}_{}.png", game_id, image_type);
    let output_path = art_dir.join(&filename);
    resized
        .save_with_format(&output_path, ImageFormat::Png)
        .map_err(|e| {
            AppError::Io(std::io::Error::other(format!(
                "Failed to save image: {}",
                e
            )))
        })?;

    tracing::info!(
        game_id,
        image_type,
        path = %output_path.display(),
        "Custom art saved"
    );
    Ok(output_path)
}

/// Delete a custom art file from disk.
pub fn delete_art_file(path: &Path) -> Result<(), AppError> {
    if path.exists() {
        std::fs::remove_file(path)?;
        tracing::info!(path = %path.display(), "Custom art file deleted");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dimensions_for_type() {
        let grid = dimensions_for_type("grid");
        assert_eq!(grid.width, 920);
        assert_eq!(grid.height, 430);

        let hero = dimensions_for_type("hero");
        assert_eq!(hero.width, 1920);
        assert_eq!(hero.height, 620);

        let logo = dimensions_for_type("logo");
        assert_eq!(logo.width, 256);
        assert_eq!(logo.height, 256);

        // Unknown type defaults to grid
        let unknown = dimensions_for_type("unknown");
        assert_eq!(unknown.width, 920);
        assert_eq!(unknown.height, 430);
    }

    #[test]
    fn test_validate_upload_bad_extension() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("image.bmp");
        std::fs::write(&path, b"fake").unwrap();
        let result = validate_upload(&path);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Unsupported"));
    }

    #[test]
    fn test_validate_upload_too_large() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("big.png");
        let data = vec![0u8; 11 * 1024 * 1024];
        std::fs::write(&path, &data).unwrap();
        let result = validate_upload(&path);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("too large"));
    }

    #[test]
    fn test_validate_upload_valid() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ok.png");
        std::fs::write(&path, b"small file").unwrap();
        assert!(validate_upload(&path).is_ok());
    }

    #[test]
    fn test_crop_and_save() {
        let img = DynamicImage::new_rgb8(100, 100);
        let crop = CropArea {
            x: 10,
            y: 10,
            width: 50,
            height: 75,
        };
        let dir = tempfile::tempdir().unwrap();
        let result = crop_and_save(&img, &crop, "grid", "test-id", dir.path());
        assert!(result.is_ok());
        let path = result.unwrap();
        assert!(path.exists());
        assert!(path.to_string_lossy().contains("test-id_grid.png"));

        // Verify output dimensions
        let saved = image::open(&path).unwrap();
        let (w, h) = saved.dimensions();
        assert_eq!(w, 920);
        assert_eq!(h, 430);
    }

    #[test]
    fn test_crop_out_of_bounds() {
        let img = DynamicImage::new_rgb8(100, 100);
        let crop = CropArea {
            x: 50,
            y: 50,
            width: 60,
            height: 60,
        };
        let dir = tempfile::tempdir().unwrap();
        let result = crop_and_save(&img, &crop, "grid", "test-id", dir.path());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("exceeds"));
    }

    #[test]
    fn test_crop_zero_dimensions() {
        let img = DynamicImage::new_rgb8(100, 100);
        let crop = CropArea {
            x: 0,
            y: 0,
            width: 0,
            height: 50,
        };
        let dir = tempfile::tempdir().unwrap();
        let result = crop_and_save(&img, &crop, "grid", "test-id", dir.path());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("non-zero"));
    }

    #[test]
    fn test_delete_art_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.png");
        std::fs::write(&path, b"data").unwrap();
        assert!(path.exists());
        delete_art_file(&path).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn test_delete_art_file_nonexistent() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nonexistent.png");
        // Should not error on missing file
        assert!(delete_art_file(&path).is_ok());
    }
}
