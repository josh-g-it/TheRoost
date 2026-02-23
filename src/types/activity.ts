export interface DailyPlaytimePoint {
  date: string; // "Feb 14" display label
  dateKey: string; // "2026-02-14" for sorting
  hours: number;
  minutes: number;
  sessionCount: number;
}

export interface MostPlayedEntry {
  gameId: string;
  name: string;
  totalMinutes: number;
  totalHours: number;
  sessionCount: number;
}

export interface SessionLengthBucket {
  label: string;
  min: number; // minutes
  max: number; // minutes (Infinity for last bucket)
  count: number;
}

export interface DayOfWeekEntry {
  day: string; // "Mon", "Tue", etc.
  dayIndex: number; // 0=Mon, 1=Tue, ... 6=Sun
  totalHours: number;
  sessionCount: number;
}

export interface ActivityQuickStats {
  weeklyMinutes: number;
  monthlyMinutes: number;
  previousWeekMinutes: number;
  previousMonthMinutes: number;
  totalSessions: number;
  averageSessionMinutes: number;
}
