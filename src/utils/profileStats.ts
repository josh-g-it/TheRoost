import type { Game, StoreMetadata, PlaytimeBucketConfig } from "../types";
import type { ProfileChartFilters } from "../types/ui";
import type {
  RadarDataPoint,
  DistributionBucket,
  ScatterPoint,
  LeaderboardEntry,
  LeaderboardMode,
  QuickStats,
  ProfileDrillDownGame,
} from "../types/profile";

export function computeGenreDNA(
  games: Game[],
  metadataCache: Map<string, StoreMetadata>,
  topN = 8,
): RadarDataPoint[] {
  const genreMap = new Map<string, number>();

  for (const game of games) {
    const meta = metadataCache.get(game.gameId);
    if (!meta || meta.genres.length === 0) continue;
    const hours = game.playtimeForever / 60;
    for (const genre of meta.genres) {
      genreMap.set(genre.description, (genreMap.get(genre.description) ?? 0) + hours);
    }
  }

  const sorted = [...genreMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN);

  if (sorted.length === 0) return [];

  const maxHours = sorted[0][1];
  return sorted.map(([genre, playtime]) => ({
    genre,
    playtime: Math.round(playtime * 10) / 10,
    normalized: maxHours > 0 ? Math.round((playtime / maxHours) * 100) : 0,
  }));
}

const BUCKET_PRESETS: Record<PlaytimeBucketConfig, { label: string; max: number }[]> = {
  simple: [
    { label: "Never Played", max: 0 },
    { label: "< 10h", max: 10 },
    { label: "10-100h", max: 100 },
    { label: "100h+", max: Infinity },
  ],
  default: [
    { label: "Never Played", max: 0 },
    { label: "< 1h", max: 1 },
    { label: "1-10h", max: 10 },
    { label: "10-50h", max: 50 },
    { label: "50-100h", max: 100 },
    { label: "100h+", max: Infinity },
  ],
  detailed: [
    { label: "Never Played", max: 0 },
    { label: "< 1h", max: 1 },
    { label: "1-5h", max: 5 },
    { label: "5-20h", max: 20 },
    { label: "20-50h", max: 50 },
    { label: "50-100h", max: 100 },
    { label: "100-500h", max: 500 },
    { label: "500h+", max: Infinity },
  ],
};

export function computePlaytimeDistribution(
  games: Game[],
  preset: PlaytimeBucketConfig = "default",
): DistributionBucket[] {
  const config = BUCKET_PRESETS[preset];
  const buckets: DistributionBucket[] = config.map((c) => ({
    label: c.label,
    count: 0,
    games: [],
  }));

  for (const game of games) {
    const hours = game.playtimeForever / 60;
    const entry = { gameId: game.gameId, name: game.name, playtime: hours };

    let idx = 0;
    if (game.playtimeForever === 0) {
      idx = 0;
    } else {
      // Skip the "Never Played" bucket (index 0), start from index 1
      for (let i = 1; i < config.length; i++) {
        if (hours < config[i].max || i === config.length - 1) {
          idx = i;
          break;
        }
      }
    }

    buckets[idx].count++;
    buckets[idx].games.push(entry);
  }

  // Sort games within each bucket by playtime descending
  for (const bucket of buckets) {
    bucket.games.sort((a, b) => b.playtime - a.playtime);
  }

  return buckets;
}

export function computeMetacriticScatter(
  games: Game[],
  metadataCache: Map<string, StoreMetadata>,
): ScatterPoint[] {
  const points: ScatterPoint[] = [];

  for (const game of games) {
    const meta = metadataCache.get(game.gameId);
    if (!meta || meta.metacriticScore == null) continue;
    points.push({
      gameId: game.gameId,
      name: game.name,
      metacritic: meta.metacriticScore,
      playtimeHours: Math.round((game.playtimeForever / 60) * 10) / 10,
    });
  }

  return points;
}

export function computeDevPubLeaderboard(
  games: Game[],
  metadataCache: Map<string, StoreMetadata>,
  mode: LeaderboardMode,
  topN = 10,
): LeaderboardEntry[] {
  const map = new Map<string, { totalHours: number; gameCount: number }>();

  for (const game of games) {
    const meta = metadataCache.get(game.gameId);
    if (!meta) continue;
    const names = mode === "developer" ? meta.developers : meta.publishers;
    const hours = game.playtimeForever / 60;

    for (const name of names) {
      const existing = map.get(name);
      if (existing) {
        existing.totalHours += hours;
        existing.gameCount++;
      } else {
        map.set(name, { totalHours: hours, gameCount: 1 });
      }
    }
  }

  return [...map.entries()]
    .map(([name, data]) => ({
      name,
      totalHours: Math.round(data.totalHours * 10) / 10,
      gameCount: data.gameCount,
    }))
    .sort((a, b) => b.totalHours - a.totalHours)
    .slice(0, topN);
}

