import type { RecapData } from "../../../types";
import { RecapHeroSection } from "./sections/RecapHeroSection";
import { RecapStatsGrid } from "./sections/RecapStatsGrid";
import { RecapTopGames } from "./sections/RecapTopGames";
import { RecapGenreBreakdown } from "./sections/RecapGenreBreakdown";
import { RecapMonthlyTimeline } from "./sections/RecapMonthlyTimeline";
import { RecapDiscoveries } from "./sections/RecapDiscoveries";
import { RecapAchievements } from "./sections/RecapAchievements";
import { RecapFunComparisons } from "./sections/RecapFunComparisons";
import "./RecapView.css";
import "./sections/RecapSections.css";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatPeriodLabel(recap: RecapData): string {
  if (recap.periodType === "yearly") {
    return `${recap.periodKey} Year in Review`;
  }
  const [year, month] = recap.periodKey.split("-");
  const monthName = MONTH_NAMES[parseInt(month, 10) - 1] || month;
  return `${monthName} ${year}`;
}

interface RecapViewProps {
  recap: RecapData;
}

export function RecapView({ recap }: RecapViewProps) {
  const periodLabel = formatPeriodLabel(recap);
  const isYearly = recap.periodType === "yearly";

  if (recap.totalSessions === 0) {
    return (
      <div className="recap-view recap-view--empty">
        <h2>{periodLabel}</h2>
        <p className="recap-view__empty-msg">
          No gaming activity this period. You took a break!
        </p>
      </div>
    );
  }

  return (
    <div className="recap-view">
      <RecapHeroSection
        periodLabel={periodLabel}
        topGame={recap.topGame}
        totalMinutes={recap.totalMinutes}
        isYearly={isYearly}
      />

      <RecapStatsGrid
        totalMinutes={recap.totalMinutes}
        totalSessions={recap.totalSessions}
        uniqueGamesPlayed={recap.uniqueGamesPlayed}
        avgSessionMinutes={recap.avgSessionMinutes}
        longestSessionMinutes={recap.longestSessionMinutes}
        longestSessionGameName={recap.longestSessionGameName}
        longestStreakDays={recap.longestStreakDays}
        prevPeriodMinutes={recap.prevPeriodMinutes}
        busiestDay={recap.busiestDay}
      />

      {recap.topGames.length > 1 && <RecapTopGames topGames={recap.topGames} />}

      {recap.genreBreakdown.length > 0 && (
        <RecapGenreBreakdown genreBreakdown={recap.genreBreakdown} />
      )}

      {isYearly && recap.monthlyPlaytime && (
        <RecapMonthlyTimeline monthlyPlaytime={recap.monthlyPlaytime} />
      )}

      {recap.newDiscoveries.length > 0 && (
        <RecapDiscoveries discoveries={recap.newDiscoveries} />
      )}

      {recap.achievementsUnlocked > 0 && (
        <RecapAchievements
          total={recap.achievementsUnlocked}
          notable={recap.notableAchievements}
        />
      )}

      {recap.funComparisons.length > 0 && (
        <RecapFunComparisons comparisons={recap.funComparisons} />
      )}
    </div>
  );
}
