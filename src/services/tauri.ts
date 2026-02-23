import { invoke } from "@tauri-apps/api/core";
import type {
  Game,
  GameLibrary,
  AppSettings,
  PlayerSummary,
  StoreMetadata,
  GameSession,
  Tag,
  CreateTagRequest,
  UpdateTagRequest,
  ReorderTagsRequest,
  GameTagAssignment,
  SavedFilter,
  LibraryFilters,
  SortBy,
  SortOrder,
  GameAchievementSummary,
  FriendInfo,
  FriendLibrary,
  GameNewsItem,
  GameNote,
  GameNoteWithName,
  SystemMetricsSnapshot,
  MediaSessionSnapshot,
  MediaBookmark,
  CreateMediaBookmarkRequest,
  UpdateMediaBookmarkRequest,
  ReorderMediaBookmarksRequest,
  AudioSnapshot,
  ResolvedIntent,
  CloudAiUsage,
  UpdateInfo,
} from "../types";

export const steamApi = {
  scanLocalLibrary: () => invoke<Game[]>("scan_local_library"),

  getFullLibrary: (apiKey: string, steamId: string) =>
    invoke<GameLibrary>("get_full_library", { apiKey, steamId }),

  fetchOwnedGames: (apiKey: string, steamId: string) =>
    invoke<Game[]>("fetch_owned_games", { apiKey, steamId }),

  fetchRecentGames: (apiKey: string, steamId: string) =>
    invoke<Game[]>("fetch_recent_games", { apiKey, steamId }),

  fetchPlayerSummary: (apiKey: string, steamId: string) =>
    invoke<PlayerSummary>("fetch_player_summary", { apiKey, steamId }),

  resolveSteamAccount: (apiKey: string, input: string) =>
    invoke<PlayerSummary>("resolve_steam_account", { apiKey, input }),
};

export const settingsApi = {
  load: () => invoke<AppSettings>("load_settings"),
  save: (settings: AppSettings) => invoke("save_settings", { settings }),
};

export const gameApi = {
  launch: (gameId: string) => invoke("launch_game", { gameId }),
  getLaunchMode: (gameId: string) => invoke<string>("get_launch_mode", { gameId }),
  setLaunchMode: (gameId: string, launchMode: string) =>
    invoke("set_launch_mode", { gameId, launchMode }),
};

export const metadataApi = {
  fetchGameMetadata: (gameId: string) =>
    invoke<StoreMetadata | null>("fetch_game_metadata", { gameId }),

  fetchLibraryMetadata: (gameIds: string[]) =>
    invoke<[string, StoreMetadata | null][]>("fetch_library_metadata", {
      gameIds,
    }),

  invalidateCache: () => invoke<number>("invalidate_metadata_cache"),

  backfillSteamTags: () => invoke<number>("backfill_steam_tags"),

  backfillStoreDetails: () => invoke<number>("backfill_store_details"),
};

export const sessionApi = {
  getGameSessions: (gameId: string, limit: number) =>
    invoke<GameSession[]>("get_game_sessions", { gameId, limit }),

  getRecentSessions: (limit: number) =>
    invoke<GameSession[]>("get_recent_sessions", { limit }),

  getActiveSessions: () => invoke<GameSession[]>("get_active_sessions"),
};

export const tagsApi = {
  getAllTags: () => invoke<Tag[]>("get_all_tags"),
  createTag: (request: CreateTagRequest) => invoke<Tag>("create_tag", { request }),
  updateTag: (request: UpdateTagRequest) => invoke("update_tag", { request }),
  deleteTag: (id: number) => invoke("delete_tag", { id }),
  reorderTags: (request: ReorderTagsRequest) => invoke("reorder_tags", { request }),
  setGameTags: (assignment: GameTagAssignment) => invoke("set_game_tags", { assignment }),
  getGameTagIds: (gameId: string) => invoke<number[]>("get_game_tag_ids", { gameId }),
  getAllGameTags: () => invoke<[string, number][]>("get_all_game_tags"),
  bulkAddTag: (gameIds: string[], tagIds: number[]) =>
    invoke("bulk_add_tag", { gameIds, tagIds }),
};

export const favoritesApi = {
  toggleFavorite: (gameId: string, isFavorite: boolean) =>
    invoke("toggle_favorite", { gameId, isFavorite }),
  getAllFavorites: () => invoke<string[]>("get_all_favorites"),
};

export const hiddenGamesApi = {
  toggleHidden: (gameId: string, isHidden: boolean) =>
    invoke("toggle_hidden", { gameId, isHidden }),
  getAllHidden: () => invoke<string[]>("get_all_hidden"),
};