export function computeQuickStats(
  games: Game[],
  metadataCache: Map<string, StoreMetadata>,
  favorites: Set<string>,
): QuickStats {
  if (games.length === 0) {
    return {
      mostPlayedGame: null,
      averagePlaytime: 0,
      medianPlaytime: 0,
      totalDiskUsage: 0,
      gamesWithMetadata: 0,
      totalGames: 0,
      totalPlaytimeHours: 0,
      installedCount: 0,
      favoritesCount: 0,
    };
  }

  const playtimesHours = games.map((g) => g.playtimeForever / 60).sort((a, b) => a - b);

  const totalHours = playtimesHours.reduce((sum, h) => sum + h, 0);
  const mid = Math.floor(playtimesHours.length / 2);
  const median =
    playtimesHours.length % 2 === 0
      ? (playtimesHours[mid - 1] + playtimesHours[mid]) / 2
      : playtimesHours[mid];

  let mostPlayed: { name: string; hours: number } | null = null;
  let maxPlaytime = 0;
  for (const game of games) {
    if (game.playtimeForever > maxPlaytime) {
      maxPlaytime = game.playtimeForever;
      mostPlayed = {
        name: game.name,
        hours: Math.round((game.playtimeForever / 60) * 10) / 10,
      };
    }
  }

  let totalDisk = 0;
  let installedCount = 0;
  for (const game of games) {
    if (game.isInstalled) {
      installedCount++;
      if (game.sizeOnDisk) totalDisk += game.sizeOnDisk;
    }
  }

  let gamesWithMeta = 0;
  for (const game of games) {
    if (metadataCache.has(game.gameId)) gamesWithMeta++;
  }

  return {
    mostPlayedGame: mostPlayed,
    averagePlaytime: Math.round((totalHours / games.length) * 10) / 10,
    medianPlaytime: Math.round(median * 10) / 10,
    totalDiskUsage: totalDisk,
    gamesWithMetadata: gamesWithMeta,
    totalGames: games.length,
    totalPlaytimeHours: Math.round(totalHours * 10) / 10,
    installedCount,
    favoritesCount: favorites.size,
  };
}

export function countryCodeToFlag(code: string): string {
  const upper = code.toUpperCase();
  if (upper.length !== 2) return "";
  const offset = 0x1f1e6 - 65; // Regional indicator A
  return String.fromCodePoint(upper.charCodeAt(0) + offset, upper.charCodeAt(1) + offset);
}

// ── Game Filter Functions ───────────────────────────────────────

export function filterGamesByTags(
  games: Game[],
  tagIds: number[],
  gameTagMap: Map<string, number[]>,
): Game[] {
  if (tagIds.length === 0) return games;
  const tagSet = new Set(tagIds);
  return games.filter((g) => {
    const tags = gameTagMap.get(g.gameId);
    return tags?.some((t) => tagSet.has(t)) ?? false;
  });
}

export function filterGamesBySource(games: Game[], sources: string[]): Game[] {
  if (sources.length === 0) return games;
  const sourceSet = new Set(sources);
  return games.filter((g) => sourceSet.has(g.source));
}

export function filterGamesByGenre(
  games: Game[],
  genreIds: string[],
  metadataCache: Map<string, StoreMetadata>,
): Game[] {
  if (genreIds.length === 0) return games;
  const idSet = new Set(genreIds);
  return games.filter((g) => {
    const meta = metadataCache.get(g.gameId);
    return meta?.genres.some((genre) => idSet.has(genre.id)) ?? false;
  });
}

export function filterGamesBySteamTag(
  games: Game[],
  tagNames: string[],
  metadataCache: Map<string, StoreMetadata>,
): Game[] {
  if (tagNames.length === 0) return games;
  const nameSet = new Set(tagNames);
  return games.filter((g) => {
    const meta = metadataCache.get(g.gameId);
    return meta?.steamTags.some((tag) => nameSet.has(tag.name)) ?? false;
  });
}

export function filterGamesByCategory(
  games: Game[],
  categoryIds: number[],
  metadataCache: Map<string, StoreMetadata>,
): Game[] {
  if (categoryIds.length === 0) return games;
  const idSet = new Set(categoryIds);
  return games.filter((g) => {
    const meta = metadataCache.get(g.gameId);
    return meta?.categories.some((cat) => idSet.has(cat.id)) ?? false;
  });
}

export function applyProfileChartFilters(
  games: Game[],
  filters: ProfileChartFilters,
  gameTagMap: Map<string, number[]>,
  metadataCache: Map<string, StoreMetadata>,
): Game[] {
  let result = filterGamesByTags(games, filters.filterByTagIds, gameTagMap);
  result = filterGamesBySource(result, filters.filterBySource);
  result = filterGamesByGenre(result, filters.filterByGenreIds, metadataCache);
  result = filterGamesBySteamTag(result, filters.filterBySteamTagNames, metadataCache);
  result = filterGamesByCategory(result, filters.filterByCategoryIds, metadataCache);
  return result;
}

// ── Drill-Down Helpers ──────────────────────────────────────────

export function getGamesForGenre(
  games: Game[],
  genreName: string,
  metadataCache: Map<string, StoreMetadata>,
): ProfileDrillDownGame[] {
  return games
    .filter((g) => {
      const meta = metadataCache.get(g.gameId);
      return meta?.genres.some((genre) => genre.description === genreName) ?? false;
    })
    .map((g) => ({
      gameId: g.gameId,
      name: g.name,
      source: g.source,
      playtimeMinutes: g.playtimeForever,
    }))
    .sort((a, b) => b.playtimeMinutes - a.playtimeMinutes);
}

export function getGamesForDevPub(
  games: Game[],
  entityName: string,
  mode: LeaderboardMode,
  metadataCache: Map<string, StoreMetadata>,
): ProfileDrillDownGame[] {
  return games
    .filter((g) => {
      const meta = metadataCache.get(g.gameId);
      if (!meta) return false;
      const names = mode === "developer" ? meta.developers : meta.publishers;
      return names.includes(entityName);
    })
    .map((g) => ({
      gameId: g.gameId,
      name: g.name,
      source: g.source,
      playtimeMinutes: g.playtimeForever,
    }))
    .sort((a, b) => b.playtimeMinutes - a.playtimeMinutes);
}
