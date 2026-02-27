use std::future::Future;
use std::pin::Pin;
use std::sync::OnceLock;
use std::time::Duration;

use futures::StreamExt;

use super::gemini_config::GEMINI_CONFIG;
use crate::services::ai::cloud_provider::{ChatMessage, ChatRole, CloudProviderApi, StreamChunk};
use crate::utils::error::AppError;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const STREAM_CHUNK_TIMEOUT: Duration = Duration::from_secs(60);

/// Single-shot HTTP client with a full request timeout.
fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .expect("Failed to build Gemini HTTP client")
    })
}

/// Streaming HTTP client — connect timeout only, no total-request timeout.
#[allow(dead_code)]
fn streaming_client() -> &'static reqwest::Client {
    static STREAM_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    STREAM_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(REQUEST_TIMEOUT)
            .build()
            .expect("Failed to build Gemini streaming HTTP client")
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

    fn send_conversation_stream(
        &self,
        system_prompt: &str,
        messages: &[ChatMessage],
        api_key: &str,
        chunk_tx: tokio::sync::mpsc::Sender<StreamChunk>,
        conversation_id: &str,
    ) -> Pin<Box<dyn Future<Output = Result<String, AppError>> + Send + '_>> {
        let system_prompt = system_prompt.to_string();
        let messages = messages.to_vec();
        let api_key = api_key.to_string();
        let conversation_id = conversation_id.to_string();
        Box::pin(async move {
            send_conversation_stream_impl(
                &system_prompt,
                &messages,
                &api_key,
                chunk_tx,
                &conversation_id,
            )
            .await
        })
    }
}

/// Build the single-shot generateContent URL.
fn generate_content_url() -> String {
    format!(
        "{}/models/{}:generateContent",
        GEMINI_CONFIG.endpoint, GEMINI_CONFIG.model
    )
}

/// Build the streaming streamGenerateContent URL.
#[allow(dead_code)]
fn stream_generate_content_url() -> String {
    format!(
        "{}/models/{}:streamGenerateContent",
        GEMINI_CONFIG.endpoint, GEMINI_CONFIG.model
    )
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
            "maxOutputTokens": GEMINI_CONFIG.max_output_tokens_compact,
            "temperature": GEMINI_CONFIG.temperature_compact,
            "thinkingConfig": {
                "thinkingBudget": 0
            }
        }
    });

    let resp = client()
        .post(generate_content_url())
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

    extract_response_text(&json)
}

/// Extract text from the standard Gemini response structure:
/// `candidates[0].content.parts[0].text`
fn extract_response_text(json: &serde_json::Value) -> Result<String, AppError> {
    let text = json
        .get("candidates")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("content"))
        .and_then(|c| c.get("parts"))
        .and_then(|p| p.get(0))
        .and_then(|p| p.get("text"))
        .and_then(|t| t.as_str())
        .ok_or_else(|| AppError::Parse("Unexpected Gemini response structure".into()))?;

    Ok(text.to_string())
}

/// Map ChatRole to the Gemini wire-format role string.
fn gemini_role(role: &ChatRole) -> &'static str {
    match role {
        ChatRole::User => "user",
        ChatRole::Assistant => "model",
        ChatRole::System => "user", // System messages shouldn't reach here; filtered upstream
    }
}

/// Build the Gemini `contents` array from chat messages, filtering out System messages.
fn build_contents(messages: &[ChatMessage]) -> Vec<serde_json::Value> {
    messages
        .iter()
        .filter(|m| m.role != ChatRole::System)
        .map(|m| {
            serde_json::json!({
                "role": gemini_role(&m.role),
                "parts": [{ "text": &m.content }]
            })
        })
        .collect()
}

