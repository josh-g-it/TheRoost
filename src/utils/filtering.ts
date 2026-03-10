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
  updatePendingIds?: Set<string>,
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

    // Steam community tag filtering (OR logic, case-insensitive)
    if ((filters.filterBySteamTagNames ?? []).length > 0 && metadataCache) {
      const meta = metadataCache.get(game.gameId);
      if (!meta || meta.steamTags.length === 0) return false;
      const gameTagNames = new Set(meta.steamTags.map((t) => t.name.toLowerCase()));
      if (
        !filters.filterBySteamTagNames.some((name) =>
          gameTagNames.has(name.toLowerCase()),
        )
      ) {
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

    if (filters.showUpdatePendingOnly) {
      if (!updatePendingIds?.has(game.gameId)) return false;
    }

    return true;
  });
}

/** Extract all unique genres from metadata cache, sorted by frequency.
 *  Deduplicates by description (case-insensitive) to merge genre IDs
 *  that share the same display name (e.g. two different IDs both called "RPG").
 *  The ID with the highest game count wins as the canonical ID. */
export function extractAllGenres(
  metadataCache: Map<string, StoreMetadata>,
): { id: string; description: string; count: number; aliasIds: string[] }[] {
  // First pass: count per ID
  const byId = new Map<string, { description: string; count: number }>();
  for (const meta of metadataCache.values()) {
    for (const genre of meta.genres) {
      const existing = byId.get(genre.id);
      if (existing) {
        existing.count++;
      } else {
        byId.set(genre.id, { description: genre.description, count: 1 });
      }
    }
  }
  // Second pass: merge by description (case-insensitive)
  const byDesc = new Map<
    string,
    { id: string; description: string; count: number; aliasIds: string[] }
  >();
  for (const [id, { description, count }] of byId) {
    const key = description.toLowerCase();
    const existing = byDesc.get(key);
    if (existing) {
      existing.count += count;
      existing.aliasIds.push(id);
      // Keep the ID with the higher count as canonical
      if (count > (byId.get(existing.id)?.count ?? 0)) {
        existing.aliasIds.push(existing.id);
        existing.aliasIds = existing.aliasIds.filter((a) => a !== id);
        existing.id = id;
        existing.description = description;
      }
    } else {
      byDesc.set(key, { id, description, count, aliasIds: [] });
    }
  }
  return [...byDesc.values()].sort((a, b) => b.count - a.count);
}

/** Extract all unique Steam community tags from metadata cache, with game counts.
 *  Deduplicates by name (case-insensitive) — keeps the casing with the highest count. */
export function extractAllSteamTags(
  metadataCache: Map<string, StoreMetadata>,
): { name: string; count: number }[] {
  const tagMap = new Map<string, { name: string; count: number }>();
  for (const meta of metadataCache.values()) {
    for (const tag of meta.steamTags) {
      const key = tag.name.toLowerCase();
      const existing = tagMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        tagMap.set(key, { name: tag.name, count: 1 });
      }
    }
  }
  return [...tagMap.values()].sort((a, b) => b.count - a.count);
}

/** Extract all unique categories from metadata cache, sorted by frequency.
 *  Deduplicates by description (case-insensitive) to merge category IDs
 *  that share the same display name. The ID with the highest count wins. */
export function extractAllCategories(
  metadataCache: Map<string, StoreMetadata>,
): { id: number; description: string; count: number; aliasIds: number[] }[] {
  // First pass: count per ID
  const byId = new Map<number, { description: string; count: number }>();
  for (const meta of metadataCache.values()) {
    for (const cat of meta.categories) {
      const existing = byId.get(cat.id);
      if (existing) {
        existing.count++;
      } else {
        byId.set(cat.id, { description: cat.description, count: 1 });
      }
    }
  }
  // Second pass: merge by description (case-insensitive)
  const byDesc = new Map<
    string,
    { id: number; description: string; count: number; aliasIds: number[] }
  >();
  for (const [id, { description, count }] of byId) {
    const key = description.toLowerCase();
    const existing = byDesc.get(key);
    if (existing) {
      existing.count += count;
      existing.aliasIds.push(id);
      if (count > (byId.get(existing.id)?.count ?? 0)) {
        existing.aliasIds.push(existing.id);
        existing.aliasIds = existing.aliasIds.filter((a) => a !== id);
        existing.id = id;
        existing.description = description;
      }
    } else {
      byDesc.set(key, { id, description, count, aliasIds: [] });
    }
  }
  return [...byDesc.values()].sort((a, b) => b.count - a.count);
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
