import { create } from "zustand";
import type { GameRating } from "../types";
import { ratingsApi } from "../services/tauri";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

interface RatingsState {
  ratings: Map<string, GameRating>;
  isLoading: boolean;
  error: string | null;

  loadAllRatings: () => Promise<void>;
  saveRating: (gameId: string, rating: number, review: string | null) => Promise<void>;
  deleteRating: (gameId: string) => Promise<void>;
}

export const useRatingsStore = create<RatingsState>((set) => ({
  ratings: new Map(),
  isLoading: false,
  error: null,

  loadAllRatings: async () => {
    set({ isLoading: true, error: null });
    try {
      const all = await ratingsApi.getAllRatings();
      const map = new Map(all.map((r) => [r.gameId, r]));
      logger.info("ratingsSlice", "library", "Ratings loaded", { count: all.length });
      set({ ratings: map, isLoading: false });
    } catch (e) {
      const msg = getErrorMessage(e);
      logger.error("ratingsSlice", "library", "Failed to load ratings", { error: msg });
      set({ error: msg, isLoading: false });
    }
  },

  saveRating: async (gameId, rating, review) => {
    try {
      const saved = await ratingsApi.saveGameRating(gameId, rating, review);
      set((s) => {
        const next = new Map(s.ratings);
        next.set(gameId, saved);
        return { ratings: next };
      });
    } catch (e) {
      logger.error("ratingsSlice", "library", "Failed to save rating", {
        error: getErrorMessage(e),
      });
    }
  },

  deleteRating: async (gameId) => {
    try {
      await ratingsApi.deleteGameRating(gameId);
      set((s) => {
        const next = new Map(s.ratings);
        next.delete(gameId);
        return { ratings: next };
      });
    } catch (e) {
      logger.error("ratingsSlice", "library", "Failed to delete rating", {
        error: getErrorMessage(e),
      });
    }
  },
}));