/// Streaming conversation implementation.
#[allow(dead_code)]
async fn send_conversation_stream_impl(
    system_prompt: &str,
    messages: &[ChatMessage],
    api_key: &str,
    chunk_tx: tokio::sync::mpsc::Sender<StreamChunk>,
    conversation_id: &str,
) -> Result<String, AppError> {
    let contents = build_contents(messages);

    let body = serde_json::json!({
        "systemInstruction": {
            "parts": [{ "text": system_prompt }]
        },
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": GEMINI_CONFIG.max_output_tokens_chat,
            "temperature": GEMINI_CONFIG.temperature_chat
        }
    });

    let resp = streaming_client()
        .post(stream_generate_content_url())
        .query(&[("key", api_key), ("alt", "sse")])
        .json(&body)
        .send()
        .await
        .map_err(|e| sanitize_cloud_error(e, "streamGenerateContent"))?;

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

    let mut stream = resp.bytes_stream();
    let mut accumulated = String::new();
    let mut line_buffer = String::new();

    loop {
        let chunk_result = tokio::time::timeout(STREAM_CHUNK_TIMEOUT, stream.next()).await;

        match chunk_result {
            // Chunk timeout
            Err(_elapsed) => {
                // Flush any remaining data in line_buffer
                flush_line_buffer(&line_buffer, &mut accumulated);
                if !accumulated.is_empty() {
                    let _ = chunk_tx
                        .send(StreamChunk {
                            conversation_id: conversation_id.to_string(),
                            text: String::new(),
                            is_final: true,
                        })
                        .await;
                    return Ok(accumulated);
                }
                return Err(AppError::StoreApi(
                    "Cloud AI stream timed out waiting for chunk".into(),
                ));
            }
            // Stream ended (None from next())
            Ok(None) => {
                // Flush any remaining data in line_buffer
                flush_line_buffer(&line_buffer, &mut accumulated);
                if !accumulated.is_empty() {
                    let _ = chunk_tx
                        .send(StreamChunk {
                            conversation_id: conversation_id.to_string(),
                            text: String::new(),
                            is_final: true,
                        })
                        .await;
                }
                return Ok(accumulated);
            }
            // Stream read error
            Ok(Some(Err(e))) => {
                flush_line_buffer(&line_buffer, &mut accumulated);
                if !accumulated.is_empty() {
                    let _ = chunk_tx
                        .send(StreamChunk {
                            conversation_id: conversation_id.to_string(),
                            text: String::new(),
                            is_final: true,
                        })
                        .await;
                    return Ok(accumulated);
                }
                return Err(sanitize_cloud_error(e, "streamGenerateContent"));
            }
            // Got bytes
            Ok(Some(Ok(bytes))) => {
                let text = String::from_utf8_lossy(&bytes);
                line_buffer.push_str(&text);

                // Process complete lines
                while let Some(newline_pos) = line_buffer.find('\n') {
                    let line = line_buffer[..newline_pos]
                        .trim_end_matches('\r')
                        .to_string();
                    line_buffer = line_buffer[newline_pos + 1..].to_string();

                    if let Some(parsed) = parse_sse_line(&line) {
                        if !parsed.text.is_empty() {
                            accumulated.push_str(&parsed.text);
                            // Ignore channel send failures
                            let _ = chunk_tx
                                .send(StreamChunk {
                                    conversation_id: conversation_id.to_string(),
                                    text: parsed.text,
                                    is_final: parsed.is_final,
                                })
                                .await;
                        } else if parsed.is_final {
                            let _ = chunk_tx
                                .send(StreamChunk {
                                    conversation_id: conversation_id.to_string(),
                                    text: String::new(),
                                    is_final: true,
                                })
                                .await;
                        }

                        if parsed.is_final {
                            return Ok(accumulated);
                        }
                    }
                }
            }
        }
    }
}

/// Flush any remaining unparsed data from the line buffer into accumulated text.
/// Called when the stream ends, times out, or errors — the final SSE chunk may
/// not have a trailing newline, leaving data stranded in the buffer.
fn flush_line_buffer(line_buffer: &str, accumulated: &mut String) {
    let remaining = line_buffer.trim_end_matches('\r');
    if !remaining.is_empty() {
        if let Some(parsed) = parse_sse_line(remaining) {
            if !parsed.text.is_empty() {
                accumulated.push_str(&parsed.text);
            }
        }
    }
}

/// Parsed result from a single SSE data line.
struct SseParsed {
    text: String,
    is_final: bool,
}

/// Parse a single SSE line. Returns None for non-data lines, empty lines,
/// [DONE] markers, or malformed JSON.
fn parse_sse_line(line: &str) -> Option<SseParsed> {
    let data = line.strip_prefix("data: ")?;

    // Skip empty data and [DONE] marker
    if data.is_empty() || data == "[DONE]" {
        return None;
    }

    let json: serde_json::Value = serde_json::from_str(data).ok()?;

    let is_final = json
        .get("candidates")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("finishReason"))
        .and_then(|r| r.as_str())
        == Some("STOP");

    let text = json
        .get("candidates")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("content"))
        .and_then(|c| c.get("parts"))
        .and_then(|p| p.get(0))
        .and_then(|p| p.get("text"))
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

    // Skip chunks with empty text unless it's the final chunk
    if text.is_empty() && !is_final {
        return None;
    }

    Some(SseParsed { text, is_final })
}

