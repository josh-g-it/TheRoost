import type { SortBy, SortOrder } from "./ui";
import type { GameSource } from "./game";

// ── Shelf Types ─────────────────────────────────────────────────

export type ShelfPreset =
  | "all"
  | "recently-played"
  | "favorites"
  | "installed"
  | "pinned-only"
  | "custom";

export type ShelfDisplayMode = "collapsed" | "extended" | "expanded";

export interface ShelfFilters {
  showInstalledOnly: boolean;
  showFavoritesOnly: boolean;
  filterByTagIds: number[];
  filterByGenreIds: string[];
  filterBySteamTagNames: string[];
  filterByCategoryIds: number[];
  filterBySource: GameSource[];
}

export interface ShelfConfig {
  id: string;
  name: string;
  preset: ShelfPreset;
  filters: ShelfFilters;
  sortBy: SortBy;
  sortOrder: SortOrder;
  displayMode: ShelfDisplayMode;
  groupByGenre: boolean;
  /** Max games to show on this shelf. null = unlimited. */
  maxVisibleGames: number | null;
  /** Game IDs manually pinned to this shelf. Always shown regardless of filters. */
  pinnedGameIds: string[];
}

// ── Defaults ────────────────────────────────────────────────────

export const DEFAULT_SHELF_FILTERS: ShelfFilters = {
  showInstalledOnly: false,
  showFavoritesOnly: false,
  filterByTagIds: [],
  filterByGenreIds: [],
  filterBySteamTagNames: [],
  filterByCategoryIds: [],
  filterBySource: [],
};

export const SHELF_PRESET_CONFIGS: Record<
  Exclude<ShelfPreset, "custom">,
  {
    name: string;
    sortBy: SortBy;
    sortOrder: SortOrder;
    filters: Partial<ShelfFilters>;
    maxVisibleGames: number | null;
  }
> = {
  "recently-played": {
    name: "Recently Played",
    sortBy: "lastPlayed",
    sortOrder: "desc",
    filters: {},
    maxVisibleGames: 25,
  },
  all: {
    name: "All Games",
    sortBy: "name",
    sortOrder: "asc",
    filters: {},
    maxVisibleGames: null,
  },
  favorites: {
    name: "Favorites",
    sortBy: "name",
    sortOrder: "asc",
    filters: { showFavoritesOnly: true },
    maxVisibleGames: null,
  },
  installed: {
    name: "Installed",
    sortBy: "name",
    sortOrder: "asc",
    filters: { showInstalledOnly: true },
    maxVisibleGames: null,
  },
  "pinned-only": {
    name: "Pinned Only",
    sortBy: "name",
    sortOrder: "asc",
    filters: {},
    maxVisibleGames: null,
  },
};

export const DEFAULT_SHELVES: ShelfConfig[] = [
  {
    id: "default-recently-played",
    name: "Recently Played",
    preset: "recently-played",
    filters: { ...DEFAULT_SHELF_FILTERS },
    sortBy: "lastPlayed",
    sortOrder: "desc",
    displayMode: "collapsed",
    groupByGenre: false,
    maxVisibleGames: 25,
    pinnedGameIds: [],
  },
  {
    id: "default-all-games",
    name: "All Games",
    preset: "all",
    filters: { ...DEFAULT_SHELF_FILTERS },
    sortBy: "name",
    sortOrder: "asc",
    displayMode: "expanded",
    groupByGenre: false,
    maxVisibleGames: null,
    pinnedGameIds: [],
  },
];
