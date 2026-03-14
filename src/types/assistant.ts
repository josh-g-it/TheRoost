export interface AiPersonality {
  id: string;
  name: string;
  promptText: string;
  isBuiltin: boolean;
  createdAt: string;
}

export interface AiAvatar {
  id: string;
  name: string;
  personalityId: string;
  imagePath: string | null;
  companionRoleId: string | null;
  companionRoleCustom: string | null;
  isActive: boolean;
  createdAt: string;
  crossAvatarMemoryAccess: boolean;
  crossAvatarMemoryPrivate: boolean;
}

export interface AvatarStats {
  memoryCount: number;
  journalCount: number;
  createdAt: string;
}

export interface CompanionRolePreset {
  id: string;
  name: string;
  description: string;
  systemPromptText: string;
  isBuiltin: boolean;
}

export interface AiConversation {
  id: string;
  avatarId: string;
  startedAt: string;
  endedAt: string | null;
  summary: string | null;
  messageCount: number;
  /** Compaction status: 0 = pending, 1 = success, 2 = failed */
  compacted: number;
}

/** An image attached to a chat message. */
export interface ImageAttachment {
  mimeType: string;
  /** Base64-encoded image data. */
  data: string;
  /** Short caption generated after sending (for smart placeholders in older messages). */
  caption?: string;
}

/** Result of preparing an image for chat attachment. */
export interface PreparedImage {
  mimeType: string;
  data: string;
  previewUrl: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  tokenEstimate: number;
  /** Encrypted JSON of ImageAttachment[] — decrypted on the Rust side for display. */
  attachments?: ImageAttachment[];
}

export interface AiMemory {
  id: string;
  avatarId: string;
  conversationId: string | null;
  content: string;
  importance: number;
  category: "preference" | "opinion" | "fact" | "general" | "system";
  isSystem: boolean;
  createdAt: string;
  lastReferenced: string | null;
  supersededBy: string | null;
  active: boolean;
}

export interface AiDailyLog {
  id: string;
  avatarId: string;
  conversationId: string;
  logDate: string;
  summary: string;
  createdAt: string;
}

export interface ConversationEndedPayload {
  conversationId: string;
  reason: "manual" | "timer";
}

/** Payload for `ai-user-message` cross-window sync event. */
export interface UserMessagePayload {
  conversationId: string;
  content: string;
  /** Unix timestamp (seconds) — used to deduplicate messages from the local window. */
  timestamp: number;
}

/** Payload for `ai-compaction-started` and `ai-compaction-complete` events. */
export interface CompactionEventPayload {
  conversationId: string;
}

export interface ActionSuggestion {
  actionId: string;
  description: string;
  tier: 1 | 2;
  requiresConfirmation: boolean;
}

export interface ReviewConfirmationData {
  gameId: string;
  gameName: string;
  stars: number;
  reviewText: string;
}

/** A resolved action returned from Rust validation + game name resolution. */
export interface ResolvedAction {
  /** The resolved action ID (game name replaced with UUID for game-targeting actions). */
  actionId: string;
  /** The original action ID as the AI generated it (e.g., "favorite:Elden Ring"). */
  originalActionId: string;
  /** Execution tier: 1 = auto-execute, 2 = confirmation required. */
  tier: number;
  /** Human-readable description for Tier 2 confirmation cards. */
  description?: string;
  /** Extra data (review text, star rating, note text, shelf name). */
  payload?: Record<string, unknown>;
  /** The resolved display name (e.g., "Elden Ring") for confirmation cards. */
  resolvedName?: string;
}

/** Result set from validate_and_resolve_ai_actions IPC. */
export interface ResolvedActionSet {
  actions: ResolvedAction[];
  rejectedCount: number;
}

/** Pipeline execution status for the action state machine. */
export type PipelineStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "canceled"
  | "delaying";

/** Result of executing a single action in the pipeline. */
export interface ActionResult {
  actionId: string;
  originalActionId: string;
  success: boolean;
  error?: string;
  executedAt: string;
  /** True when a Tier 2 action was explicitly confirmed by the user before execution. */
  confirmed?: boolean;
}

// ── Streaming Types ──────────────────────────────────────────────

/** Payload emitted via `ai-stream-chunk` for progressive text rendering. */
export interface StreamChunkPayload {
  conversationId: string;
  text: string;
}

// ── Sprite Types ─────────────────────────────────────────────────

export interface SpriteInfo {
  filename: string;
  displayName: string;
  source: "prebuilt" | "generated" | "uploaded";
  fileSizeBytes: number;
  createdAt: string;
}

export type Expression =
  | "neutral"
  | "speaking"
  | "listening"
  | "sleepy"
  | "happy"
  | "sad"
  | "interested"
  | "bored";

export const EXPRESSION_GRID: Expression[] = [
  "neutral",
  "speaking",
  "listening",
  "sleepy", // Row 0
  "happy",
  "sad",
  "interested",
  "bored", // Row 1
];

export const EXPRESSION_LABELS: Record<Expression, string> = {
  neutral: "Neutral",
  speaking: "Speaking",
  listening: "Listening",
  sleepy: "Sleepy",
  happy: "Happy",
  sad: "Sad",
  interested: "Interested",
  bored: "Bored",
};

export interface SpriteCropOffsets {
  version: number;
  cells: Array<{ x: number; y: number }>;
}