/** Raw row from Rust — filterJson is a string, not parsed */
interface SavedFilterRow {
  id: number;
  name: string;
  filterJson: string;
  sortBy?: string | null;
  sortOrder?: string | null;
}

function parseSavedFilterRow(row: SavedFilterRow): SavedFilter | null {
  try {
    return {
      id: row.id,
      name: row.name,
      filters: JSON.parse(row.filterJson) as LibraryFilters,
      sortBy: (row.sortBy as SortBy) ?? undefined,
      sortOrder: (row.sortOrder as SortOrder) ?? undefined,
    };
  } catch {
    console.warn(`Skipping saved filter "${row.name}" (id=${row.id}): corrupted JSON`);
    return null;
  }
}

export const externalApi = {
  scanExternalGames: () => invoke<GameLibrary>("scan_external_games"),
};

export const customGameApi = {
  add: (name: string, exePath: string, description?: string, launchArgs?: string) =>
    invoke<Game>("add_custom_game", {
      name,
      exePath,
      description: description ?? null,
      launchArgs: launchArgs ?? null,
    }),
  remove: (gameId: string) => invoke("remove_custom_game", { gameId }),
  update: (
    gameId: string,
    name: string | null,
    exePath: string | null,
    description: string | null,
    launchArgs: string | null,
  ) =>
    invoke<Game>("update_custom_game", {
      gameId,
      name,
      exePath,
      description,
      launchArgs,
    }),
};

export interface SgdbImageOption {
  id: number;
  url: string;
  thumb: string;
  width: number;
  height: number;
}

export const coverArtApi = {
  getCoverArtUrl: (gameId: string, imageType: string) =>
    invoke<string | null>("get_cover_art_url", { gameId, imageType }),
  fetchBatch: () => invoke<number>("fetch_cover_art_batch"),
  storeSgdbKey: (key: string) => invoke("store_sgdb_api_key", { key }),
  getSgdbKeyStatus: () => invoke<boolean>("get_sgdb_key_status"),
  deleteSgdbKey: () => invoke("delete_sgdb_api_key"),
  getCoverArtOptions: (gameId: string, imageType: string, searchQuery?: string) =>
    invoke<SgdbImageOption[]>("get_cover_art_options", {
      gameId,
      imageType,
      searchQuery: searchQuery ?? null,
    }),
  setCoverArt: (gameId: string, imageType: string, imageUrl: string) =>
    invoke("set_cover_art", { gameId, imageType, imageUrl }),
};

export const developerApi = {
  clearAllData: () => invoke("clear_all_data", { confirmation: "CONFIRM_DELETE_ALL" }),
};

export const achievementsApi = {
  fetchGameAchievements: (apiKey: string, steamId: string, gameId: string) =>
    invoke<GameAchievementSummary>("fetch_game_achievements", {
      apiKey,
      steamId,
      gameId,
    }),
  getAllAchievementStats: () =>
    invoke<[string, number, number][]>("get_all_achievement_stats"),
  batchFetchAchievements: (apiKey: string, steamId: string) =>
    invoke<number>("batch_fetch_achievements", { apiKey, steamId }),
  clearAchievementCache: () => invoke<number>("clear_achievement_cache"),
};

export const friendsApi = {
  fetchFriendsList: (apiKey: string, steamId: string) =>
    invoke<FriendInfo[]>("fetch_friends_list", { apiKey, steamId }),
  fetchFriendLibrary: (apiKey: string, friendSteamId: string) =>
    invoke<FriendLibrary>("fetch_friend_library", { apiKey, friendSteamId }),
};

export const newsApi = {
  fetchGameNews: (gameId: string, count?: number) =>
    invoke<GameNewsItem[]>("fetch_game_news", { gameId, count: count ?? 10 }),
  fetchFollowedGames: (apiKey: string, steamId: string) =>
    invoke<number[]>("fetch_followed_games", { apiKey, steamId }),
};

export const savedFiltersApi = {
  save: async (
    name: string,
    filters: LibraryFilters,
    sortBy?: SortBy,
    sortOrder?: SortOrder,
  ): Promise<SavedFilter> => {
    const row = await invoke<SavedFilterRow>("save_filter", {
      name,
      filterJson: JSON.stringify(filters),
      sortBy: sortBy ?? null,
      sortOrder: sortOrder ?? null,
    });
    const parsed = parseSavedFilterRow(row);
    if (!parsed) throw new Error("Failed to parse saved filter");
    return parsed;
  },
  getAll: async (): Promise<SavedFilter[]> => {
    const rows = await invoke<SavedFilterRow[]>("get_all_saved_filters");
    return rows.map(parseSavedFilterRow).filter((r): r is SavedFilter => r !== null);
  },
  delete: (id: number) => invoke("delete_saved_filter", { id }),
};

