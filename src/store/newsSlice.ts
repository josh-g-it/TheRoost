import { create } from "zustand";
import type { GameNewsItem } from "../types";
import { newsApi } from "../services/tauri";
import { useSettingsStore } from "./settingsSlice";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

interface NewsState {
  cache: Map<string, GameNewsItem[]>;
  loading: Set<string>;
  followedGameIds: number[] | null;

  fetchGameNews: (gameId: string) => Promise<GameNewsItem[]>;
  fetchFollowedGames: () => Promise<void>;
  getNews: (gameId: string) => GameNewsItem[] | undefined;
}

export const useNewsStore = create<NewsState>((set, get) => ({
  cache: new Map(),
  loading: new Set(),
  followedGameIds: null,

  fetchGameNews: async (gameId: string) => {
    const { cache, loading } = get();

    // Return cached
    const cached = cache.get(gameId);
    if (cached) return cached;

    // Skip if already loading
    if (loading.has(gameId)) return [];

    set({ loading: new Set([...loading, gameId]) });

    try {
      const items = await newsApi.fetchGameNews(gameId);
      const newCache = new Map(get().cache);
      newCache.set(gameId, items);
      set({ cache: newCache });
      return items;
    } catch (e) {
      logger.error("newsSlice", "news", "Failed to fetch game news", {
        gameId,
        error: getErrorMessage(e),
      });
      return [];
    } finally {
      const updated = new Set(get().loading);
      updated.delete(gameId);
      set({ loading: updated });
    }
  },

  fetchFollowedGames: async () => {
    const settings = useSettingsStore.getState().settings;
    if (!settings?.steamApiKey || !settings?.steamId) return;

    try {
      const ids = await newsApi.fetchFollowedGames(
        settings.steamApiKey,
        settings.steamId,
      );
      set({ followedGameIds: ids });
      logger.info("newsSlice", "news", "Followed games fetched", {
        count: ids.length,
      });
    } catch (e) {
      logger.error("newsSlice", "news", "Failed to fetch followed games", {
        error: getErrorMessage(e),
      });
    }
  },

  getNews: (gameId: string) => {
    return get().cache.get(gameId);
  },
}));
