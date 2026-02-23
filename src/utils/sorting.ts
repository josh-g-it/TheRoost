import type { Game, SortBy, SortOrder, StoreMetadata } from "../types";

export function sortGames(
  games: Game[],
  sortBy: SortBy,
  order: SortOrder,
  metadataCache?: Map<string, StoreMetadata>,
): Game[] {
  const sorted = [...games].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      case "playtime":
        return a.playtimeForever - b.playtimeForever;
      case "lastPlayed":
        return (a.lastPlayed ?? 0) - (b.lastPlayed ?? 0);
      case "recentlyAdded":
        return (a.lastUpdated ?? 0) - (b.lastUpdated ?? 0);
      case "size":
        return (a.sizeOnDisk ?? 0) - (b.sizeOnDisk ?? 0);
      case "metacritic": {
        const scoreA = metadataCache?.get(a.gameId)?.metacriticScore ?? -1;
        const scoreB = metadataCache?.get(b.gameId)?.metacriticScore ?? -1;
        return scoreA - scoreB;
      }
      case "source":
        return a.source.localeCompare(b.source);
      default:
        return 0;
    }
  });

  if (order === "desc") sorted.reverse();
  return sorted;
}
