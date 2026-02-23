export interface RadarDataPoint {
  genre: string;
  playtime: number; // hours
  normalized: number; // 0-100
}

export interface DistributionBucket {
  label: string;
  count: number;
  games: Array<{ gameId: string; name: string; playtime: number }>;
}

export interface ScatterPoint {
  gameId: string;
  name: string;
  metacritic: number;
  playtimeHours: number;
}

export interface LeaderboardEntry {
  name: string;
  totalHours: number;
  gameCount: number;
}

export type LeaderboardMode = "developer" | "publisher";

export interface QuickStats {
  mostPlayedGame: { name: string; hours: number } | null;
  averagePlaytime: number;
  medianPlaytime: number;
  totalDiskUsage: number;
  gamesWithMetadata: number;
  totalGames: number;
  totalPlaytimeHours: number;
  installedCount: number;
  favoritesCount: number;
}

// ── Drill-Down ──────────────────────────────────────────────────

export interface ProfileDrillDownGame {
  gameId: string;
  name: string;
  source: string;
  playtimeMinutes: number;
}

export interface ProfileDrillDownContext {
  title: string;
  subtitle?: string;
  games: ProfileDrillDownGame[];
}
