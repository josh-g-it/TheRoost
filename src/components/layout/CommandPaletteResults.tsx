import { useRef, useEffect, useState } from "react";
import type { PaletteAction, PaletteResults, Game, ResolvedIntent } from "../../types";
import type { IconSetId } from "../../types/theme";
import { FONT_OPTIONS } from "../../types/theme";
import { formatPlaytime } from "../../utils/formatters";
import { getIcon } from "../../utils/icons";
import { coverArtApi } from "../../services/tauri";
import { AppIcon } from "../common/AppIcon";
import "./CommandPaletteResults.css";

interface CommandPaletteResultsProps {
  results: PaletteResults;
  highlightIndex: number;
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
  /** Pattern matcher result (auto-fires locally, instant) */
  patternResult?: ResolvedIntent | null;
  onPatternActionSelect?: (actions: Array<{ actionId: string; gameId?: string }>) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  navigation: "Navigation",
  action: "Actions",
  theme: "Themes",
  settings: "Settings",
};

export function CommandPaletteResults({
  results,
  highlightIndex,
  onSelect,
  onHover,
  patternResult,
  onPatternActionSelect,
}: CommandPaletteResultsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const hasActions = results.actions.length > 0;
  const hasGames = results.games.length > 0;
  // Only show pattern result when confidence is high enough (coverage >= 50% of tokens)
  const hasPatternResult =
    !!patternResult &&
    patternResult.actions.length > 0 &&
    patternResult.confidence >= 0.5;
  // Suppress regular actions when pattern matcher covers the query
  const showRegularActions = hasActions && !hasPatternResult;
  const isEmpty = !showRegularActions && !hasGames && !hasPatternResult;

  // Scroll the highlighted item into view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const active = container.querySelector(".command-palette__result--active");
    if (active) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  if (isEmpty) {
    return <div className="command-palette__empty">No results found</div>;
  }

  // flatIndex tracks keyboard-navigable items in render order:
  // 1. Regular actions  2. Games  3. Pattern matcher actions
  let flatIndex = 0;

  return (
    <div ref={containerRef} className="command-palette__results">
      {/* 1. Regular Actions (suppressed when pattern matcher covers the query) */}
      {showRegularActions && (
        <>
          <div className="command-palette__group-header">Actions</div>
          {results.actions.map((action) => {
            const idx = flatIndex++;
            return (
              <ActionRow
                key={action.id}
                action={action}
                isActive={idx === highlightIndex}
                onClick={() => onSelect(idx)}
                onMouseEnter={() => onHover(idx)}
              />
            );
          })}
        </>
      )}

      {/* 2. Games */}
      {hasGames && (
        <>
          <div className="command-palette__group-header">Games</div>
          {results.games.map((game) => {
            const idx = flatIndex++;
            return (
              <GameRow
                key={game.gameId}
                game={game}
                isActive={idx === highlightIndex}
                onClick={() => onSelect(idx)}
                onMouseEnter={() => onHover(idx)}
              />
            );
          })}
        </>
      )}

      {/* 3. Pattern Matcher Result — single clickable row to apply all filters */}
      {hasPatternResult &&
        (() => {
          const pr = patternResult!;
          const idx = flatIndex++;
          return (
            <>
              <div className="command-palette__group-header">AI Suggestion</div>
              <div
                className={`command-palette__result command-palette__ai-suggestion ${idx === highlightIndex ? "command-palette__result--active" : ""}`}
                onClick={() =>
                  onPatternActionSelect?.(
                    pr.actions.map((a) => ({
                      actionId: a.actionId,
                      gameId: a.gameId,
                    })),
                  )
                }
                onMouseEnter={() => onHover(idx)}
              >
                <span className="command-palette__result-icon command-palette__ai-icon">
                  <AppIcon name="sparkle" size={18} />
                </span>
                <div className="command-palette__result-info">
                  <span className="command-palette__result-label">{pr.summary}</span>
                </div>
                <span className="command-palette__result-hint">
                  <span className="command-palette__ai-tier-badge">Instant</span>
                </span>
              </div>
            </>
          );
        })()}
    </div>
  );
}

/** Resolve font family for font:* actions */
function getFontFamily(actionId: string): string | undefined {
  if (!actionId.startsWith("font:")) return undefined;
  const fontId = actionId.slice(5);
  return FONT_OPTIONS.find((f) => f.id === fontId)?.family;
}

/** Resolve icon set id for icons:* actions */
function getIconSetId(actionId: string): IconSetId | undefined {
  if (!actionId.startsWith("icons:")) return undefined;
  return actionId.slice(6) as IconSetId;
}

function ActionRow({
  action,
  isActive,
  onClick,
  onMouseEnter,
}: {
  action: PaletteAction;
  isActive: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const fontFamily = getFontFamily(action.id);
  const iconSetId = getIconSetId(action.id);

  // For icons:* actions, render the palette icon from that specific icon set
  let iconElement: React.ReactNode;
  if (iconSetId) {
    const Icon = getIcon("palette", iconSetId);
    iconElement = <Icon size={18} />;
  } else {
    iconElement = <AppIcon name={action.icon} size={18} />;
  }

  return (
    <div
      className={`command-palette__result ${isActive ? "command-palette__result--active" : ""}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <span className="command-palette__result-icon">{iconElement}</span>
      <div className="command-palette__result-info">
        <span
          className="command-palette__result-label"
          style={fontFamily ? { fontFamily } : undefined}
        >
          {action.label}
        </span>
      </div>
      <span className="command-palette__result-hint">
        {CATEGORY_LABELS[action.category] ?? action.category}
      </span>
    </div>
  );
}

/** Module-level cache for non-Steam icon URLs to avoid repeated lookups */
const iconCache = new Map<string, string>();

function GameIconImage({ game }: { game: Game }) {
  const isSteam = !game.source || game.source === "steam";
  const steamUrl =
    isSteam && game.imgIconUrl
      ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.sourceId}/${game.imgIconUrl}.jpg`
      : null;

  const [url, setUrl] = useState<string | null>(
    steamUrl ?? iconCache.get(game.gameId) ?? null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (url !== null || failed || isSteam) return;
    coverArtApi
      .getCoverArtUrl(game.gameId, "logo")
      .then((storedUrl) => {
        if (storedUrl) {
          iconCache.set(game.gameId, storedUrl);
          setUrl(storedUrl);
        } else {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
  }, [game.gameId, url, failed, isSteam]);

  if (!url) return <AppIcon name="library" size={18} />;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => {
        setUrl(null);
        setFailed(true);
      }}
    />
  );
}

function GameRow({
  game,
  isActive,
  onClick,
  onMouseEnter,
}: {
  game: Game;
  isActive: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <div
      className={`command-palette__result ${isActive ? "command-palette__result--active" : ""}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <span className="command-palette__result-icon">
        <GameIconImage game={game} />
      </span>
      <div className="command-palette__result-info">
        <span className="command-palette__result-label">{game.name}</span>
      </div>
      <span className="command-palette__result-hint">
        {formatPlaytime(game.playtimeForever)}
      </span>
    </div>
  );
}
