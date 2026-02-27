use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::Engine;
use zeroize::Zeroizing;

use crate::utils::error::AppError;

const SERVICE_NAME: &str = "app.theroost";
const ENCRYPTION_KEY_ACCOUNT: &str = "ai_memory_key";

/// Generate a cryptographically random 256-bit AES key.
pub fn generate_aes_key() -> [u8; 32] {
    let key = Aes256Gcm::generate_key(OsRng);
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&key);
    bytes
}

/// Encrypt a plaintext string using AES-256-GCM.
/// Returns a base64-encoded string containing `nonce (12 bytes) || ciphertext+tag`.
pub fn encrypt_field(plaintext: &str, key: &[u8; 32]) -> Result<String, AppError> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| AppError::Encryption(format!("Cipher init failed: {e}")))?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| AppError::Encryption(format!("Encryption failed: {e}")))?;

    let mut combined = Vec::with_capacity(12 + ciphertext.len());
    combined.extend_from_slice(&nonce);
    combined.extend_from_slice(&ciphertext);

    Ok(base64::engine::general_purpose::STANDARD.encode(&combined))
}

/// Decrypt a base64-encoded AES-256-GCM ciphertext back to a plaintext string.
/// Expects the input to be `nonce (12 bytes) || ciphertext+tag` encoded in base64.
pub fn decrypt_field(encrypted: &str, key: &[u8; 32]) -> Result<String, AppError> {
    let combined = base64::engine::general_purpose::STANDARD
        .decode(encrypted)
        .map_err(|e| AppError::Encryption(format!("Base64 decode failed: {e}")))?;

    // Minimum length: 12 (nonce) + 16 (AES-GCM tag) = 28 bytes
    if combined.len() < 28 {
        return Err(AppError::Encryption(
            "Encrypted data too short (need at least nonce + tag)".to_string(),
        ));
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| AppError::Encryption(format!("Cipher init failed: {e}")))?;
    let plaintext_bytes = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| AppError::Encryption("Decryption failed".to_string()))?;

    String::from_utf8(plaintext_bytes)
        .map_err(|_| AppError::Encryption("Decrypted content is not valid UTF-8".into()))
}

/// Store the AES encryption key in the OS credential manager (Windows Credential Manager).
pub fn store_encryption_key(key: &[u8; 32]) -> Result<(), AppError> {
    let encoded = Zeroizing::new(base64::engine::general_purpose::STANDARD.encode(key));
    let entry = keyring::Entry::new(SERVICE_NAME, ENCRYPTION_KEY_ACCOUNT)
        .map_err(|e| AppError::Credential(format!("Keyring init error: {e}")))?;
    entry.set_password(&encoded).map_err(|e| {
        tracing::error!(error = %e, "Failed to store AI encryption key");
        AppError::Credential(format!("Keyring store error: {e}"))
    })?;
    tracing::info!("AI encryption key stored successfully");
    Ok(())
}

/// Load the AES encryption key from the OS credential manager.
pub fn load_encryption_key() -> Result<Zeroizing<[u8; 32]>, AppError> {
    let entry = keyring::Entry::new(SERVICE_NAME, ENCRYPTION_KEY_ACCOUNT)
        .map_err(|e| AppError::Credential(format!("Keyring init error: {e}")))?;
    let encoded = Zeroizing::new(match entry.get_password() {
        Ok(val) => val,
        Err(keyring::Error::NoEntry) => {
            return Err(AppError::Credential(
                "AI encryption key not found — run first-time setup".to_string(),
            ));
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to load AI encryption key");
            return Err(AppError::Credential(format!("Keyring load error: {e}")));
        }
    });

    let decoded = Zeroizing::new(
        base64::engine::general_purpose::STANDARD
            .decode(encoded.as_bytes())
            .map_err(|e| AppError::Credential(format!("Key decode error: {e}")))?,
    );

    if decoded.len() != 32 {
        return Err(AppError::Credential(format!(
            "Key length mismatch: expected 32 bytes, got {}",
            decoded.len()
        )));
    }

    let mut key = Zeroizing::new([0u8; 32]);
    key.copy_from_slice(&decoded);
    Ok(key)
}