export const notesApi = {
  getGameNote: (gameId: string) => invoke<GameNote | null>("get_game_note", { gameId }),
  saveGameNote: (gameId: string, content: string) =>
    invoke<GameNote>("save_game_note", { gameId, content }),
  deleteGameNote: (gameId: string) => invoke<void>("delete_game_note", { gameId }),
  getAllNotesWithContent: () => invoke<GameNoteWithName[]>("get_all_notes_with_content"),
};

export const systemMonitorApi = {
  getSystemMetrics: () => invoke<SystemMetricsSnapshot>("get_system_metrics"),
  killGameProcess: (pid: number) => invoke<void>("kill_game_process", { pid }),
};

export const mediaControlsApi = {
  getSession: () => invoke<MediaSessionSnapshot>("get_media_session"),
  togglePlayPause: () => invoke<void>("media_toggle_play_pause"),
  skipNext: () => invoke<void>("media_skip_next"),
  skipPrevious: () => invoke<void>("media_skip_previous"),
};

export const mediaBookmarksApi = {
  getAll: () => invoke<MediaBookmark[]>("get_media_bookmarks"),
  add: (request: CreateMediaBookmarkRequest) =>
    invoke<MediaBookmark>("add_media_bookmark", { request }),
  update: (request: UpdateMediaBookmarkRequest) =>
    invoke<void>("update_media_bookmark", { request }),
  delete: (id: number) => invoke<void>("delete_media_bookmark", { id }),
  reorder: (request: ReorderMediaBookmarksRequest) =>
    invoke<void>("reorder_media_bookmarks", { request }),
  open: (url: string) => invoke<void>("open_media_bookmark", { url }),
};

export const audioMixerApi = {
  getSnapshot: () => invoke<AudioSnapshot>("get_audio_snapshot"),
  setSessionVolume: (pid: number, volume: number) =>
    invoke<void>("set_session_volume", { pid, volume }),
  setSessionMute: (pid: number, muted: boolean) =>
    invoke<void>("set_session_mute", { pid, muted }),
  setMasterVolume: (volume: number) => invoke<void>("set_master_volume", { volume }),
  setMasterMute: (muted: boolean) => invoke<void>("set_master_mute", { muted }),
  setDefaultOutputDevice: (deviceId: string) =>
    invoke<void>("set_default_output_device", { deviceId }),
  setDefaultInputDevice: (deviceId: string) =>
    invoke<void>("set_default_input_device", { deviceId }),
  setDeviceAlias: (deviceId: string, customName: string) =>
    invoke<void>("set_audio_device_alias", { deviceId, customName }),
  deleteDeviceAlias: (deviceId: string) =>
    invoke<void>("delete_audio_device_alias", { deviceId }),
  setSessionHidden: (exeName: string, hidden: boolean) =>
    invoke<void>("set_audio_session_hidden", { exeName, hidden }),
};

export const aiApi = {
  resolveIntent: (query: string) =>
    invoke<ResolvedIntent | null>("ai_resolve_intent", { query }),
};

export const updaterApi = {
  checkForUpdate: () => invoke<UpdateInfo | null>("check_for_update"),
  installUpdate: () => invoke<void>("install_update"),
  getAppVersion: () => invoke<string>("get_app_version"),
};

export const autostartApi = {
  isEnabled: () => invoke<boolean>("get_autostart_enabled"),
  setEnabled: (enabled: boolean) => invoke<void>("set_autostart_enabled", { enabled }),
};

export const cloudAiApi = {
  storeKey: (provider: string, key: string) =>
    invoke<void>("store_cloud_api_key", { provider, key }),
  deleteKey: (provider: string) => invoke<void>("delete_cloud_api_key", { provider }),
  getKeyStatus: (provider: string) =>
    invoke<boolean>("get_cloud_api_key_status", { provider }),
  testKey: (provider: string) => invoke<boolean>("test_cloud_api_key", { provider }),
  getUsage: () => invoke<CloudAiUsage>("get_cloud_ai_usage"),
  updateSettings: (enabled: boolean, provider: string, dailyLimit: number) =>
    invoke<void>("update_cloud_ai_settings", { enabled, provider, dailyLimit }),
  cloudResolve: (query: string) =>
    invoke<ResolvedIntent | null>("ai_cloud_resolve", { query }),
};
