use serde::{Deserialize, Serialize};

// ── Sprite Types ─────────────────────────────────────────────────

/// Sprite metadata returned by list_sprites (filesystem scan)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpriteInfo {
    pub filename: String,
    pub display_name: String,
    pub source: SpriteSource,
    pub file_size_bytes: u64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SpriteSource {
    Prebuilt,
    Generated,
    Uploaded,
}

/// Per-cell crop offsets stored in JSON sidecar
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpriteCropOffsets {
    #[serde(default = "SpriteCropOffsets::default_version")]
    pub version: u32,
    pub cells: Vec<CellOffset>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct CellOffset {
    pub x: i32,
    pub y: i32,
}

impl SpriteCropOffsets {
    fn default_version() -> u32 {
        1
    }
}

impl Default for SpriteCropOffsets {
    fn default() -> Self {
        Self {
            version: 1,
            cells: vec![CellOffset { x: 0, y: 0 }; 8],
        }
    }
}

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
    pub companion_role_id: Option<String>,
    pub companion_role_custom: Option<String>,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionRolePreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt_text: String,
    #[serde(default)]
    pub is_builtin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConversation {
    pub id: String,
    pub avatar_id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub summary: Option<String>,
    pub message_count: u32,
    /// Compaction status: 0 = pending, 1 = success, 2 = failed
    pub compacted: u8,
}

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
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactionResult {
    pub summary: String,
    /// Optional journal entry — a more personal/narrative account of the conversation.
    /// Falls back to `summary` if the LLM doesn't provide it.
    #[serde(default)]
    pub journal_entry: Option<String>,
    pub memories: Vec<CompactionMemory>,
    pub superseded_memories: Vec<String>,
}

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
            companion_role_id: Some("gaming-companion".into()),
            companion_role_custom: None,
            is_active: true,
            created_at: "2026-02-27".into(),
        };
        let json = serde_json::to_string(&avatar).unwrap();
        assert!(json.contains("personalityId"));
        assert!(json.contains("isActive"));
        assert!(json.contains("imagePath"));
        assert!(json.contains("companionRoleId"));
        assert!(json.contains("companionRoleCustom"));
        assert!(!json.contains("personality_id"));
        assert!(!json.contains("companion_role_id"));
        let back: AiAvatar = serde_json::from_str(&json).unwrap();
        assert_eq!(back.name, "TestBot");
        assert_eq!(back.companion_role_id.as_deref(), Some("gaming-companion"));
        assert!(back.companion_role_custom.is_none());
    }

    #[test]
    fn test_companion_role_preset_serde() {
        let role = super::CompanionRolePreset {
            id: "gaming-companion".into(),
            name: "Gaming Companion".into(),
            description: "Balanced approach".into(),
            system_prompt_text: "a gaming companion".into(),
            is_builtin: true,
        };
        let json = serde_json::to_string(&role).unwrap();
        assert!(json.contains("systemPromptText"));
        assert!(!json.contains("system_prompt_text"));
        let back: super::CompanionRolePreset = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, "gaming-companion");
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
