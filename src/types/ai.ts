export type ResolutionTier = "pattern_matcher" | "cloud_api";

export type CloudProvider = "gemini" | "openai" | "claude";

export interface IntentAction {
  actionId: string;
  gameId?: string;
  description: string;
}

export interface ResolvedIntent {
  actions: IntentAction[];
  tier: ResolutionTier;
  confidence: number;
  summary: string;
  originalQuery: string;
}

export interface CloudAiUsage {
  requestsToday: number;
  dailyLimit: number;
  provider: string;
  lastResetDate: string;
}
