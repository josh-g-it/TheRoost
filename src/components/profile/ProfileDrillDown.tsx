import { DrillDownOverlay } from "../common/DrillDownOverlay";
import { formatPlaytime, getSourceDisplayName } from "../../utils/formatters";
import type { ProfileDrillDownContext } from "../../types/profile";
import type { GameSource } from "../../types/game";
import "./ProfileDrillDown.css";

interface ProfileDrillDownProps {
  context: ProfileDrillDownContext;
  onClose: () => void;
}

export function ProfileDrillDown({ context, onClose }: ProfileDrillDownProps) {
  return (
    <DrillDownOverlay title={context.title} subtitle={context.subtitle} onClose={onClose}>
      {context.games.length === 0 ? (
        <p className="profile-drill-down__empty">No games found for this selection.</p>
      ) : (
        <div className="profile-drill-down__list">
          {context.games.map((game) => (
            <div key={game.gameId} className="profile-drill-down__row">
              <div className="profile-drill-down__game-info">
                <span className="profile-drill-down__game-name">{game.name}</span>
                <span className="profile-drill-down__game-source">
                  {getSourceDisplayName(game.source as GameSource)}
                </span>
              </div>
              <span className="profile-drill-down__game-playtime">
                {formatPlaytime(game.playtimeMinutes)}
              </span>
            </div>
          ))}
        </div>
      )}
    </DrillDownOverlay>
  );
}
