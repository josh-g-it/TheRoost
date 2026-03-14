import type {
  Game,
  StoreMetadata,
  LibraryFilters,
  GameSession,
  RecapData,
  AiAvatar,
  AiMessage,
  AiMemory,
  AiPersonality,
  AiDailyLog,
  AiConversation,
  ResolvedAction,
  SpriteInfo,
  ImageAttachment,
} from "../types";
import type { BackupManifest } from "../services/tauri";
import type { ShelfConfig } from "../types/shelf";
import { DEFAULT_SHELF_FILTERS } from "../types/shelf";

export function makeGame(
  overrides: Partial<Game> & { gameId: string; name: string },
): Game {
  return {
    source: "steam",
    sourceId: overrides.gameId,
    installDir: null,
    installPath: null,
    sizeOnDisk: null,
    lastUpdated: null,
    playtimeForever: 0,
    playtime2weeks: null,
    lastPlayed: null,
    isInstalled: false,
    imgIconUrl: null,
    description: null,
    launchArgs: null,
    ...overrides,
  };
}

export function makeMeta(
  gameId: string,
  opts: {
    genres?: { id: string; description: string }[];
    categories?: { id: number; description: string }[];
    steamTags?: { name: string; votes: number }[];
    developers?: string[];
    publishers?: string[];
    metacriticScore?: number | null;
  } = {},
): StoreMetadata {
  return {
    gameId,
    name: `Game ${gameId}`,
    shortDescription: null,
    headerImageUrl: null,
    developers: opts.developers ?? [],
    publishers: opts.publishers ?? [],
    genres: opts.genres ?? [],
    categories: opts.categories ?? [],
    screenshots: [],
    releaseDate: null,
    metacriticScore: opts.metacriticScore ?? null,
    metacriticUrl: null,
    steamTags: opts.steamTags ?? [],
  };
}

export function makeFilters(overrides: Partial<LibraryFilters> = {}): LibraryFilters {
  return {
    searchQuery: "",
    showInstalledOnly: false,
    showFavoritesOnly: false,
    filterByTagIds: [],
    showHiddenOnly: false,
    filterByGenreIds: [],
    filterBySteamTagNames: [],
    filterByCategoryIds: [],
    filterBySource: [],
    filterByRated: "all",
    filterByMinRating: 0,
    showUpdatePendingOnly: false,
    ...overrides,
  };
}

export function makeSession(
  overrides: Partial<GameSession> & { gameId: string },
): GameSession {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: Math.floor(Math.random() * 100000),
    startTime: now - 3600,
    endTime: now,
    durationMinutes: 60,
    ...overrides,
  };
}

export function makeShelf(overrides: Partial<ShelfConfig> = {}): ShelfConfig {
  return {
    id: "test-shelf",
    name: "Test",
    preset: "all",
    filters: { ...DEFAULT_SHELF_FILTERS },
    sortBy: "name",
    sortOrder: "asc",
    displayMode: "expanded",
    groupByGenre: false,
    maxVisibleGames: null,
    pinnedGameIds: [],
    ...overrides,
  };
}

export function makeRecap(overrides?: Partial<RecapData>): RecapData {
  return {
    version: 1,
    periodType: "monthly",
    periodKey: "2026-02",
    generatedAt: Date.now(),
    totalMinutes: 1200,
    totalSessions: 30,
    uniqueGamesPlayed: 5,
    avgSessionMinutes: 40,
    longestSessionMinutes: 180,
    longestSessionGameId: "g1",
    longestSessionGameName: "Elden Ring",
    longestStreakDays: 7,
    topGame: { gameId: "g1", name: "Elden Ring", minutes: 600, sessions: 15 },
    topGames: [
      { gameId: "g1", name: "Elden Ring", minutes: 600, sessions: 15 },
      { gameId: "g2", name: "Hades", minutes: 300, sessions: 8 },
      { gameId: "g3", name: "Celeste", minutes: 200, sessions: 5 },
    ],
    genreBreakdown: [
      { genre: "Action", minutes: 600, percentage: 50 },
      { genre: "Roguelike", minutes: 300, percentage: 25 },
      { genre: "Platformer", minutes: 200, percentage: 17 },
    ],
    busiestDay: { day: "Saturday", minutes: 240 },
    prevPeriodMinutes: 1000,
    newDiscoveries: [{ gameId: "g3", name: "Celeste" }],
    achievementsUnlocked: 12,
    notableAchievements: [
      { gameName: "Elden Ring", achievementName: "Lord of Frenzied Flame", rarity: 3.2 },
    ],
    funComparisons: [
      { activity: "watching the Lord of the Rings trilogy", count: 1.8, emoji: "🎬" },
    ],
    ...overrides,
  };
}

