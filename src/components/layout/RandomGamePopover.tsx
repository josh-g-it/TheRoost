import { useMemo, useState } from "react";
import { useLibraryStore } from "../../store/librarySlice";
import { GameImage } from "../library/GameImage";
import { AppIcon } from "../common/AppIcon";
import { logger } from "../../utils/logger";
import { invoke } from "@tauri-apps/api/core";
import type { Game } from "../../types/game";
import "./RandomGamePopover.css";

interface RandomGamePopoverProps {
  onClose: () => void;
  /** Override games list (used by overlay which has no Zustand store) */
  games?: Game[];
}

function pickRandomFrom<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

export function RandomGamePopover({ onClose, games: propGames }: RandomGamePopoverProps) {
  // Always call hooks (can't conditionally call), use props when provided
  const library = useLibraryStore((s) => s.library);
  const games = useMemo(() => propGames ?? library?.games ?? [], [propGames, library]);

  const [game, setGame] = useState(() => pickRandomFrom(games));

  const handleReroll = () => {
    setGame(pickRandomFrom(games));
  };

  const handleLaunch = async () => {
    if (!game) return;
    logger.info("RandomGamePopover", "launch", "Launching random game", {
      gameId: game.gameId,
      name: game.name,
    });
    try {
      await invoke("launch_game", { gameId: game.gameId });
      onClose();
    } catch (e) {
      logger.error("RandomGamePopover", "launch", "Failed to launch", {
        error: String(e),
      });
    }
  };

  if (!game) {
    return (
      <div className="random-game-popover">
        <div className="random-game-popover__empty">No games in library</div>
      </div>
    );
  }

  return (
    <div className="random-game-popover">
      <div className="random-game-popover__image">
        <GameImage
          gameId={game.gameId}
          sourceId={game.sourceId}
          source={game.source}
          name={game.name}
          type="header"
        />
      </div>
      <div className="random-game-popover__info">
        <span className="random-game-popover__name">{game.name}</span>
      </div>
      <div className="random-game-popover__actions">
        <button
          className="random-game-popover__btn random-game-popover__btn--reroll"
          onClick={handleReroll}
        >
          <AppIcon name="dice" size={16} /> Reroll
        </button>
        <button
          className="random-game-popover__btn random-game-popover__btn--launch"
          onClick={handleLaunch}
        >
          <AppIcon name="play" size={16} /> Launch
        </button>
      </div>
    </div>
  );
}
