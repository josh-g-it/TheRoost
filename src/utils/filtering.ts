import type { Game, GameRating, LibraryFilters, StoreMetadata } from "../types";
import type { GameSource } from "../types/game";

export function filterGames(
  games: Game[],
  filters: LibraryFilters,
  favorites?: Set<string>,
  gameTagMap?: Map<string, number[]>,
  hiddenGames?: Set<string>,
  metadataCache?: Map<string, StoreMetadata>,
  ratingsCache?: Map<string, GameRating>,
): Game[] {
  return games.filter((game) => {
    // Hidden games logic: if showHiddenOnly, show ONLY hidden games
    // Otherwise, exclude hidden games
    if (filters.showHiddenOnly) {
      if (!hiddenGames?.has(game.gameId)) return false;
    } else if (hiddenGames?.has(game.gameId)) {
      return false;
    }

    if (
      filters.searchQuery &&
      !game.name.toLowerCase().includes(filters.searchQuery.toLowerCase())
    ) {
      return false;
    }

    if (filters.showInstalledOnly && !game.isInstalled) {
      return false;
    }

    if (filters.showFavoritesOnly && favorites && !favorites.has(game.gameId)) {
      return false;
    }

    if (filters.filterByTagIds.length > 0 && gameTagMap) {
      const gameTags = gameTagMap.get(game.gameId) ?? [];
      if (!filters.filterByTagIds.some((id) => gameTags.includes(id))) {
        return false;
      }
    }

    // Genre filtering (OR logic — game has any of the selected genres)
    if (filters.filterByGenreIds.length > 0 && metadataCache) {
      const meta = metadataCache.get(game.gameId);
      if (!meta || meta.genres.length === 0) return false;
      const gameGenreIds = meta.genres.map((g) => g.id);
      if (!filters.filterByGenreIds.some((id) => gameGenreIds.includes(id))) {
        return false;
      }
    }

    // Steam community tag filtering (OR logic)
    if ((filters.filterBySteamTagNames ?? []).length > 0 && metadataCache) {
      const meta = metadataCache.get(game.gameId);
      if (!meta || meta.steamTags.length === 0) return false;
      const gameTagNames = meta.steamTags.map((t) => t.name);
      if (!filters.filterBySteamTagNames.some((name) => gameTagNames.includes(name))) {
        return false;
      }
    }

    // Category filtering (OR logic)
    if ((filters.filterByCategoryIds ?? []).length > 0 && metadataCache) {
      const meta = metadataCache.get(game.gameId);
      if (!meta || meta.categories.length === 0) return false;
      const gameCatIds = meta.categories.map((c) => c.id);
      if (!filters.filterByCategoryIds.some((id) => gameCatIds.includes(id))) {
        return false;
      }
    }

    // Source/launcher filtering (OR logic)
    if ((filters.filterBySource ?? []).length > 0) {
      if (!filters.filterBySource.includes(game.source)) {
        return false;
      }
    }

    // Rating filtering
    if (filters.filterByRated === "rated") {
      if (!ratingsCache?.has(game.gameId)) return false;
    } else if (filters.filterByRated === "unrated") {
      if (ratingsCache?.has(game.gameId)) return false;
    }

    if (filters.filterByMinRating > 0) {
      const rating = ratingsCache?.get(game.gameId)?.rating ?? 0;
      if (rating < filters.filterByMinRating) return false;
    }

    return true;
  });
}

/** Extract all unique genres from metadata cache, sorted by frequency. */
export function extractAllGenres(
  metadataCache: Map<string, StoreMetadata>,
): { id: string; description: string; count: number }[] {
  const genreMap = new Map<string, { description: string; count: number }>();
  for (const meta of metadataCache.values()) {
    for (const genre of meta.genres) {
      const existing = genreMap.get(genre.id);
      if (existing) {
        existing.count++;
      } else {
        genreMap.set(genre.id, { description: genre.description, count: 1 });
      }
    }
  }
  return [...genreMap.entries()]
    .map(([id, { description, count }]) => ({ id, description, count }))
    .sort((a, b) => b.count - a.count);
}

/** Extract all unique Steam community tags from metadata cache, with game counts. */
export function extractAllSteamTags(
  metadataCache: Map<string, StoreMetadata>,
): { name: string; count: number }[] {
  const tagCounts = new Map<string, number>();
  for (const meta of metadataCache.values()) {
    for (const tag of meta.steamTags) {
      tagCounts.set(tag.name, (tagCounts.get(tag.name) ?? 0) + 1);
    }
  }
  return [...tagCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** Extract all unique categories from metadata cache, sorted by frequency. */
export function extractAllCategories(
  metadataCache: Map<string, StoreMetadata>,
): { id: number; description: string; count: number }[] {
  const catMap = new Map<number, { description: string; count: number }>();
  for (const meta of metadataCache.values()) {
    for (const cat of meta.categories) {
      const existing = catMap.get(cat.id);
      if (existing) {
        existing.count++;
      } else {
        catMap.set(cat.id, { description: cat.description, count: 1 });
      }
    }
  }
  return [...catMap.entries()]
    .map(([id, { description, count }]) => ({ id, description, count }))
    .sort((a, b) => b.count - a.count);
}

/** Extract all unique sources from the games list, with game counts. */
export function extractAllSources(
  games: Game[],
): { source: GameSource; count: number }[] {
  const counts = new Map<GameSource, number>();
  for (const game of games) {
    counts.set(game.source, (counts.get(game.source) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}
