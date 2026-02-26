import type { RecapBusiestDay } from "../../../../types";
import { formatDuration } from "../../../../utils/formatters";
import { StatCard } from "../../../common/StatCard";

interface RecapStatsGridProps {
  totalMinutes: number;
  totalSessions: number;
  uniqueGamesPlayed: number;
  avgSessionMinutes: number;
  longestSessionMinutes: number;
  longestSessionGameName: string;
  longestStreakDays: number;
  prevPeriodMinutes: number;
  busiestDay: RecapBusiestDay;
}

export function RecapStatsGrid({
  totalMinutes,
  totalSessions,
  uniqueGamesPlayed,
  avgSessionMinutes,
  longestSessionMinutes,
  longestSessionGameName,
  longestStreakDays,
  prevPeriodMinutes,
  busiestDay,
}: RecapStatsGridProps) {
  const trendPct =
    prevPeriodMinutes > 0
      ? Math.round(((totalMinutes - prevPeriodMinutes) / prevPeriodMinutes) * 100)
      : null;

  const trendText =
    trendPct !== null
      ? trendPct > 0
        ? `+${trendPct}% vs last period`
        : trendPct < 0
          ? `${trendPct}% vs last period`
          : "Same as last period"
      : undefined;

  return (
    <div className="recap-stats-grid">
      <StatCard
        label="Total Playtime"
        value={formatDuration(totalMinutes)}
        secondary={trendText}
      />
      <StatCard label="Sessions" value={String(totalSessions)} />
      <StatCard label="Unique Games" value={String(uniqueGamesPlayed)} />
      <StatCard label="Avg Session" value={formatDuration(avgSessionMinutes)} />
      <StatCard
        label="Longest Session"
        value={formatDuration(longestSessionMinutes)}
        secondary={longestSessionGameName}
      />
      <StatCard
        label="Play Streak"
        value={`${longestStreakDays} day${longestStreakDays !== 1 ? "s" : ""}`}
      />
      <StatCard
        label="Busiest Day"
        value={busiestDay.day}
        secondary={formatDuration(busiestDay.minutes)}
      />
    </div>
  );
}