export function makeInstallProgress(
  overrides: Partial<import("../types/install").InstallProgress> & { sourceId: string },
): import("../types/install").InstallProgress {
  return {
    gameId: null,
    name: "Test Game",
    stateFlags: 1026,
    bytesDownloaded: 500_000_000,
    bytesToDownload: 1_000_000_000,
    bytesStaged: 0,
    bytesToStage: 0,
    progress: 0.5,
    status: "downloading",
    ...overrides,
  };
}

/** Convert a date string like "2026-02-18" to a Unix timestamp at noon. */
export function ts(dateStr: string): number {
  return Math.floor(new Date(dateStr + "T12:00:00").getTime() / 1000);
}

export function makeAiAvatar(id: string, overrides?: Partial<AiAvatar>): AiAvatar {
  return {
    id,
    name: `Avatar ${id}`,
    personalityId: "p1",
    imagePath: null,
    companionRoleId: null,
    companionRoleCustom: null,
    isActive: true,
    createdAt: "2026-02-27T12:00:00Z",
    crossAvatarMemoryAccess: true,
    crossAvatarMemoryPrivate: false,
    ...overrides,
  };
}

export function makeAiMessage(
  id: string,
  conversationId: string,
  overrides?: Partial<AiMessage>,
): AiMessage {
  return {
    id,
    conversationId,
    role: "user",
    content: `Message ${id}`,
    createdAt: "2026-02-27T12:00:00Z",
    tokenEstimate: 10,
    ...overrides,
  };
}

export function makeImageAttachment(
  overrides?: Partial<ImageAttachment>,
): ImageAttachment {
  return {
    mimeType: "image/jpeg",
    data: "dGVzdA==", // base64 "test"
    ...overrides,
  };
}

export function makeAiMemory(
  id: string,
  avatarId: string,
  overrides?: Partial<AiMemory>,
): AiMemory {
  return {
    id,
    avatarId,
    conversationId: null,
    content: `Memory ${id}`,
    importance: 5,
    category: "general",
    isSystem: false,
    createdAt: "2026-02-27T12:00:00Z",
    lastReferenced: null,
    supersededBy: null,
    active: true,
    ...overrides,
  };
}

export function makeAiPersonality(
  id: string,
  overrides?: Partial<AiPersonality>,
): AiPersonality {
  return {
    id,
    name: `Personality ${id}`,
    promptText: "You are a helpful assistant.",
    isBuiltin: true,
    createdAt: "2026-02-27T12:00:00Z",
    ...overrides,
  };
}

export function makeAiDailyLog(
  id: string,
  avatarId: string,
  conversationId: string,
  overrides?: Partial<AiDailyLog>,
): AiDailyLog {
  return {
    id,
    avatarId,
    conversationId,
    logDate: "2026-02-27",
    summary: `Journal entry ${id}`,
    createdAt: "2026-02-27T12:00:00Z",
    ...overrides,
  };
}

export function makeAiConversation(
  id: string,
  avatarId: string,
  overrides?: Partial<AiConversation>,
): AiConversation {
  return {
    id,
    avatarId,
    startedAt: "2026-02-27T12:00:00Z",
    endedAt: null,
    summary: null,
    messageCount: 0,
    compacted: 0,
    ...overrides,
  };
}

export interface CompactionResult {
  summary: string;
  journalEntry: string | null;
  memories: { content: string; importance: number; category: string }[];
  supersededMemories: string[];
}

export function makeCompactionResult(
  overrides?: Partial<CompactionResult>,
): CompactionResult {
  return {
    summary: "Conversation summary",
    journalEntry: null,
    memories: [],
    supersededMemories: [],
    ...overrides,
  };
}

export function makeResolvedAction(
  actionId: string,
  overrides?: Partial<ResolvedAction>,
): ResolvedAction {
  return {
    actionId,
    originalActionId: actionId,
    tier: 1,
    ...overrides,
  };
}

export function makeBackupManifest(overrides?: Partial<BackupManifest>): BackupManifest {
  return {
    appVersion: "1.12.0",
    schemaVersion: 26,
    createdAt: "2026-02-27T12:00:00Z",
    dbSizeBytes: 1024000,
    settingsSizeBytes: 2048,
    artFileCount: 5,
    artTotalBytes: 500000,
    spriteFileCount: 2,
    spriteTotalBytes: 100000,
    credentialHints: [],
    ...overrides,
  };
}

export function makeSpriteInfo(overrides?: Partial<SpriteInfo>): SpriteInfo {
  return {
    filename: "prebuilt-default.png",
    displayName: "Default",
    source: "prebuilt",
    fileSizeBytes: 524288,
    createdAt: "2026-03-10 12:00:00",
    ...overrides,
  };
}
