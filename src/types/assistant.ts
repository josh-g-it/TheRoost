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
