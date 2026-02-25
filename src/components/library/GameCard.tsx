import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { GameImage } from "./GameImage";
import { GenreTag } from "../common/GenreTag";
import { UserTag } from "../common/UserTag";
import { AppIcon } from "../common/AppIcon";
import { StarRating } from "../common/StarRating";
import { useTagsStore } from "../../store/tagsSlice";
import { useRatingsStore } from "../../store/ratingsSlice";
import { useUIStore } from "../../store/uiSlice";
import { formatPlaytime } from "../../utils/formatters";
import type { Game, GenreInfo, Tag, CardDisplayOptions } from "../../types";
import "./GameCard.css";

interface GameCardProps {
  game: Game;
  onClick: () => void;
  genres?: GenreInfo[];
  cardDisplay: CardDisplayOptions;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  userTags?: Tag[];
  isHidden: boolean;
  onToggleHidden: () => void;
  ratingValue?: number;
}

export function GameCard({
  game,
  onClick,
  genres,
  cardDisplay,
  isFavorite,
  onToggleFavorite,
  userTags,
  isHidden,
  onToggleHidden,
  ratingValue,
}: GameCardProps) {
  const allTags = useTagsStore((s) => s.tags);
  const getGameTagIds = useTagsStore((s) => s.getGameTagIds);
  const setGameTags = useTagsStore((s) => s.setGameTags);
  const saveRating = useRatingsStore((s) => s.saveRating);
  const deleteRating = useRatingsStore((s) => s.deleteRating);
  const openArtPicker = useUIStore((s) => s.openArtPicker);
  const artVersion = useUIStore((s) => s.artVersion[game.gameId] ?? 0);
  const isNonSteam = game.source && game.source !== "steam";

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleToggleTag = (tagId: number) => {
    const currentIds = getGameTagIds(game.gameId);
    if (currentIds.includes(tagId)) {
      setGameTags(
        game.gameId,
        currentIds.filter((id) => id !== tagId),
      );
    } else {
      setGameTags(game.gameId, [...currentIds, tagId]);
    }
  };

  return (
    <div
      className="game-card"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <GameImage
        key={`card-${artVersion}`}
        gameId={game.gameId}
        sourceId={game.sourceId}
        source={game.source}
        name={game.name}
        type="header"
        className="game-card__image"
      />
      {isNonSteam && (
        <button
          className="game-card__edit-art"
          onClick={(e) => {
            e.stopPropagation();
            openArtPicker(game.gameId, "grid");
          }}
          aria-label="Change cover art"
        >
          <AppIcon name="edit" size={14} />
        </button>
      )}
      <button
        className={`game-card__favorite ${isFavorite ? "game-card__favorite--active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={isFavorite}
      >
        <AppIcon name={isFavorite ? "star-filled" : "star-outline"} size={16} />
      </button>
      <div className="game-card__overlay">
        <h3 className="game-card__title">{game.name}</h3>
        {cardDisplay.showGenreTags && genres && genres.length > 0 && (
          <div className="game-card__genres">
            {genres.slice(0, 2).map((g) => (
              <GenreTag key={g.id} label={g.description} />
            ))}
          </div>
        )}
        {cardDisplay.showTags && userTags && userTags.length > 0 && (
          <div className="game-card__user-tags">
            {userTags.slice(0, 3).map((t) => (
              <UserTag key={t.id} label={t.name} colorIndex={t.colorIndex} />
            ))}
          </div>
        )}
        <div className="game-card__meta">
          {cardDisplay.showPlaytime && (
            <span className="game-card__playtime">
              {formatPlaytime(game.playtimeForever)}
            </span>
          )}
          {cardDisplay.showInstalledBadge && game.isInstalled && (
            <span className="game-card__installed">Installed</span>
          )}
          {cardDisplay.showRatingBadge && ratingValue != null && ratingValue > 0 && (
            <span className="game-card__rating-badge">
              <AppIcon name="star-filled" size={10} />
              {(ratingValue / 2).toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {contextMenu &&
        createPortal(
          <div
            ref={menuRef}
            className="game-card__context-menu"
            style={{
              position: "fixed",
              top: contextMenu.y,
              left: contextMenu.x,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="game-card__context-item"
              onClick={() => {
                onToggleHidden();
                setContextMenu(null);
              }}
            >
              {isHidden ? "Unhide game" : "Hide game"}
            </button>
            <div className="game-card__context-separator" />
            <div className="game-card__context-label">Rate</div>
            <div className="game-card__context-rating">
              <StarRating
                value={ratingValue ?? 0}
                onChange={(v) => {
                  saveRating(game.gameId, v, null);
                  setContextMenu(null);
                }}
                size={16}
              />
              {ratingValue != null && ratingValue > 0 && (
                <button
                  className="game-card__context-item game-card__context-item--danger"
                  onClick={() => {
                    deleteRating(game.gameId);
                    setContextMenu(null);
                  }}
                >
                  Clear rating
                </button>
              )}
            </div>
            {allTags.length > 0 && (
              <>
                <div className="game-card__context-separator" />
                <div className="game-card__context-label">Custom Tags</div>
                {allTags.map((tag) => {
                  const assigned = getGameTagIds(game.gameId).includes(tag.id);
                  return (
                    <label key={tag.id} className="game-card__context-tag">
                      <input
                        type="checkbox"
                        checked={assigned}
                        onChange={() => handleToggleTag(tag.id)}
                      />
                      <span
                        className="game-card__context-tag-color"
                        style={{ backgroundColor: `var(--tag-color-${tag.colorIndex})` }}
                      />
                      {tag.name}
                    </label>
                  );
                })}
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
