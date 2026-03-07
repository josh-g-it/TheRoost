import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { hiddenGamesApi } from "../services/tauri";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

interface HiddenGamesState {
  hiddenGames: Set<string>;
  isLoading: boolean;
  loadHiddenGames: () => Promise<void>;
  toggleHidden: (gameId: string) => Promise<void>;
  isHidden: (gameId: string) => boolean;
}

export const useHiddenGamesStore = create<HiddenGamesState>((set, get) => ({
  hiddenGames: new Set(),
  isLoading: false,

  loadHiddenGames: async () => {
    set({ isLoading: true });
    try {
      const ids = await hiddenGamesApi.getAllHidden();
      logger.info("hiddenGamesSlice", "hidden", "Hidden games loaded", {
        count: ids.length,
      });
      set({ hiddenGames: new Set(ids), isLoading: false });
    } catch (e) {
      logger.error("hiddenGamesSlice", "hidden", "Failed to load hidden games", {
        error: getErrorMessage(e),
      });
      set({ isLoading: false });
    }
  },

  toggleHidden: async (gameId) => {
    const wasHidden = get().hiddenGames.has(gameId);
    const nowHidden = !wasHidden;
    // Optimistic update
    set((s) => {
      const next = new Set(s.hiddenGames);
      if (nowHidden) {
        next.add(gameId);
      } else {
        next.delete(gameId);
      }
      return { hiddenGames: next };
    });
    try {
      await hiddenGamesApi.toggleHidden(gameId, nowHidden);
      logger.info(
        "hiddenGamesSlice",
        "hidden",
        nowHidden ? "Game hidden" : "Game unhidden",
        { gameId },
      );
    } catch (e) {
      // Revert on failure
      set((s) => {
        const reverted = new Set(s.hiddenGames);
        if (wasHidden) {
          reverted.add(gameId);
        } else {
          reverted.delete(gameId);
        }
        return { hiddenGames: reverted };
      });
      logger.error("hiddenGamesSlice", "hidden", "Failed to toggle hidden", {
        error: getErrorMessage(e),
      });
    }
  },

  isHidden: (gameId) => get().hiddenGames.has(gameId),
}));

// Cross-window sync: reload hidden games when another window toggles via direct API.
listen("hidden-changed", () => {
  useHiddenGamesStore.getState().loadHiddenGames();
});
