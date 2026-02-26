import type { RecapAchievement } from "../../../../types";

interface RecapAchievementsProps {
  total: number;
  notable: RecapAchievement[];
}

export function RecapAchievements({ total, notable }: RecapAchievementsProps) {
  return (
    <div className="recap-section">
      <h3 className="recap-section__title">Achievements Unlocked ({total})</h3>
      {notable.length > 0 && (
        <>
          <p className="recap-section__subtitle">Rarest unlocks</p>
          <div className="recap-achievements__list">
            {notable.map((a, i) => (
              <div key={i} className="recap-achievements__item">
                <div className="recap-achievements__name">{a.achievementName}</div>
                <div className="recap-achievements__meta">
                  <span className="recap-achievements__game">{a.gameName}</span>
                  <span className="recap-achievements__rarity">
                    {a.rarity.toFixed(1)}% of players
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
