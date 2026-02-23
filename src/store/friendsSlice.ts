import { create } from "zustand";
import type { FriendInfo, FriendLibrary } from "../types";
import { friendsApi } from "../services/tauri";
import { useSettingsStore } from "./settingsSlice";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

interface FriendsState {
  friends: FriendInfo[];
  friendLibraries: Map<string, FriendLibrary>;
  isLoading: boolean;

  fetchFriends: () => Promise<void>;
  fetchFriendLibrary: (friendSteamId: string) => Promise<FriendLibrary | null>;
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  friendLibraries: new Map(),
  isLoading: false,

  fetchFriends: async () => {
    const settings = useSettingsStore.getState().settings;
    if (!settings?.steamApiKey || !settings?.steamId) return;

    set({ isLoading: true });

    try {
      const friends = await friendsApi.fetchFriendsList(
        settings.steamApiKey,
        settings.steamId,
      );
      set({ friends });
      logger.info("friendsSlice", "friends", "Friends list fetched", {
        count: friends.length,
      });
    } catch (e) {
      logger.error("friendsSlice", "friends", "Failed to fetch friends", {
        error: getErrorMessage(e),
      });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchFriendLibrary: async (friendSteamId: string) => {
    const { friendLibraries } = get();

    // Return cached
    const cached = friendLibraries.get(friendSteamId);
    if (cached) return cached;

    const settings = useSettingsStore.getState().settings;
    if (!settings?.steamApiKey) {
      return null;
    }

    try {
      const library = await friendsApi.fetchFriendLibrary(
        settings.steamApiKey,
        friendSteamId,
      );
      const newMap = new Map(get().friendLibraries);
      newMap.set(friendSteamId, library);
      set({ friendLibraries: newMap });
      return library;
    } catch (e) {
      logger.error("friendsSlice", "friends", "Failed to fetch friend library", {
        friendSteamId,
        error: getErrorMessage(e),
      });
      return null;
    }
  },
}));