/// Check whether an AI encryption key exists in the credential manager.
pub fn has_encryption_key() -> Result<bool, AppError> {
    let entry = keyring::Entry::new(SERVICE_NAME, ENCRYPTION_KEY_ACCOUNT)
        .map_err(|e| AppError::Credential(format!("Keyring init error: {e}")))?;
    match entry.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => {
            tracing::error!(error = %e, "Failed to check AI encryption key");
            Err(AppError::Credential(format!("Keyring load error: {e}")))
        }
    }
}

/// Delete the AI encryption key from the credential manager.
/// Treats a missing key as success (idempotent).
pub fn delete_encryption_key() -> Result<(), AppError> {
    let entry = keyring::Entry::new(SERVICE_NAME, ENCRYPTION_KEY_ACCOUNT)
        .map_err(|e| AppError::Credential(format!("Keyring init error: {e}")))?;
    match entry.delete_credential() {
        Ok(()) => {
            tracing::info!("AI encryption key deleted");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => {
            tracing::error!(error = %e, "Failed to delete AI encryption key");
            Err(AppError::Credential(format!("Keyring delete error: {e}")))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_KEY: [u8; 32] = [0u8; 32];

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let plaintext = "Hello, this is a secret message!";
        let encrypted = encrypt_field(plaintext, &TEST_KEY).unwrap();
        let decrypted = decrypt_field(&encrypted, &TEST_KEY).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_different_nonces_produce_different_ciphertext() {
        let plaintext = "same text";
        let enc1 = encrypt_field(plaintext, &TEST_KEY).unwrap();
        let enc2 = encrypt_field(plaintext, &TEST_KEY).unwrap();
        assert_ne!(enc1, enc2, "Two encryptions of the same text should differ");
        assert_eq!(decrypt_field(&enc1, &TEST_KEY).unwrap(), plaintext);
        assert_eq!(decrypt_field(&enc2, &TEST_KEY).unwrap(), plaintext);
    }

    #[test]
    fn test_decrypt_with_wrong_key_fails() {
        let encrypted = encrypt_field("secret", &TEST_KEY).unwrap();
        let wrong_key: [u8; 32] = [1u8; 32];
        let result = decrypt_field(&encrypted, &wrong_key);
        assert!(result.is_err());
        let err = result.unwrap_err();
        match &err {
            AppError::Encryption(msg) => assert!(
                msg.contains("Decryption failed"),
                "Expected 'Decryption failed', got: {msg}"
            ),
            other => panic!("Expected AppError::Encryption, got: {other:?}"),
        }
    }

    #[test]
    fn test_decrypt_corrupted_ciphertext_fails() {
        let encrypted = encrypt_field("secret data", &TEST_KEY).unwrap();
        let mut chars: Vec<char> = encrypted.chars().collect();
        if chars.len() > 20 {
            chars[20] = if chars[20] == 'A' { 'B' } else { 'A' };
        }
        let corrupted: String = chars.into_iter().collect();
        let result = decrypt_field(&corrupted, &TEST_KEY);
        assert!(
            result.is_err(),
            "Corrupted ciphertext should fail to decrypt"
        );
    }

    #[test]
    fn test_encrypt_empty_string() {
        let encrypted = encrypt_field("", &TEST_KEY).unwrap();
        let decrypted = decrypt_field(&encrypted, &TEST_KEY).unwrap();
        assert_eq!(decrypted, "");
    }

    #[test]
    fn test_encrypt_unicode_and_multibyte() {
        let texts = [
            "\u{1F680}\u{1F30D}\u{1F389}",                      // emojis
            "\u{041F}\u{0440}\u{0438}\u{0432}\u{0435}\u{0442}", // Cyrillic: Привет
            "\u{4F60}\u{597D}\u{4E16}\u{754C}",                 // Chinese: 你好世界
            "caf\u{00E9} na\u{00EF}ve \u{00FC}ber",             // accented
        ];
        for text in &texts {
            let encrypted = encrypt_field(text, &TEST_KEY).unwrap();
            let decrypted = decrypt_field(&encrypted, &TEST_KEY).unwrap();
            assert_eq!(&decrypted, text, "Roundtrip failed for: {text}");
        }
    }

    #[test]
    fn test_generate_aes_key_is_32_bytes() {
        let key = generate_aes_key();
        assert_eq!(key.len(), 32);
    }

    #[test]
    fn test_generate_aes_key_is_random() {
        let key1 = generate_aes_key();
        let key2 = generate_aes_key();
        assert_ne!(key1, key2, "Two generated keys should differ");
        assert_ne!(key1, [0u8; 32], "Generated key should not be all zeros");
        assert_ne!(key2, [0u8; 32], "Generated key should not be all zeros");
    }

    #[test]
    fn test_decrypt_too_short_fails() {
        let short_data = base64::engine::general_purpose::STANDARD.encode([0u8; 10]);
        let result = decrypt_field(&short_data, &TEST_KEY);
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::Encryption(msg) => assert!(
                msg.contains("too short"),
                "Expected 'too short' error, got: {msg}"
            ),
            other => panic!("Expected AppError::Encryption, got: {other:?}"),
        }
    }

    #[test]
    fn test_decrypt_invalid_base64_fails() {
        let result = decrypt_field("not-valid-base64!!!", &TEST_KEY);
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::Encryption(msg) => assert!(
                msg.contains("Base64 decode failed"),
                "Expected 'Base64 decode failed', got: {msg}"
            ),
            other => panic!("Expected AppError::Encryption, got: {other:?}"),
        }
    }

    #[test]
    fn test_encrypt_long_string() {
        let long_text: String = "a".repeat(10_000);
        let encrypted = encrypt_field(&long_text, &TEST_KEY).unwrap();
        let decrypted = decrypt_field(&encrypted, &TEST_KEY).unwrap();
        assert_eq!(decrypted, long_text);
    }

    #[test]
    fn test_decrypt_exactly_27_bytes_fails() {
        let data = base64::engine::general_purpose::STANDARD.encode([0u8; 27]);
        let result = decrypt_field(&data, &TEST_KEY);
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::Encryption(msg) => assert!(
                msg.contains("too short"),
                "Expected 'too short' error for 27 bytes, got: {msg}"
            ),
            other => panic!("Expected AppError::Encryption, got: {other:?}"),
        }
    }

    #[test]
    fn test_decrypt_exactly_28_bytes_passes_length_check() {
        // 28 bytes: the length check (< 28) should pass, but decryption
        // will fail because this is not a valid ciphertext for TEST_KEY.
        let data = base64::engine::general_purpose::STANDARD.encode([0u8; 28]);
        let result = decrypt_field(&data, &TEST_KEY);
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::Encryption(msg) => assert!(
                msg.contains("Decryption failed"),
                "Expected 'Decryption failed' (not 'too short') for 28 bytes, got: {msg}"
            ),
            other => panic!("Expected AppError::Encryption, got: {other:?}"),
        }
    }

    #[test]
    fn test_decrypt_empty_base64_fails() {
        let result = decrypt_field("", &TEST_KEY);
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::Encryption(msg) => assert!(
                msg.contains("too short"),
                "Expected 'too short' for empty input, got: {msg}"
            ),
            other => panic!("Expected AppError::Encryption, got: {other:?}"),
        }
    }

    #[test]
    fn test_key_base64_roundtrip() {
        let key = generate_aes_key();
        let encoded = base64::engine::general_purpose::STANDARD.encode(key);
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(&encoded)
            .unwrap();
        assert_eq!(decoded.len(), 32);
        let mut restored = [0u8; 32];
        restored.copy_from_slice(&decoded);
        assert_eq!(restored, key);
    }
}
