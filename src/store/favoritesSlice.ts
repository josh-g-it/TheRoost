import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { favoritesApi } from "../services/tauri";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

interface FavoritesState {
  favorites: Set<string>;
  isLoading: boolean;
  loadFavorites: () => Promise<void>;
  toggleFavorite: (gameId: string) => Promise<void>;
  isFavorite: (gameId: string) => boolean;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: new Set(),
  isLoading: false,

  loadFavorites: async () => {
    set({ isLoading: true });
    try {
      const ids = await favoritesApi.getAllFavorites();
      logger.info("favoritesSlice", "favorites", "Favorites loaded", {
        count: ids.length,
      });
      set({ favorites: new Set(ids), isLoading: false });
    } catch (e) {
      logger.error("favoritesSlice", "favorites", "Failed to load favorites", {
        error: getErrorMessage(e),
      });
      set({ isLoading: false });
    }
  },

  toggleFavorite: async (gameId) => {
    const wasFavorite = get().favorites.has(gameId);
    const nowFavorite = !wasFavorite;
    // Optimistic update
    set((s) => {
      const next = new Set(s.favorites);
      if (nowFavorite) {
        next.add(gameId);
      } else {
        next.delete(gameId);
      }
      return { favorites: next };
    });
    try {
      await favoritesApi.toggleFavorite(gameId, nowFavorite);
      logger.info(
        "favoritesSlice",
        "favorites",
        nowFavorite ? "Favorited" : "Unfavorited",
        { gameId },
      );
    } catch (e) {
      // Revert on failure
      set((s) => {
        const reverted = new Set(s.favorites);
        if (wasFavorite) {
          reverted.add(gameId);
        } else {
          reverted.delete(gameId);
        }
        return { favorites: reverted };
      });
      logger.error("favoritesSlice", "favorites", "Failed to toggle favorite", {
        error: getErrorMessage(e),
      });
    }
  },

  isFavorite: (gameId) => get().favorites.has(gameId),
}));

// Cross-window sync: reload favorites when another window toggles via direct API.
listen("favorite-changed", () => {
  useFavoritesStore.getState().loadFavorites();
});
