import { GameCard } from "./GameCard";
import { useMetadataStore } from "../../store/metadataSlice";
import { useTagsStore } from "../../store/tagsSlice";
import { useFavoritesStore } from "../../store/favoritesSlice";
import { useHiddenGamesStore } from "../../store/hiddenGamesSlice";
import { useRatingsStore } from "../../store/ratingsSlice";
import { useUIStore } from "../../store/uiSlice";
import { GRID_SIZE_CONFIG } from "../../types";
import type { Game } from "../../types";
import "./GameGrid.css";

interface GameGridProps {
  games: Game[];
  onSelectGame: (gameId: string) => void;
  onPersistShelves: () => void;
}

export function GameGrid({ games, onSelectGame, onPersistShelves }: GameGridProps) {
  const getMetadata = useMetadataStore((s) => s.getMetadata);
  const tags = useTagsStore((s) => s.tags);
  const getGameTagIds = useTagsStore((s) => s.getGameTagIds);
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  const favorites = useFavoritesStore((s) => s.favorites);
  const toggleHidden = useHiddenGamesStore((s) => s.toggleHidden);
  const hiddenGames = useHiddenGamesStore((s) => s.hiddenGames);
  const ratings = useRatingsStore((s) => s.ratings);
  const cardDisplay = useUIStore((s) => s.cardDisplay);

  const gridMinWidth = GRID_SIZE_CONFIG[cardDisplay.gridSize].minWidth;

  const getGameTags = (gameId: string) => {
    const ids = getGameTagIds(gameId);
    return tags.filter((t) => ids.includes(t.id));
  };

  if (games.length === 0) {
    return (
      <div className="game-grid__empty">
        <p>No games found</p>
      </div>
    );
  }

  return (
    <div
      className="game-grid"
      style={{ "--grid-min-width": `${gridMinWidth}px` } as React.CSSProperties}
    >
      {games.map((game) => (
        <GameCard
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
          ratingValue={ratings.get(game.gameId)?.rating}
          onPersistShelves={onPersistShelves}
        />
      ))}
    </div>
  );
}
