use base64::{engine::general_purpose::STANDARD, Engine};
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use std::io::Cursor;

use crate::utils::error::AppError;

/// Maximum decoded image size (10 MB).
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
/// Images are resized so the longest side is at most this many pixels.
const MAX_DIMENSION: u32 = 768;

/// Result of preparing an image for chat attachment.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedImage {
    pub mime_type: String,
    pub data: String,
    pub preview_url: String,
}

/// Read an image from a file path, validate, resize, and return as base64 JPEG.
pub fn prepare_image(file_path: &str) -> Result<PreparedImage, AppError> {
    let raw = std::fs::read(file_path).map_err(|e| {
        AppError::Validation(format!("Failed to read image file '{}': {}", file_path, e))
    })?;
    if raw.len() > MAX_IMAGE_BYTES {
        return Err(AppError::Validation(format!(
            "Image too large ({:.1} MB). Maximum is {} MB.",
            raw.len() as f64 / 1_048_576.0,
            MAX_IMAGE_BYTES / 1_048_576
        )));
    }
    process_bytes(&raw)
}

/// Process raw image bytes (e.g. from clipboard), validate, resize, return as base64 JPEG.
pub fn prepare_image_from_bytes(data: &[u8]) -> Result<PreparedImage, AppError> {
    if data.len() > MAX_IMAGE_BYTES {
        return Err(AppError::Validation(format!(
            "Image too large ({:.1} MB). Maximum is {} MB.",
            data.len() as f64 / 1_048_576.0,
            MAX_IMAGE_BYTES / 1_048_576
        )));
    }
    process_bytes(data)
}

fn process_bytes(data: &[u8]) -> Result<PreparedImage, AppError> {
    let img = image::load_from_memory(data)
        .map_err(|e| AppError::Validation(format!("Invalid image: {}", e)))?;

    let (w, h) = img.dimensions();
    let longest = w.max(h);

    let resized = if longest > MAX_DIMENSION {
        img.resize(
            MAX_DIMENSION,
            MAX_DIMENSION,
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        img
    };

    // Encode as JPEG
    let mut buf = Vec::new();
    let mut cursor = Cursor::new(&mut buf);
    resized
        .write_to(&mut cursor, image::ImageFormat::Jpeg)
        .map_err(|e| AppError::Validation(format!("Failed to encode image as JPEG: {}", e)))?;

    let b64 = STANDARD.encode(&buf);
    let mime = "image/jpeg".to_string();
    let preview_url = format!("data:{};base64,{}", mime, b64);

    Ok(PreparedImage {
        mime_type: mime,
        data: b64,
        preview_url,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Create a minimal valid 2x2 PNG in memory.
    fn tiny_png() -> Vec<u8> {
        let mut buf = Vec::new();
        let mut cursor = Cursor::new(&mut buf);
        let img = image::RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]));
        image::DynamicImage::ImageRgba8(img)
            .write_to(&mut cursor, image::ImageFormat::Png)
            .unwrap();
        buf
    }

    #[test]
    fn test_prepare_from_bytes_tiny_image() {
        let png = tiny_png();
        let result = prepare_image_from_bytes(&png).unwrap();
        assert_eq!(result.mime_type, "image/jpeg");
        assert!(!result.data.is_empty());
        assert!(result.preview_url.starts_with("data:image/jpeg;base64,"));
    }

    #[test]
    fn test_prepare_from_bytes_rejects_non_image() {
        let garbage = b"this is not an image file at all";
        let result = prepare_image_from_bytes(garbage);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Invalid image"), "got: {err}");
    }

    #[test]
    fn test_prepare_from_bytes_rejects_oversized() {
        // Create data just over the limit
        let data = vec![0u8; MAX_IMAGE_BYTES + 1];
        let result = prepare_image_from_bytes(&data);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("too large"), "got: {err}");
    }

    #[test]
    fn test_resize_large_image() {
        // Create a 2000x1000 image — should be resized to 768x384
        let img = image::RgbaImage::from_pixel(2000, 1000, image::Rgba([0, 128, 255, 255]));
        let mut buf = Vec::new();
        let mut cursor = Cursor::new(&mut buf);
        image::DynamicImage::ImageRgba8(img)
            .write_to(&mut cursor, image::ImageFormat::Png)
            .unwrap();

        let result = prepare_image_from_bytes(&buf).unwrap();
        // Verify it's JPEG
        assert_eq!(result.mime_type, "image/jpeg");
        // Decode the result and verify dimensions
        let decoded_bytes = STANDARD.decode(&result.data).unwrap();
        let decoded = image::load_from_memory(&decoded_bytes).unwrap();
        let (rw, rh) = decoded.dimensions();
        assert!(rw <= MAX_DIMENSION, "width {rw} > {MAX_DIMENSION}");
        assert!(rh <= MAX_DIMENSION, "height {rh} > {MAX_DIMENSION}");
        assert_eq!(rw, MAX_DIMENSION); // longest side should be exactly MAX_DIMENSION
    }

    #[test]
    fn test_small_image_not_upscaled() {
        // A 100x50 image should NOT be upscaled
        let img = image::RgbaImage::from_pixel(100, 50, image::Rgba([0, 0, 0, 255]));
        let mut buf = Vec::new();
        let mut cursor = Cursor::new(&mut buf);
        image::DynamicImage::ImageRgba8(img)
            .write_to(&mut cursor, image::ImageFormat::Png)
            .unwrap();

        let result = prepare_image_from_bytes(&buf).unwrap();
        let decoded_bytes = STANDARD.decode(&result.data).unwrap();
        let decoded = image::load_from_memory(&decoded_bytes).unwrap();
        let (rw, rh) = decoded.dimensions();
        // JPEG re-encoding preserves dimensions for small images
        assert_eq!(rw, 100);
        assert_eq!(rh, 50);
    }
}
