import type { MemoryEntry } from "../../../utils/activityStats";
import { formatDuration } from "../../../utils/formatters";
import "./MemoriesCard.css";

interface MemoriesCardProps {
  memories: MemoryEntry[];
}

export function MemoriesCard({ memories }: MemoriesCardProps) {
  if (memories.length === 0) {
    return (
      <div className="memories-card memories-card--empty">
        <p className="memories-card__empty-text">
          No gaming memories for this period yet. Keep playing and check back later!
        </p>
      </div>
    );
  }

  return (
    <div className="memories-card">
      {memories.map((entry) => (
        <div key={entry.period} className="memories-card__section">
          <h4 className="memories-card__period-label">{entry.periodLabel}</h4>
          <p className="memories-card__period-total">
            {formatDuration(entry.totalMinutes)} total across {entry.games.length} game
            {entry.games.length !== 1 ? "s" : ""}
          </p>
          <ul className="memories-card__game-list">
            {entry.games.map((game) => (
              <li key={game.gameId} className="memories-card__game">
                <span className="memories-card__game-name">{game.name}</span>
                <span className="memories-card__game-time">
                  {formatDuration(game.totalMinutes)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
