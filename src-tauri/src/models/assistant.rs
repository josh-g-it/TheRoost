use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiPersonality {
    pub id: String,
    pub name: String,
    pub prompt_text: String,
    pub is_builtin: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAvatar {
    pub id: String,
    pub name: String,
    pub personality_id: String,
    pub image_path: Option<String>,
    pub is_active: bool,
    pub created_at: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConversation {
    pub id: String,
    pub avatar_id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub summary: Option<String>,
    pub message_count: u32,
    pub compacted: bool,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub token_estimate: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMemory {
    pub id: String,
    pub avatar_id: String,
    pub conversation_id: Option<String>,
    pub content: String,
    pub importance: u32,
    pub category: String,
    pub is_system: bool,
    pub created_at: String,
    pub last_referenced: Option<String>,
    pub superseded_by: Option<String>,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiDailyLog {
    pub id: String,
    pub avatar_id: String,
    pub conversation_id: String,
    pub log_date: String,
    pub summary: String,
    pub created_at: String,
}

/// Structured output from the compaction prompt (internal, not sent to frontend)
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactionResult {
    pub summary: String,
    pub memories: Vec<CompactionMemory>,
    pub superseded_memories: Vec<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactionMemory {
    pub content: String,
    pub importance: u32,
    pub category: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ai_memory_serde_camel_case() {
        let mem = AiMemory {
            id: "m1".into(),
            avatar_id: "a1".into(),
            conversation_id: Some("c1".into()),
            content: "test content".into(),
            importance: 5,
            category: "general".into(),
            is_system: false,
            created_at: "2026-02-27".into(),
            last_referenced: Some("2026-02-27".into()),
            superseded_by: None,
            active: true,
        };
        let json = serde_json::to_string(&mem).unwrap();
        assert!(json.contains("avatarId"));
        assert!(json.contains("conversationId"));
        assert!(json.contains("isSystem"));
        assert!(json.contains("lastReferenced"));
        assert!(json.contains("supersededBy"));
        assert!(!json.contains("avatar_id"));
        let back: AiMemory = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, "m1");
        assert_eq!(back.importance, 5);
    }

    #[test]
    fn test_ai_avatar_serde_camel_case() {
        let avatar = AiAvatar {
            id: "a1".into(),
            name: "TestBot".into(),
            personality_id: "p1".into(),
            image_path: None,
            is_active: true,
            created_at: "2026-02-27".into(),
        };
        let json = serde_json::to_string(&avatar).unwrap();
        assert!(json.contains("personalityId"));
        assert!(json.contains("isActive"));
        assert!(json.contains("imagePath"));
        assert!(!json.contains("personality_id"));
        let back: AiAvatar = serde_json::from_str(&json).unwrap();
        assert_eq!(back.name, "TestBot");
    }

    #[test]
    fn test_ai_personality_serde_camel_case() {
        let p = AiPersonality {
            id: "p1".into(),
            name: "Test".into(),
            prompt_text: "You are a test".into(),
            is_builtin: false,
            created_at: "2026-02-27".into(),
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("promptText"));
        assert!(json.contains("isBuiltin"));
        assert!(!json.contains("prompt_text"));
        let back: AiPersonality = serde_json::from_str(&json).unwrap();
        assert_eq!(back.prompt_text, "You are a test");
    }

    #[test]
    fn test_ai_daily_log_serde_camel_case() {
        let log = AiDailyLog {
            id: "l1".into(),
            avatar_id: "a1".into(),
            conversation_id: "c1".into(),
            log_date: "2026-02-27".into(),
            summary: "Had a chat".into(),
            created_at: "2026-02-27".into(),
        };
        let json = serde_json::to_string(&log).unwrap();
        assert!(json.contains("avatarId"));
        assert!(json.contains("logDate"));
        assert!(!json.contains("avatar_id"));
        let back: AiDailyLog = serde_json::from_str(&json).unwrap();
        assert_eq!(back.log_date, "2026-02-27");
    }
}
