import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { GameImage } from "./GameImage";
import { GenreTag } from "../common/GenreTag";
import { UserTag } from "../common/UserTag";
import { AppIcon } from "../common/AppIcon";
import { StarRating } from "../common/StarRating";
import { useTagsStore } from "../../store/tagsSlice";
import { formatPlaytime, formatBytes, formatLastPlayed } from "../../utils/formatters";
import type { Game, GenreInfo, Tag, CardDisplayOptions } from "../../types";
import "./GameListItem.css";

interface GameListItemProps {
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

export function GameListItem({
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
}: GameListItemProps) {
  const allTags = useTagsStore((s) => s.tags);
  const getGameTagIds = useTagsStore((s) => s.getGameTagIds);
  const setGameTags = useTagsStore((s) => s.setGameTags);

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
      className="game-list-item"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <button
        className={`game-list-item__favorite ${isFavorite ? "game-list-item__favorite--active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={isFavorite}
      >
        <AppIcon name={isFavorite ? "star-filled" : "star-outline"} size={14} />
      </button>
      <GameImage
        gameId={game.gameId}
        sourceId={game.sourceId}
        source={game.source}
        name={game.name}
        type="header"
        className="game-list-item__image"
      />
      <div className="game-list-item__info">
        <span className="game-list-item__name">{game.name}</span>
        {cardDisplay.showInstalledBadge && game.isInstalled && (
          <span className="game-list-item__badge">Installed</span>
        )}
        {cardDisplay.showGenreTags && genres && genres.length > 0 && (
          <span className="game-list-item__genres">
            {genres.slice(0, 2).map((g) => (
              <GenreTag key={g.id} label={g.description} />
            ))}
          </span>
        )}
        {cardDisplay.showTags && userTags && userTags.length > 0 && (
          <span className="game-list-item__user-tags">
            {userTags.slice(0, 2).map((t) => (
              <UserTag key={t.id} label={t.name} colorIndex={t.colorIndex} />
            ))}
          </span>
        )}
      </div>
      <span className="game-list-item__playtime">
        {cardDisplay.showPlaytime ? formatPlaytime(game.playtimeForever) : ""}
      </span>
      <span className="game-list-item__last-played">
        {formatLastPlayed(game.lastPlayed)}
      </span>
      <span className="game-list-item__size">
        {game.sizeOnDisk ? formatBytes(game.sizeOnDisk) : "\u2014"}
      </span>
      <span className="game-list-item__rating">
        {ratingValue ? <StarRating value={ratingValue} size={12} /> : "\u2014"}
      </span>

      {contextMenu &&
        createPortal(
          <div
            ref={menuRef}
            className="game-list-item__context-menu"
            style={{
              position: "fixed",
              top: contextMenu.y,
              left: contextMenu.x,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="game-list-item__context-item"
              onClick={() => {
                onToggleHidden();
                setContextMenu(null);
              }}
            >
              {isHidden ? "Unhide game" : "Hide game"}
            </button>
            {allTags.length > 0 && (
              <>
                <div className="game-list-item__context-separator" />
                <div className="game-list-item__context-label">Custom Tags</div>
                {allTags.map((tag) => {
                  const assigned = getGameTagIds(game.gameId).includes(tag.id);
                  return (
                    <label key={tag.id} className="game-list-item__context-tag">
                      <input
                        type="checkbox"
                        checked={assigned}
                        onChange={() => handleToggleTag(tag.id)}
                      />
                      <span
                        className="game-list-item__context-tag-color"
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
