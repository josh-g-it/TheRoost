import { GameListItem } from "./GameListItem";
import { useMetadataStore } from "../../store/metadataSlice";
import { useTagsStore } from "../../store/tagsSlice";
import { useFavoritesStore } from "../../store/favoritesSlice";
import { useHiddenGamesStore } from "../../store/hiddenGamesSlice";
import { useUIStore } from "../../store/uiSlice";
import type { Game, SortBy } from "../../types";
import "./GameList.css";

interface GameListProps {
  games: Game[];
  onSelectGame: (gameId: string) => void;
}

export function GameList({ games, onSelectGame }: GameListProps) {
  const getMetadata = useMetadataStore((s) => s.getMetadata);
  const tags = useTagsStore((s) => s.tags);
  const getGameTagIds = useTagsStore((s) => s.getGameTagIds);
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  const favorites = useFavoritesStore((s) => s.favorites);
  const toggleHidden = useHiddenGamesStore((s) => s.toggleHidden);
  const hiddenGames = useHiddenGamesStore((s) => s.hiddenGames);
  const cardDisplay = useUIStore((s) => s.cardDisplay);
  const { sortBy, setSorting } = useUIStore();

  const getGameTags = (gameId: string) => {
    const ids = getGameTagIds(gameId);
    return tags.filter((t) => ids.includes(t.id));
  };

  const handleHeaderClick = (column: SortBy) => {
    setSorting(column);
  };

  if (games.length === 0) {
    return (
      <div className="game-list__empty">
        <p>No games found</p>
      </div>
    );
  }

  return (
    <div
      className={`game-list ${cardDisplay.listDensity !== "default" ? `game-list--${cardDisplay.listDensity}` : ""}`}
    >
      <div className="game-list__header">
        <span />
        <span />
        <span
          className={`game-list__col game-list__col--sortable ${sortBy === "name" ? "game-list__col--sorted" : ""}`}
          onClick={() => handleHeaderClick("name")}
        >
          Name
        </span>
        <span
          className={`game-list__col game-list__col--right game-list__col--sortable ${sortBy === "playtime" ? "game-list__col--sorted" : ""}`}
          onClick={() => handleHeaderClick("playtime")}
        >
          Playtime
        </span>
        <span
          className={`game-list__col game-list__col--right game-list__col--sortable ${sortBy === "lastPlayed" ? "game-list__col--sorted" : ""}`}
          onClick={() => handleHeaderClick("lastPlayed")}
        >
          Last Played
        </span>
        <span
          className={`game-list__col game-list__col--right game-list__col--sortable ${sortBy === "size" ? "game-list__col--sorted" : ""}`}
          onClick={() => handleHeaderClick("size")}
        >
          Size
        </span>
      </div>
      {games.map((game) => (
        <GameListItem
          key={game.gameId}
          game={game}
          onClick={() => onSelectGame(game.gameId)}
          genres={getMetadata(game.gameId)?.genres}
          cardDisplay={cardDisplay}
          isFavorite={favorites.has(game.gameId)}
          onToggleFavorite={() => toggleFavorite(game.gameId)}
          userTags={getGameTags(game.gameId)}
          isHidden={hiddenGames.has(game.gameId)}
          onToggleHidden={() => toggleHidden(game.gameId)}
        />
      ))}
    </div>
  );
}
