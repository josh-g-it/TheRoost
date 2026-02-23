import type { Game, StoreMetadata } from "../types";
import type { ShelfConfig, ShelfFilters, ShelfPreset } from "../types/shelf";
import { sortGames } from "./sorting";

// ── Preset filter ───────────────────────────────────────────────

function applyPresetFilter(
  games: Game[],
  preset: ShelfPreset,
  favorites: Set<string>,
): Game[] {
  switch (preset) {
    case "recently-played":
      return games.filter((g) => g.lastPlayed != null && g.lastPlayed > 0);
    case "favorites":
      return games.filter((g) => favorites.has(g.gameId));
    case "installed":
      return games.filter((g) => g.isInstalled);
    case "all":
    case "custom":
    default:
      return games;
  }
}

// ── Shelf-level filters ─────────────────────────────────────────

function applyShelfFilters(
  games: Game[],
  filters: ShelfFilters,
  favorites: Set<string>,
  gameTagMap: Map<string, number[]>,
  metadataCache: Map<string, StoreMetadata>,
): Game[] {
  // Default new fields for backward compat with saved shelf configs
  const steamTagNames = filters.filterBySteamTagNames ?? [];
  const categoryIds = filters.filterByCategoryIds ?? [];
  const sourceFilter = filters.filterBySource ?? [];

  return games.filter((game) => {
    if (filters.showInstalledOnly && !game.isInstalled) return false;
    if (filters.showFavoritesOnly && !favorites.has(game.gameId)) return false;

    if (filters.filterByTagIds.length > 0) {
      const gameTags = gameTagMap.get(game.gameId) ?? [];
      if (!filters.filterByTagIds.some((id) => gameTags.includes(id))) return false;
    }

    if (filters.filterByGenreIds.length > 0) {
      const meta = metadataCache.get(game.gameId);
      if (!meta || meta.genres.length === 0) return false;
      const gameGenreIds = meta.genres.map((g) => g.id);
      if (!filters.filterByGenreIds.some((id) => gameGenreIds.includes(id))) return false;
    }

    if (steamTagNames.length > 0) {
      const meta = metadataCache.get(game.gameId);
      if (!meta || meta.steamTags.length === 0) return false;
      const gameTagNames = meta.steamTags.map((t) => t.name);
      if (!steamTagNames.some((name) => gameTagNames.includes(name))) return false;
    }

    if (categoryIds.length > 0) {
      const meta = metadataCache.get(game.gameId);
      if (!meta || meta.categories.length === 0) return false;
      const gameCatIds = meta.categories.map((c) => c.id);
      if (!categoryIds.some((id) => gameCatIds.includes(id))) return false;
    }

    // Source/launcher filtering (OR logic)
    if (sourceFilter.length > 0) {
      if (!sourceFilter.includes(game.source)) return false;
    }

    return true;
  });
}

// ── Global search ───────────────────────────────────────────────

function applyGlobalSearch(games: Game[], query: string): Game[] {
  if (!query.trim()) return games;
  const q = query.toLowerCase().trim();
  return games.filter((g) => g.name.toLowerCase().includes(q));
}

// ── Full shelf pipeline ─────────────────────────────────────────

export function processShelfGames(
  allGames: Game[],
  shelf: ShelfConfig,
  globalSearchQuery: string,
  favorites: Set<string>,
  gameTagMap: Map<string, number[]>,
  hiddenGames: Set<string>,
  metadataCache: Map<string, StoreMetadata>,
): Game[] {
  let games = allGames.filter((g) => !hiddenGames.has(g.gameId));
  games = applyPresetFilter(games, shelf.preset, favorites);
  games = applyShelfFilters(games, shelf.filters, favorites, gameTagMap, metadataCache);
  games = applyGlobalSearch(games, globalSearchQuery);
  games = sortGames(games, shelf.sortBy, shelf.sortOrder, metadataCache);

  // Apply max visible games limit (null = unlimited)
  const limit = shelf.maxVisibleGames;
  if (limit != null && limit > 0 && games.length > limit) {
    games = games.slice(0, limit);
  }

  return games;
}

// ── Genre grouping ──────────────────────────────────────────────

export interface GenreGroup {
  genreId: string;
  genreName: string;
  games: Game[];
}

const OTHER_KEY = "__other__";

export function groupGamesByGenre(
  games: Game[],
  metadataCache: Map<string, StoreMetadata>,
): GenreGroup[] {
  const groups = new Map<string, { name: string; games: Game[] }>();

  for (const game of games) {
    const meta = metadataCache.get(game.gameId);
    const primaryGenre = meta?.genres?.[0];
    const key = primaryGenre?.id ?? OTHER_KEY;
    const name = primaryGenre?.description ?? "Other";

    if (!groups.has(key)) {
      groups.set(key, { name, games: [] });
    }
    groups.get(key)!.games.push(game);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === OTHER_KEY) return 1;
      if (b === OTHER_KEY) return -1;
      return groups.get(a)!.name.localeCompare(groups.get(b)!.name);
    })
    .map(([genreId, { name, games: genreGames }]) => ({
      genreId,
      genreName: name,
      games: genreGames,
    }));
}
