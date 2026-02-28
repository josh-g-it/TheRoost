use std::future::Future;
use std::pin::Pin;

use serde::{Deserialize, Serialize};

use crate::utils::error::AppError;

/// A message in a multi-turn conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
    pub timestamp: String,
}

/// Role in a conversation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ChatRole {
    User,
    Assistant,
    System,
}

/// A chunk of streamed response text.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamChunk {
    pub conversation_id: String,
    pub text: String,
    pub is_final: bool,
}

/// Trait for cloud AI providers.
pub trait CloudProviderApi: Send + Sync {
    /// Single-shot query (for compaction, TTS, summarization).
    fn send_query(
        &self,
        system_prompt: &str,
        user_message: &str,
        api_key: &str,
    ) -> Pin<Box<dyn Future<Output = Result<String, AppError>> + Send + '_>>;

    /// Streaming multi-turn conversation. Returns accumulated response text.
    fn send_conversation_stream(
        &self,
        system_prompt: &str,
        messages: &[ChatMessage],
        api_key: &str,
        chunk_tx: tokio::sync::mpsc::Sender<StreamChunk>,
        conversation_id: &str,
        max_output_tokens: Option<u32>,
    ) -> Pin<Box<dyn Future<Output = Result<String, AppError>> + Send + '_>>;

    /// Human-readable provider name.
    fn name(&self) -> &'static str;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_role_serializes_to_snake_case() {
        assert_eq!(serde_json::to_string(&ChatRole::User).unwrap(), "\"user\"");
        assert_eq!(
            serde_json::to_string(&ChatRole::Assistant).unwrap(),
            "\"assistant\""
        );
        assert_eq!(
            serde_json::to_string(&ChatRole::System).unwrap(),
            "\"system\""
        );
    }

    #[test]
    fn test_chat_role_deserializes_from_snake_case() {
        let user: ChatRole = serde_json::from_str("\"user\"").unwrap();
        assert_eq!(user, ChatRole::User);
        let assistant: ChatRole = serde_json::from_str("\"assistant\"").unwrap();
        assert_eq!(assistant, ChatRole::Assistant);
        let system: ChatRole = serde_json::from_str("\"system\"").unwrap();
        assert_eq!(system, ChatRole::System);
    }

    #[test]
    fn test_chat_message_serializes_camel_case() {
        let msg = ChatMessage {
            role: ChatRole::User,
            content: "hello".to_string(),
            timestamp: "2026-01-01T00:00:00Z".to_string(),
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert!(json.get("role").is_some());
        assert!(json.get("content").is_some());
        assert!(json.get("timestamp").is_some());
    }

    #[test]
    fn test_stream_chunk_serializes_camel_case() {
        let chunk = StreamChunk {
            conversation_id: "conv-1".to_string(),
            text: "hello".to_string(),
            is_final: true,
        };
        let json = serde_json::to_value(&chunk).unwrap();
        assert!(json.get("conversationId").is_some());
        assert!(json.get("isFinal").is_some());
        // Must NOT have snake_case
        assert!(json.get("conversation_id").is_none());
        assert!(json.get("is_final").is_none());
    }

    #[test]
    fn test_stream_chunk_round_trip() {
        let chunk = StreamChunk {
            conversation_id: "conv-1".to_string(),
            text: "hello world".to_string(),
            is_final: false,
        };
        let serialized = serde_json::to_string(&chunk).unwrap();
        let deserialized: StreamChunk = serde_json::from_str(&serialized).unwrap();
        assert_eq!(deserialized.conversation_id, "conv-1");
        assert_eq!(deserialized.text, "hello world");
        assert!(!deserialized.is_final);
    }
}
