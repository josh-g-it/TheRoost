import type {
  GameSession,
  DailyPlaytimePoint,
  MostPlayedEntry,
  SessionLengthBucket,
  DayOfWeekEntry,
  ActivityQuickStats,
  StoreMetadata,
} from "../types";

// ── Types ────────────────────────────────────────────────────────

export interface MemoryEntry {
  period: "last-month" | "last-year";
  periodLabel: string;
  games: { gameId: string; name: string; totalMinutes: number }[];
  totalMinutes: number;
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateKey(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${MONTH_SHORT[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

/**
 * Compute playtime per day for the last N days.
 * Returns an entry for every day (filling zeros for days with no play).
 */
export function computeDailyPlaytime(
  sessions: GameSession[],
  days: number,
): DailyPlaytimePoint[] {
  const dayMap = new Map<string, { minutes: number; count: number }>();

  for (const s of sessions) {
    if (s.durationMinutes == null) continue;
    const key = toDateKey(s.startTime);
    const existing = dayMap.get(key);
    if (existing) {
      existing.minutes += s.durationMinutes;
      existing.count++;
    } else {
      dayMap.set(key, { minutes: s.durationMinutes, count: 1 });
    }
  }

  const result: DailyPlaytimePoint[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const data = dayMap.get(key);
    const minutes = data?.minutes ?? 0;
    result.push({
      dateKey: key,
      date: formatDateLabel(key),
      minutes,
      hours: Math.round((minutes / 60) * 10) / 10,
      sessionCount: data?.count ?? 0,
    });
  }

  return result;
}

/**
 * Compute top N most-played games by total session duration since a timestamp.
 */
export function computeMostPlayed(
  sessions: GameSession[],
  gameNames: Map<string, string>,
  sinceTimestamp: number,
  topN: number,
): MostPlayedEntry[] {
  const gameMap = new Map<string, { minutes: number; count: number }>();

  for (const s of sessions) {
    if (s.durationMinutes == null || s.startTime < sinceTimestamp) continue;
    const existing = gameMap.get(s.gameId);
    if (existing) {
      existing.minutes += s.durationMinutes;
      existing.count++;
    } else {
      gameMap.set(s.gameId, { minutes: s.durationMinutes, count: 1 });
    }
  }

  return Array.from(gameMap.entries())
    .map(([gameId, data]) => ({
      gameId,
      name: gameNames.get(gameId) ?? `Game ${gameId.slice(0, 8)}`,
      totalMinutes: data.minutes,
      totalHours: Math.round((data.minutes / 60) * 10) / 10,
      sessionCount: data.count,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, topN);
}

const SESSION_LENGTH_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "< 15m", min: 0, max: 15 },
  { label: "15-30m", min: 15, max: 30 },
  { label: "30m-1h", min: 30, max: 60 },
  { label: "1-2h", min: 60, max: 120 },
  { label: "2-4h", min: 120, max: 240 },
  { label: "4h+", min: 240, max: Infinity },
];

/**
 * Bucket sessions by their duration length.
 */
export function computeSessionLengthDistribution(
  sessions: GameSession[],
): SessionLengthBucket[] {
  const buckets: SessionLengthBucket[] = SESSION_LENGTH_BUCKETS.map((b) => ({
    ...b,
    count: 0,
  }));

  for (const s of sessions) {
    if (s.durationMinutes == null || s.durationMinutes <= 0) continue;
    const bucket = buckets.find(
      (b) => s.durationMinutes! >= b.min && s.durationMinutes! < b.max,
    );
    if (bucket) bucket.count++;
  }

  return buckets;
}

/**
 * Aggregate playtime by day of week (Mon=0 through Sun=6).
 */
export function computePlaytimeByDayOfWeek(sessions: GameSession[]): DayOfWeekEntry[] {
  const days: DayOfWeekEntry[] = DAY_NAMES.map((day, i) => ({
    day,
    dayIndex: i,
    totalHours: 0,
    sessionCount: 0,
  }));

  for (const s of sessions) {
    if (s.durationMinutes == null) continue;
    // JS getDay(): 0=Sun, 1=Mon, ... 6=Sat → remap to Mon=0...Sun=6
    const jsDay = new Date(s.startTime * 1000).getDay();
    const idx = jsDay === 0 ? 6 : jsDay - 1;
    days[idx].totalHours += s.durationMinutes / 60;
    days[idx].sessionCount++;
  }

  // Round hours
  for (const d of days) {
    d.totalHours = Math.round(d.totalHours * 10) / 10;
  }

  return days;
}

/**
 * Compute activity quick stats with trend comparisons.
 */
export function computeActivityQuickStats(sessions: GameSession[]): ActivityQuickStats {
  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - 7 * 24 * 60 * 60;
  const twoWeeksAgo = now - 14 * 24 * 60 * 60;
  const monthAgo = now - 30 * 24 * 60 * 60;
  const twoMonthsAgo = now - 60 * 24 * 60 * 60;

  let weeklyMinutes = 0;
  let previousWeekMinutes = 0;
  let monthlyMinutes = 0;
  let previousMonthMinutes = 0;
  let totalSessions = 0;
  let totalDuration = 0;

  for (const s of sessions) {
    if (s.durationMinutes == null) continue;
    totalSessions++;
    totalDuration += s.durationMinutes;

    if (s.startTime >= weekAgo) {
      weeklyMinutes += s.durationMinutes;
    } else if (s.startTime >= twoWeeksAgo) {
      previousWeekMinutes += s.durationMinutes;
    }

    if (s.startTime >= monthAgo) {
      monthlyMinutes += s.durationMinutes;
    } else if (s.startTime >= twoMonthsAgo) {
      previousMonthMinutes += s.durationMinutes;
    }
  }

  return {
    weeklyMinutes,
    monthlyMinutes,
    previousWeekMinutes,
    previousMonthMinutes,
    totalSessions,
    averageSessionMinutes:
      totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0,
  };
}

// ── Session Filters (for drill-down) ─────────────────────────────

/**
 * Filter sessions that started on a specific date (YYYY-MM-DD).
 */
export function filterSessionsByDate(
  sessions: GameSession[],
  dateKey: string,
): GameSession[] {
  return sessions.filter((s) => toDateKey(s.startTime) === dateKey);
}

/**
 * Filter sessions for a specific game.
 */
export function filterSessionsByGame(
  sessions: GameSession[],
  gameId: string,
): GameSession[] {
  return sessions.filter((s) => s.gameId === gameId);
}

/**
 * Filter sessions by duration range (inclusive min, exclusive max).
 * Pass Infinity for max to match all sessions above min.
 */
export function filterSessionsByDurationRange(
  sessions: GameSession[],
  minMinutes: number,
  maxMinutes: number,
): GameSession[] {
  return sessions.filter((s) => {
    if (s.durationMinutes == null) return false;
    return s.durationMinutes >= minMinutes && s.durationMinutes < maxMinutes;
  });
}

/**
 * Filter sessions by day of week (Mon=0, Tue=1, ... Sun=6).
 */
export function filterSessionsByDayOfWeek(
  sessions: GameSession[],
  dayIndex: number,
): GameSession[] {
  return sessions.filter((s) => {
    const jsDay = new Date(s.startTime * 1000).getDay();
    const idx = jsDay === 0 ? 6 : jsDay - 1;
    return idx === dayIndex;
  });
}

/**
 * Filter sessions where the game has any of the specified tag IDs.
 * gameTagMap: gameId → tagId[]
 */
export function filterSessionsByTags(
  sessions: GameSession[],
  tagIds: number[],
  gameTagMap: Map<string, number[]>,
): GameSession[] {
  if (tagIds.length === 0) return sessions;
  const tagSet = new Set(tagIds);
  return sessions.filter((s) => {
    const gameTags = gameTagMap.get(s.gameId);
    if (!gameTags) return false;
    return gameTags.some((t) => tagSet.has(t));
  });
}

export function filterSessionsBySource(
  sessions: GameSession[],
  sources: string[],
  gameSourceMap: Map<string, string>,
): GameSession[] {
  if (sources.length === 0) return sessions;
  const sourceSet = new Set(sources);
  return sessions.filter((s) => {
    const source = gameSourceMap.get(s.gameId);
    return source != null && sourceSet.has(source);
  });
}

/**
 * Filter sessions where the game has any of the specified genre IDs.
 */
export function filterSessionsByGenre(
  sessions: GameSession[],
  genreIds: string[],
  metadataCache: Map<string, StoreMetadata>,
): GameSession[] {
  if (genreIds.length === 0) return sessions;
  const genreSet = new Set(genreIds);
  return sessions.filter((s) => {
    const meta = metadataCache.get(s.gameId);
    if (!meta) return false;
    return meta.genres.some((g) => genreSet.has(g.id));
  });
}

/**
 * Filter sessions where the game has any of the specified Steam community tag names.
 */
export function filterSessionsBySteamTag(
  sessions: GameSession[],
  tagNames: string[],
  metadataCache: Map<string, StoreMetadata>,
): GameSession[] {
  if (tagNames.length === 0) return sessions;
  const tagSet = new Set(tagNames);
  return sessions.filter((s) => {
    const meta = metadataCache.get(s.gameId);
    if (!meta) return false;
    return meta.steamTags.some((t) => tagSet.has(t.name));
  });
}

/**
 * Filter sessions where the game has any of the specified category/feature IDs.
 */
export function filterSessionsByCategory(
  sessions: GameSession[],
  categoryIds: number[],
  metadataCache: Map<string, StoreMetadata>,
): GameSession[] {
  if (categoryIds.length === 0) return sessions;
  const catSet = new Set(categoryIds);
  return sessions.filter((s) => {
    const meta = metadataCache.get(s.gameId);
    if (!meta) return false;
    return meta.categories.some((c) => catSet.has(c.id));
  });
}

// ── Memories ("On this day") ─────────────────────────────────────

/**
 * Compute "memories" — sessions from the same calendar week one month ago
 * and one year ago. Groups by game, sorted by total time descending.
 */
export function computeMemories(
  sessions: GameSession[],
  gameNames: Map<string, string>,
): MemoryEntry[] {
  const now = new Date();
  const entries: MemoryEntry[] = [];

  const periods: {
    offset: { months?: number; years?: number };
    period: "last-month" | "last-year";
    label: string;
  }[] = [
    { offset: { months: 1 }, period: "last-month", label: "This week, last month" },
    { offset: { years: 1 }, period: "last-year", label: "This week, last year" },
  ];

  for (const { offset, period, label } of periods) {
    // Compute the target week's date range
    const target = new Date(now);
    if (offset.months) target.setMonth(target.getMonth() - offset.months);
    if (offset.years) target.setFullYear(target.getFullYear() - offset.years);

    // Get Monday of that week
    const dayOfWeek = target.getDay();
    const monday = new Date(target);
    monday.setDate(target.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 7);

    const startTs = Math.floor(monday.getTime() / 1000);
    const endTs = Math.floor(sunday.getTime() / 1000);

    // Filter sessions in this date range
    const matching = sessions.filter(
      (s) => s.startTime >= startTs && s.startTime < endTs && s.durationMinutes != null,
    );

    if (matching.length === 0) continue;

    // Group by game
    const gameMap = new Map<string, number>();
    for (const s of matching) {
      gameMap.set(s.gameId, (gameMap.get(s.gameId) ?? 0) + (s.durationMinutes ?? 0));
    }

    const games = Array.from(gameMap.entries())
      .map(([gameId, totalMinutes]) => ({
        gameId,
        name: gameNames.get(gameId) ?? `Game ${gameId.slice(0, 8)}`,
        totalMinutes,
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    const totalMinutes = games.reduce((sum, g) => sum + g.totalMinutes, 0);

    entries.push({ period, periodLabel: label, games, totalMinutes });
  }

  return entries;
}
