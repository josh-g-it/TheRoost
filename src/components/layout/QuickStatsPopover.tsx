import { useLibraryStore } from "../../store/librarySlice";
import { useFavoritesStore } from "../../store/favoritesSlice";
import { formatPlaytime } from "../../utils/formatters";
import type { Game } from "../../types/game";
import "./QuickStatsPopover.css";

interface QuickStatsPopoverProps {
  /** Override games list (used by overlay which has no Zustand store) */
  games?: Game[];
  /** Override favorites count (used by overlay) */
  favoritesCount?: number;
}

export function QuickStatsPopover(props: QuickStatsPopoverProps) {
  // Always call hooks (can't conditionally call), use props when provided
  const library = useLibraryStore((s) => s.library);
  const favorites = useFavoritesStore((s) => s.favorites);

  const games = props.games ?? library?.games ?? [];
  const totalGames = games.length;
  const totalPlaytime = games.reduce((sum, g) => sum + g.playtimeForever, 0);
  const installedCount = games.filter((g) => g.isInstalled).length;
  const favoritesCount = props.favoritesCount ?? favorites.size;
  const playedCount = games.filter((g) => g.playtimeForever > 0).length;
  const neverPlayed = totalGames - playedCount;

  return (
    <div className="quick-stats-popover">
      <div className="quick-stats-popover__title">Quick Stats</div>
      <div className="quick-stats-popover__grid">
        <div className="quick-stats-popover__item">
          <span className="quick-stats-popover__value">{totalGames}</span>
          <span className="quick-stats-popover__label">Total Games</span>
        </div>
        <div className="quick-stats-popover__item">
          <span className="quick-stats-popover__value">
            {formatPlaytime(totalPlaytime)}
          </span>
          <span className="quick-stats-popover__label">Total Playtime</span>
        </div>
        <div className="quick-stats-popover__item">
          <span className="quick-stats-popover__value">{installedCount}</span>
          <span className="quick-stats-popover__label">Installed</span>
        </div>
        <div className="quick-stats-popover__item">
          <span className="quick-stats-popover__value">{favoritesCount}</span>
          <span className="quick-stats-popover__label">Favorites</span>
        </div>
        <div className="quick-stats-popover__item">
          <span className="quick-stats-popover__value">{playedCount}</span>
          <span className="quick-stats-popover__label">Played</span>
        </div>
        <div className="quick-stats-popover__item">
          <span className="quick-stats-popover__value">{neverPlayed}</span>
          <span className="quick-stats-popover__label">Unplayed</span>
        </div>
      </div>
    </div>
  );
}
