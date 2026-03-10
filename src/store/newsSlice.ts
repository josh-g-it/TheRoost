import { create } from "zustand";
import type { GameNewsItem, FeedNewsItem } from "../types";
import { newsApi } from "../services/tauri";
import { useSettingsStore } from "./settingsSlice";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

interface NewsState {
  // Per-game cache (existing)
  cache: Map<string, GameNewsItem[]>;
  loading: Set<string>;
  followedGameIds: number[] | null;

  // Aggregated feed
  feed: FeedNewsItem[];
  feedLoading: boolean;
  feedError: string | null;
  unreadCount: number;

  // Per-game actions (existing)
  fetchGameNews: (gameId: string) => Promise<GameNewsItem[]>;
  fetchFollowedGames: () => Promise<void>;
  getNews: (gameId: string) => GameNewsItem[] | undefined;

  // Feed actions
  fetchNewsFeed: (force?: boolean) => Promise<void>;
  markNewsRead: (newsId: string, gameId: string) => Promise<void>;
  markAllFeedRead: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
}

export const useNewsStore = create<NewsState>((set, get) => ({
  cache: new Map(),
  loading: new Set(),
  followedGameIds: null,

  feed: [],
  feedLoading: false,
  feedError: null,
  unreadCount: 0,

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
    if (!settings?.steamId) return;

    try {
      const ids = await newsApi.fetchFollowedGames(settings.steamId);
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

  fetchNewsFeed: async (force?: boolean) => {
    if (get().feedLoading) return;
    set({ feedLoading: true, feedError: null });

    try {
      const blockedSources =
        useSettingsStore.getState().settings?.newsBlockedSources ?? [];
      const items = await newsApi.fetchNewsFeed(force, blockedSources);
      const unreadCount = items.filter((i) => !i.isRead).length;
      set({ feed: items, unreadCount });
      logger.info("newsSlice", "news", "News feed fetched", {
        total: items.length,
        unread: unreadCount,
        blockedSources: blockedSources.length,
      });
    } catch (e) {
      const msg = getErrorMessage(e);
      set({ feedError: msg });
      logger.error("newsSlice", "news", "Failed to fetch news feed", {
        error: msg,
      });
    } finally {
      set({ feedLoading: false });
    }
  },

  markNewsRead: async (newsId: string, gameId: string) => {
    try {
      await newsApi.markNewsRead(newsId, gameId);
      // Update local state
      const feed = get().feed.map((item) =>
        item.newsId === newsId ? { ...item, isRead: true } : item,
      );
      const unreadCount = feed.filter((i) => !i.isRead).length;
      set({ feed, unreadCount });
    } catch (e) {
      logger.error("newsSlice", "news", "Failed to mark news read", {
        newsId,
        error: getErrorMessage(e),
      });
    }
  },

  markAllFeedRead: async () => {
    const { feed } = get();
    const unread = feed.filter((i) => !i.isRead);
    if (unread.length === 0) return;

    try {
      // Mark each unread item as read
      await Promise.all(
        unread.map((item) => newsApi.markNewsRead(item.newsId, item.gameId)),
      );
      set({
        feed: feed.map((item) => ({ ...item, isRead: true })),
        unreadCount: 0,
      });
    } catch (e) {
      logger.error("newsSlice", "news", "Failed to mark all news read", {
        error: getErrorMessage(e),
      });
    }
  },

  refreshUnreadCount: async () => {
    try {
      const count = await newsApi.getUnreadNewsCount();
      set({ unreadCount: count });
    } catch (e) {
      logger.error("newsSlice", "news", "Failed to refresh unread count", {
        error: getErrorMessage(e),
      });
    }
  },
}));
