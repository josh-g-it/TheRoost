import type { RecapTopGame } from "../../../../types";
import { formatDuration } from "../../../../utils/formatters";

interface RecapHeroSectionProps {
  periodLabel: string;
  topGame: RecapTopGame;
  totalMinutes: number;
  isYearly: boolean;
}

export function RecapHeroSection({
  periodLabel,
  topGame,
  totalMinutes,
  isYearly,
}: RecapHeroSectionProps) {
  return (
    <div className="recap-hero">
      <div className="recap-hero__header">
        <h2 className="recap-hero__period">{periodLabel}</h2>
        <div className="recap-hero__total">
          <span className="recap-hero__total-value">{formatDuration(totalMinutes)}</span>
          <span className="recap-hero__total-label">total playtime</span>
        </div>
      </div>

      <div className="recap-hero__spotlight">
        <div className="recap-hero__spotlight-label">
          {isYearly ? "Game of the Year" : "Game of the Month"}
        </div>
        <div className="recap-hero__spotlight-name">{topGame.name}</div>
        <div className="recap-hero__spotlight-stats">
          {formatDuration(topGame.minutes)} across {topGame.sessions} session
          {topGame.sessions !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}
