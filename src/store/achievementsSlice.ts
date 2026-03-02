import { create } from "zustand";
import type { GameAchievementSummary } from "../types";
import { achievementsApi } from "../services/tauri";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

interface AchievementsState {
  cache: Map<string, GameAchievementSummary>;
  loading: Set<string>;
  profileStats: Map<string, { total: number; unlocked: number }> | null;
  batchFetched: boolean;
  privacyError: string | null;

  fetchGameAchievements: (gameId: string) => Promise<GameAchievementSummary | null>;
  batchFetchAll: () => Promise<void>;
  loadProfileStats: () => Promise<void>;
  getAchievements: (gameId: string) => GameAchievementSummary | undefined;
  resetCache: () => void;
}

export const useAchievementsStore = create<AchievementsState>((set, get) => ({
  cache: new Map(),
  loading: new Set(),
  profileStats: null,
  batchFetched: false,
  privacyError: null,

  fetchGameAchievements: async (gameId: string) => {
    const { cache, loading } = get();

    // Return cached
    const cached = cache.get(gameId);
    if (cached) return cached;

    // Skip if already loading
    if (loading.has(gameId)) return null;

    set({ loading: new Set([...loading, gameId]) });

    try {
      const summary = await achievementsApi.fetchGameAchievements(gameId);

      const newCache = new Map(get().cache);
      newCache.set(gameId, summary);
      set({ cache: newCache });
      return summary;
    } catch (e) {
      const msg = getErrorMessage(e);
      logger.error("achievementsSlice", "achievements", "Achievement fetch failed", {
        gameId,
        error: msg,
      });
      if (msg.toLowerCase().includes("private") || msg.includes("403")) {
        set({ privacyError: msg });
      }
      return null;
    } finally {
      const updated = new Set(get().loading);
      updated.delete(gameId);
      set({ loading: updated });
    }
  },

  batchFetchAll: async () => {
    if (get().batchFetched) return;

    set({ batchFetched: true });

    logger.info(
      "achievementsSlice",
      "achievements",
      "Starting background batch achievement fetch",
    );

    try {
      const count = await achievementsApi.batchFetchAchievements();
      logger.info(
        "achievementsSlice",
        "achievements",
        "Batch achievement fetch complete",
        { fetched: count },
      );

      // Reload profile stats after batch completes
      if (count > 0) {
        get().loadProfileStats();
      }
    } catch (e) {
      const msg = getErrorMessage(e);
      logger.error(
        "achievementsSlice",
        "achievements",
        "Batch achievement fetch failed",
        { error: msg },
      );
      if (msg.toLowerCase().includes("private") || msg.includes("403")) {
        set({ privacyError: msg });
      }
      // Allow retry on next mount
      set({ batchFetched: false });
    }
  },

  loadProfileStats: async () => {
    try {
      const stats = await achievementsApi.getAllAchievementStats();
      const map = new Map<string, { total: number; unlocked: number }>();
      for (const [gameId, total, unlocked] of stats) {
        map.set(gameId, { total, unlocked });
      }
      set({ profileStats: map });
    } catch (e) {
      logger.error("achievementsSlice", "achievements", "Failed to load profile stats", {
        error: getErrorMessage(e),
      });
    }
  },

  getAchievements: (gameId: string) => {
    return get().cache.get(gameId);
  },

  resetCache: () => {
    set({
      cache: new Map(),
      batchFetched: false,
      privacyError: null,
      profileStats: null,
    });
  },
}));
