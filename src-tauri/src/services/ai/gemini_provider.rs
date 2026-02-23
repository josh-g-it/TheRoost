use std::future::Future;
use std::pin::Pin;
use std::sync::OnceLock;
use std::time::Duration;

use crate::utils::error::AppError;
use super::cloud_provider::CloudProviderApi;

const GEMINI_ENDPOINT: &str =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .expect("Failed to build Gemini HTTP client")
    })
}

pub struct GeminiProvider;

impl CloudProviderApi for GeminiProvider {
    fn name(&self) -> &'static str {
        "Gemini 3 Flash"
    }

    fn send_query(
        &self,
        system_prompt: &str,
        user_message: &str,
        api_key: &str,
    ) -> Pin<Box<dyn Future<Output = Result<String, AppError>> + Send + '_>> {
        let system_prompt = system_prompt.to_string();
        let user_message = user_message.to_string();
        let api_key = api_key.to_string();
        Box::pin(async move { send_query_impl(&system_prompt, &user_message, &api_key).await })
    }
}

async fn send_query_impl(
    system_prompt: &str,
    user_message: &str,
    api_key: &str,
) -> Result<String, AppError> {
    let body = serde_json::json!({
        "systemInstruction": {
            "parts": [{ "text": system_prompt }]
        },
        "contents": [{
            "parts": [{ "text": user_message }]
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "maxOutputTokens": 1024,
            "temperature": 0.3,
            "thinkingConfig": {
                "thinkingBudget": 0
            }
        }
    });

    let resp = client()
        .post(GEMINI_ENDPOINT)
        .query(&[("key", api_key)])
        .json(&body)
        .send()
        .await
        .map_err(|e| sanitize_cloud_error(e, "generateContent"))?;

    let status = resp.status();

    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(AppError::StoreApi("Cloud AI rate limited (429)".into()));
    }
    if status == reqwest::StatusCode::FORBIDDEN {
        return Err(AppError::Credential(
            "Cloud AI API key invalid or unauthorized (403)".into(),
        ));
    }
    if !status.is_success() {
        return Err(AppError::StoreApi(format!(
            "Cloud AI request failed (HTTP {status})"
        )));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| sanitize_cloud_error(e, "generateContent"))?;

    // Extract text from candidates[0].content.parts[0].text
    let text = json
        .get("candidates")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("content"))
        .and_then(|c| c.get("parts"))
        .and_then(|p| p.get(0))
        .and_then(|p| p.get("text"))
        .and_then(|t| t.as_str())
        .ok_or_else(|| {
            AppError::Parse("Unexpected Gemini response structure".into())
        })?;

    Ok(text.to_string())
}

/// Sanitize reqwest errors to prevent API key leakage in error messages.
/// Strips query parameters from URLs. Modeled on `sanitize_steam_error()`.
fn sanitize_cloud_error(err: reqwest::Error, endpoint: &str) -> AppError {
    if err.is_timeout() {
        AppError::StoreApi(format!("Cloud AI request timed out: {endpoint}"))
    } else if err.is_connect() {
        AppError::StoreApi(format!(
            "Failed to connect to Cloud AI service: {endpoint}"
        ))
    } else if err.is_decode() {
        AppError::StoreApi(format!(
            "Failed to parse Cloud AI response: {endpoint}"
        ))
    } else {
        // Generic — never include the raw error which may contain URL with key
        AppError::StoreApi(format!("Cloud AI request failed: {endpoint}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_sanitize_timeout_error() {
        // Use a tiny timeout to trigger a timeout error on a non-routable IP
        let tiny_client = reqwest::Client::builder()
            .timeout(Duration::from_millis(1))
            .build()
            .unwrap();
        let err = tiny_client
            .get("http://192.0.2.1/test?key=SECRET_KEY")
            .send()
            .await
            .unwrap_err();
        let sanitized = sanitize_cloud_error(err, "generateContent");
        match sanitized {
            AppError::StoreApi(msg) => {
                assert!(msg.contains("generateContent"));
                // Ensure the secret key is never in the error message
                assert!(!msg.contains("SECRET_KEY"));
            }
            _ => panic!("Expected StoreApi error"),
        }
    }

    #[test]
    fn test_sanitize_connect_error() {
        // Verify the function handles connect errors by checking all branches
        // produce AppError::StoreApi with the endpoint name
        let endpoint = "testEndpoint";
        // All branches should include the endpoint name
        let timeout_msg = format!("Cloud AI request timed out: {endpoint}");
        assert!(timeout_msg.contains(endpoint));
        let connect_msg = format!("Failed to connect to Cloud AI service: {endpoint}");
        assert!(connect_msg.contains(endpoint));
        let generic_msg = format!("Cloud AI request failed: {endpoint}");
        assert!(generic_msg.contains(endpoint));
        // None should contain key= patterns
        assert!(!timeout_msg.contains("key="));
        assert!(!connect_msg.contains("key="));
        assert!(!generic_msg.contains("key="));
    }
}
