export interface RecapData {
  version: number;
  periodType: "monthly" | "yearly";
  periodKey: string;
  generatedAt: number;

  totalMinutes: number;
  totalSessions: number;
  uniqueGamesPlayed: number;
  avgSessionMinutes: number;
  longestSessionMinutes: number;
  longestSessionGameId: string;
  longestSessionGameName: string;
  longestStreakDays: number;

  topGame: RecapTopGame;
  topGames: RecapTopGame[];
  genreBreakdown: RecapGenreEntry[];
  busiestDay: RecapBusiestDay;
  prevPeriodMinutes: number;
  newDiscoveries: RecapDiscovery[];
  achievementsUnlocked: number;
  notableAchievements: RecapAchievement[];
  funComparisons: RecapComparison[];

  /** Yearly-only: 12 entries (Jan=0 .. Dec=11), minutes per month. */
  monthlyPlaytime?: number[];
}

export interface RecapTopGame {
  gameId: string;
  name: string;
  minutes: number;
  sessions: number;
}

export interface RecapGenreEntry {
  genre: string;
  minutes: number;
  percentage: number;
}

export interface RecapBusiestDay {
  day: string;
  minutes: number;
}

export interface RecapDiscovery {
  gameId: string;
  name: string;
}

export interface RecapAchievement {
  gameName: string;
  achievementName: string;
  rarity: number;
}

export interface RecapComparison {
  activity: string;
  count: number;
  emoji: string;
}

export interface RecapSummary {
  periodKey: string;
  periodType: "monthly" | "yearly";
  generatedAt: number;
  totalMinutes: number;
  topGameName: string;
}
