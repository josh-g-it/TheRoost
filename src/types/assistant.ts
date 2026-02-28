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
  isActive: boolean;
  createdAt: string;
}

export interface AiConversation {
  id: string;
  avatarId: string;
  startedAt: string;
  endedAt: string | null;
  summary: string | null;
  messageCount: number;
  compacted: boolean;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  tokenEstimate: number;
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

export interface StreamChunk {
  conversationId: string;
  text: string;
  isFinal: boolean;
}

export interface ConversationEndedPayload {
  conversationId: string;
  reason: "manual" | "timer";
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
export type PipelineStatus = "idle" | "running" | "paused" | "completed" | "canceled";

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
