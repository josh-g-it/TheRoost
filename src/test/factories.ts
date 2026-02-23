import type { Game, StoreMetadata, LibraryFilters, GameSession } from "../types";
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
    ...overrides,
  };
}

/** Convert a date string like "2026-02-18" to a Unix timestamp at noon. */
export function ts(dateStr: string): number {
  return Math.floor(new Date(dateStr + "T12:00:00").getTime() / 1000);
}
