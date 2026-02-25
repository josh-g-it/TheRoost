import { useRef, useState, useCallback, useEffect } from "react";
import { GameCard } from "./GameCard";
import { AppIcon } from "../common/AppIcon";
import { useMetadataStore } from "../../store/metadataSlice";
import { useTagsStore } from "../../store/tagsSlice";
import { useFavoritesStore } from "../../store/favoritesSlice";
import { useHiddenGamesStore } from "../../store/hiddenGamesSlice";
import { useRatingsStore } from "../../store/ratingsSlice";
import { useUIStore } from "../../store/uiSlice";
import { GRID_SIZE_CONFIG } from "../../types";
import type { Game } from "../../types";
import "./HorizontalScrollRow.css";

interface HorizontalScrollRowProps {
  games: Game[];
  rows: 1 | 2;
  onSelectGame: (gameId: string) => void;
}

export function HorizontalScrollRow({
  games,
  rows,
  onSelectGame,
}: HorizontalScrollRowProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const getMetadata = useMetadataStore((s) => s.getMetadata);
  const tags = useTagsStore((s) => s.tags);
  const getGameTagIds = useTagsStore((s) => s.getGameTagIds);
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  const favorites = useFavoritesStore((s) => s.favorites);
  const toggleHidden = useHiddenGamesStore((s) => s.toggleHidden);
  const hiddenGames = useHiddenGamesStore((s) => s.hiddenGames);
  const ratings = useRatingsStore((s) => s.ratings);
  const cardDisplay = useUIStore((s) => s.cardDisplay);

  const cardWidth = GRID_SIZE_CONFIG[cardDisplay.gridSize].minWidth;

  const getGameTags = (gameId: string) => {
    const ids = getGameTagIds(gameId);
    return tags.filter((t) => ids.includes(t.id));
  };

  const updateScrollState = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState, games.length]);

  const scroll = (direction: "left" | "right") => {
    const el = trackRef.current;
    if (!el) return;
    const amount = cardWidth * 2 + 16; // 2 cards + gap
    el.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  if (games.length === 0) {
    return (
      <div className="hscroll-row">
        <div
          className="hscroll-row__track"
          style={{
            padding: "var(--space-lg) var(--space-md)",
            color: "var(--color-text-tertiary)",
            fontSize: "var(--font-size-sm)",
          }}
        >
          No games match this shelf
        </div>
      </div>
    );
  }

  const trackClass = rows === 2 ? "hscroll-row__track--two-rows" : "hscroll-row__track";

  return (
    <div className="hscroll-row">
      <button
        className={`hscroll-row__arrow hscroll-row__arrow--left ${canScrollLeft ? "hscroll-row__arrow--visible" : ""}`}
        onClick={() => scroll("left")}
        aria-label="Scroll left"
        tabIndex={-1}
      >
        <AppIcon name="chevron-left" size={20} />
      </button>

      <div ref={trackRef} className={trackClass}>
        {games.map((game) => (
          <div
            key={game.gameId}
            className="hscroll-row__card"
            style={{ width: `${cardWidth}px` }}
          >
            <GameCard
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
            />
          </div>
        ))}
      </div>

      <button
        className={`hscroll-row__arrow hscroll-row__arrow--right ${canScrollRight ? "hscroll-row__arrow--visible" : ""}`}
        onClick={() => scroll("right")}
        aria-label="Scroll right"
        tabIndex={-1}
      >
        <AppIcon name="chevron-right" size={20} />
      </button>
    </div>
  );
}
