import type { GameSession } from "../types";

export interface StreakInfo {
  current: number;
  longest: number;
}

function toDateKey(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
}

export function calculatePlayStreak(sessions: GameSession[]): StreakInfo {
  if (sessions.length === 0) return { current: 0, longest: 0 };

  // Collect unique play dates
  const dateSet = new Set<string>();
  for (const s of sessions) {
    if (s.durationMinutes != null && s.durationMinutes > 0) {
      dateSet.add(toDateKey(s.startTime));
    }
  }

  if (dateSet.size === 0) return { current: 0, longest: 0 };

  const dates = Array.from(dateSet).sort().reverse(); // newest first
  const today = toDateKey(Math.floor(Date.now() / 1000));

  // Current streak: count consecutive days ending today or yesterday
  let current = 0;
  const firstDate = dates[0];
  const gapFromToday = daysBetween(today, firstDate);

  if (gapFromToday <= 1) {
    current = 1;
    for (let i = 1; i < dates.length; i++) {
      if (daysBetween(dates[i - 1], dates[i]) === 1) {
        current++;
      } else {
        break;
      }
    }
  }

  // Longest streak: find longest consecutive run
  const sortedAsc = [...dates].reverse();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sortedAsc.length; i++) {
    if (daysBetween(sortedAsc[i], sortedAsc[i - 1]) === 1) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  return { current, longest };
}

export function computePlaytimeInRange(
  sessions: GameSession[],
  startTimestamp: number,
): number {
  let total = 0;
  for (const s of sessions) {
    if (s.startTime >= startTimestamp && s.durationMinutes != null) {
      total += s.durationMinutes;
    }
  }
  return total;
}