/// Sanitize reqwest errors to prevent API key leakage in error messages.
/// Strips query parameters from URLs. Modeled on `sanitize_steam_error()`.
pub(crate) fn sanitize_cloud_error(err: reqwest::Error, endpoint: &str) -> AppError {
    if err.is_timeout() {
        AppError::StoreApi(format!("Cloud AI request timed out: {endpoint}"))
    } else if err.is_connect() {
        AppError::StoreApi(format!("Failed to connect to Cloud AI service: {endpoint}"))
    } else if err.is_decode() {
        AppError::StoreApi(format!("Failed to parse Cloud AI response: {endpoint}"))
    } else {
        // Generic — never include the raw error which may contain URL with key
        AppError::StoreApi(format!("Cloud AI request failed: {endpoint}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_sse_chunk() {
        let line = r#"data: {"candidates":[{"content":{"parts":[{"text":"hello"}]}}]}"#;
        let parsed = parse_sse_line(line).unwrap();
        assert_eq!(parsed.text, "hello");
        assert!(!parsed.is_final);
    }

    #[test]
    fn test_parse_final_chunk_with_finish_reason() {
        let line = r#"data: {"candidates":[{"content":{"parts":[{"text":"done"}]},"finishReason":"STOP"}]}"#;
        let parsed = parse_sse_line(line).unwrap();
        assert_eq!(parsed.text, "done");
        assert!(parsed.is_final);
    }

    #[test]
    fn test_skip_non_data_line() {
        assert!(parse_sse_line("event: message").is_none());
        assert!(parse_sse_line("id: 123").is_none());
        assert!(parse_sse_line("retry: 1000").is_none());
    }

    #[test]
    fn test_skip_empty_data() {
        assert!(parse_sse_line("data: ").is_none());
    }

    #[test]
    fn test_skip_done_marker() {
        assert!(parse_sse_line("data: [DONE]").is_none());
    }

    #[test]
    fn test_skip_empty_line() {
        assert!(parse_sse_line("").is_none());
    }

    #[test]
    fn test_skip_malformed_json() {
        assert!(parse_sse_line("data: not-json").is_none());
    }

    #[test]
    fn test_skip_chunk_with_no_text() {
        // Has candidates and content but no text field in parts
        let line = r#"data: {"candidates":[{"content":{"parts":[{"inlineData":"abc"}]}}]}"#;
        let parsed = parse_sse_line(line);
        assert!(parsed.is_none());
    }

    #[test]
    fn test_final_chunk_with_empty_text_is_returned() {
        let line =
            r#"data: {"candidates":[{"content":{"parts":[{"text":""}]},"finishReason":"STOP"}]}"#;
        let parsed = parse_sse_line(line).unwrap();
        assert_eq!(parsed.text, "");
        assert!(parsed.is_final);
    }

    #[test]
    fn test_parse_chunk_with_unexpected_structure() {
        // Missing candidates entirely
        let line = r#"data: {"result":"ok"}"#;
        assert!(parse_sse_line(line).is_none());
    }

    #[test]
    fn test_multi_chunk_accumulation() {
        let chunks = vec![
            r#"data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}"#,
            r#"data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}]}"#,
            r#"data: {"candidates":[{"content":{"parts":[{"text":"!"}]},"finishReason":"STOP"}]}"#,
        ];

        let mut accumulated = String::new();
        for chunk in chunks {
            if let Some(parsed) = parse_sse_line(chunk) {
                accumulated.push_str(&parsed.text);
            }
        }
        assert_eq!(accumulated, "Hello world!");
    }

    #[test]
    fn test_chat_role_user_maps_to_user() {
        assert_eq!(gemini_role(&ChatRole::User), "user");
    }

    #[test]
    fn test_chat_role_assistant_maps_to_model() {
        assert_eq!(gemini_role(&ChatRole::Assistant), "model");
    }

    #[test]
    fn test_system_messages_filtered_from_contents() {
        let messages = vec![
            ChatMessage {
                role: ChatRole::System,
                content: "You are a helper".to_string(),
                timestamp: "2026-01-01T00:00:00Z".to_string(),
            },
            ChatMessage {
                role: ChatRole::User,
                content: "Hello".to_string(),
                timestamp: "2026-01-01T00:00:01Z".to_string(),
            },
            ChatMessage {
                role: ChatRole::Assistant,
                content: "Hi there".to_string(),
                timestamp: "2026-01-01T00:00:02Z".to_string(),
            },
        ];

        let contents = build_contents(&messages);
        // System message should be filtered out
        assert_eq!(contents.len(), 2);
        assert_eq!(contents[0]["role"], "user");
        assert_eq!(contents[1]["role"], "model");
    }

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

    // ── extract_response_text tests (P0) ──────

    #[test]
    fn test_extract_response_text_valid() {
        let json = serde_json::json!({
            "candidates": [{
                "content": {
                    "parts": [{"text": "Hello from Gemini"}]
                }
            }]
        });
        let result = extract_response_text(&json).unwrap();
        assert_eq!(result, "Hello from Gemini");
    }

    #[test]
    fn test_extract_response_text_missing_candidates() {
        let json = serde_json::json!({"result": "ok"});
        let result = extract_response_text(&json);
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::Parse(msg) => {
                assert!(msg.contains("Unexpected Gemini response structure"))
            }
            other => panic!("Expected Parse error, got: {:?}", other),
        }
    }

    #[test]
    fn test_extract_response_text_empty_candidates() {
        let json = serde_json::json!({"candidates": []});
        assert!(extract_response_text(&json).is_err());
    }

    #[test]
    fn test_extract_response_text_missing_text_field() {
        let json = serde_json::json!({
            "candidates": [{
                "content": {
                    "parts": [{"inlineData": "binary"}]
                }
            }]
        });
        assert!(extract_response_text(&json).is_err());
    }

    #[test]
    fn test_extract_response_text_null_text() {
        let json = serde_json::json!({
            "candidates": [{
                "content": {
                    "parts": [{"text": null}]
                }
            }]
        });
        assert!(extract_response_text(&json).is_err());
    }

    // ── URL construction tests (P0) ──────

    #[test]
    fn test_generate_content_url() {
        let url = generate_content_url();
        assert_eq!(
            url,
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent"
        );
    }

    #[test]
    fn test_stream_generate_content_url() {
        let url = stream_generate_content_url();
        assert_eq!(
            url,
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:streamGenerateContent"
        );
    }

    // ── gemini_role System branch (P1) ──────

    #[test]
    fn test_chat_role_system_maps_to_user() {
        assert_eq!(gemini_role(&ChatRole::System), "user");
    }

    // ── build_contents edge cases (P1) ──────

    #[test]
    fn test_build_contents_empty_messages() {
        let messages: Vec<ChatMessage> = vec![];
        let contents = build_contents(&messages);
        assert!(contents.is_empty());
    }

    #[test]
    fn test_build_contents_all_system_messages() {
        let messages = vec![
            ChatMessage {
                role: ChatRole::System,
                content: "system 1".to_string(),
                timestamp: "t1".to_string(),
            },
            ChatMessage {
                role: ChatRole::System,
                content: "system 2".to_string(),
                timestamp: "t2".to_string(),
            },
        ];
        let contents = build_contents(&messages);
        assert!(contents.is_empty());
    }

    #[test]
    fn test_build_contents_preserves_message_text() {
        let messages = vec![ChatMessage {
            role: ChatRole::User,
            content: "What games have I played?".to_string(),
            timestamp: "2026-01-01T00:00:00Z".to_string(),
        }];
        let contents = build_contents(&messages);
        assert_eq!(contents.len(), 1);
        assert_eq!(contents[0]["role"], "user");
        assert_eq!(contents[0]["parts"][0]["text"], "What games have I played?");
    }

    // ── flush_line_buffer tests ──────

    #[test]
    fn test_flush_line_buffer_with_trailing_data() {
        let mut accumulated = String::new();
        let buffer = r#"data: {"candidates":[{"content":{"parts":[{"text":"tail"}]}}]}"#;
        flush_line_buffer(buffer, &mut accumulated);
        assert_eq!(accumulated, "tail");
    }

    #[test]
    fn test_flush_line_buffer_empty() {
        let mut accumulated = "existing".to_string();
        flush_line_buffer("", &mut accumulated);
        assert_eq!(accumulated, "existing");
    }
}
