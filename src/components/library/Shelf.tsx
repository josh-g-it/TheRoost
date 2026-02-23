import { useCallback, useMemo, useState } from "react";
import type { ShelfConfig, Game, ViewMode } from "../../types";
import type { GenreGroup } from "../../utils/shelfFiltering";
import { groupGamesByGenre } from "../../utils/shelfFiltering";
import { useMetadataStore } from "../../store/metadataSlice";
import { useUIStore } from "../../store/uiSlice";
import { useShelvesStore } from "../../store/shelvesSlice";
import { ShelfHeader } from "./ShelfHeader";
import { HorizontalScrollRow } from "./HorizontalScrollRow";
import { GameGrid } from "./GameGrid";
import { GameList } from "./GameList";
import "./Shelf.css";

interface ShelfProps {
  shelf: ShelfConfig;
  games: Game[];
  shelfIndex: number;
  shelfCount: number;
  onSelectGame: (gameId: string) => void;
  onPersist: () => void;
}

const DRAG_TYPE = "application/x-shelf-index";

const LIST_LIMITS: Record<string, number> = {
  collapsed: 5,
  extended: 12,
};

export function Shelf({
  shelf,
  games,
  shelfIndex,
  shelfCount,
  onSelectGame,
  onPersist,
}: ShelfProps) {
  const viewMode = useUIStore((s) => s.viewMode) as ViewMode;
  const cache = useMetadataStore((s) => s.cache);
  const setDisplayMode = useShelvesStore((s) => s.setDisplayMode);
  const reorderShelves = useShelvesStore((s) => s.reorderShelves);
  const [dragOver, setDragOver] = useState(false);

  const genreGroups = useMemo<GenreGroup[] | null>(() => {
    if (!shelf.groupByGenre) return null;
    return groupGamesByGenre(games, cache);
  }, [shelf.groupByGenre, games, cache]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, String(shelfIndex));
      e.dataTransfer.effectAllowed = "move";
    },
    [shelfIndex],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const fromIndex = Number(e.dataTransfer.getData(DRAG_TYPE));
      if (!isNaN(fromIndex) && fromIndex !== shelfIndex) {
        reorderShelves(fromIndex, shelfIndex);
        onPersist();
      }
    },
    [shelfIndex, reorderShelves, onPersist],
  );

  const shelfClassName = `shelf${dragOver ? " shelf--drag-over" : ""}`;

  if (games.length === 0) {
    return (
      <div
        className={shelfClassName}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <ShelfHeader
          shelf={shelf}
          gameCount={0}
          shelfCount={shelfCount}
          shelfIndex={shelfIndex}
          onPersist={onPersist}
        />
        <div className="shelf__empty">No games match this shelf</div>
      </div>
    );
  }

  return (
    <div
      className={shelfClassName}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ShelfHeader
        shelf={shelf}
        gameCount={games.length}
        shelfCount={shelfCount}
        shelfIndex={shelfIndex}
        onPersist={onPersist}
      />

      {shelf.groupByGenre && genreGroups ? (
        // Genre-grouped rendering
        genreGroups.map((group) => (
          <div key={group.genreId} className="shelf__genre-group">
            <div className="shelf__genre-heading">
              {group.genreName}
              <span className="shelf__genre-count">({group.games.length})</span>
            </div>
            <ShelfContent
              games={group.games}
              displayMode={shelf.displayMode}
              viewMode={viewMode}
              onSelectGame={onSelectGame}
              shelfId={shelf.id}
              setDisplayMode={setDisplayMode}
              onPersist={onPersist}
            />
          </div>
        ))
      ) : (
        // Flat rendering
        <ShelfContent
          games={games}
          displayMode={shelf.displayMode}
          viewMode={viewMode}
          onSelectGame={onSelectGame}
          shelfId={shelf.id}
          setDisplayMode={setDisplayMode}
          onPersist={onPersist}
        />
      )}
    </div>
  );
}

/** Renders game content based on display mode and view mode */
function ShelfContent({
  games,
  displayMode,
  viewMode,
  onSelectGame,
  shelfId,
  setDisplayMode,
  onPersist,
}: {
  games: Game[];
  displayMode: ShelfConfig["displayMode"];
  viewMode: ViewMode;
  onSelectGame: (gameId: string) => void;
  shelfId: string;
  setDisplayMode: (id: string, mode: ShelfConfig["displayMode"]) => void;
  onPersist: () => void;
}) {
  // Grid view
  if (viewMode === "grid") {
    if (displayMode === "collapsed") {
      return <HorizontalScrollRow games={games} rows={1} onSelectGame={onSelectGame} />;
    }
    if (displayMode === "extended") {
      return <HorizontalScrollRow games={games} rows={2} onSelectGame={onSelectGame} />;
    }
    return <GameGrid games={games} onSelectGame={onSelectGame} />;
  }

  // List view
  if (displayMode === "expanded") {
    return <GameList games={games} onSelectGame={onSelectGame} />;
  }

  // List view truncated
  const limit = LIST_LIMITS[displayMode] ?? 5;
  const truncated = games.slice(0, limit);
  const hasMore = games.length > limit;

  return (
    <>
      <GameList games={truncated} onSelectGame={onSelectGame} />
      {hasMore && (
        <button
          className="shelf__show-all"
          onClick={() => {
            setDisplayMode(shelfId, "expanded");
            onPersist();
          }}
        >
          Show all {games.length} games
        </button>
      )}
    </>
  );
}
