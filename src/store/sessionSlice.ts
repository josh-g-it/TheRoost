import { create } from "zustand";
import type { GameSession } from "../types";
import { sessionApi } from "../services/tauri";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

interface SessionState {
  gameSessions: GameSession[];
  recentSessions: GameSession[];
  activeSessions: GameSession[];
  isLoading: boolean;
  loadGameSessions: (gameId: string, limit?: number) => Promise<void>;
  loadRecentSessions: (limit?: number) => Promise<void>;
  loadActiveSessions: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  gameSessions: [],
  recentSessions: [],
  activeSessions: [],
  isLoading: false,

  loadGameSessions: async (gameId: string, limit = 50) => {
    set({ isLoading: true });
    try {
      const gameSessions = await sessionApi.getGameSessions(gameId, limit);
      set({ gameSessions, isLoading: false });
    } catch (e) {
      logger.error("sessionSlice", "session", "Failed to load game sessions", {
        gameId,
        error: getErrorMessage(e),
      });
      set({ isLoading: false });
    }
  },

  loadRecentSessions: async (limit = 20) => {
    set({ isLoading: true });
    try {
      const recentSessions = await sessionApi.getRecentSessions(limit);
      set({ recentSessions, isLoading: false });
    } catch (e) {
      logger.error("sessionSlice", "session", "Failed to load recent sessions", {
        error: getErrorMessage(e),
      });
      set({ isLoading: false });
    }
  },

  loadActiveSessions: async () => {
    try {
      const activeSessions = await sessionApi.getActiveSessions();
      set({ activeSessions });
    } catch (e) {
      logger.error("sessionSlice", "session", "Failed to load active sessions", {
        error: getErrorMessage(e),
      });
    }
  },
}));
