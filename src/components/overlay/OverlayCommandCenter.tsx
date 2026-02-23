import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppSettings, OverlayPanelId } from "../../types/settings";
import type { Game } from "../../types/game";
import type { GameSession } from "../../types/session";
import type {
  SlotActionId,
  SlotAction,
  StoreMetadata,
  ResolvedIntent,
} from "../../types";
import { SLOT_ACTIONS, DEFAULT_COMMAND_CENTER_SLOTS } from "../../types";
import { formatPlaytime } from "../../utils/formatters";
import {
  buildActionRegistry,
  searchPalette,
  shouldShowAskAssistant,
  extractGameMentions,
  PALETTE_HINTS,
} from "../../utils/commandPalette";
import { aiApi, cloudAiApi } from "../../services/tauri";
import { AppIcon } from "../common/AppIcon";
import { CommandSlot } from "../layout/CommandSlot";
import { CommandPaletteResults, type AiState } from "../layout/CommandPaletteResults";
import { ThemePickerPopover } from "../layout/ThemePickerPopover";
import { QuickStatsPopover } from "../layout/QuickStatsPopover";
import { RandomGamePopover } from "../layout/RandomGamePopover";
import { OverlayTagFilter } from "./OverlayTagFilter";
import "../layout/CommandCenter.css";
import "./OverlayCommandCenter.css";

const NAV_PATHS: Record<string, string> = {
  "nav:library": "/library",
  "nav:activity": "/activity",
  "nav:profile": "/profile",
  "nav:notes": "/notes",
  "nav:settings": "/settings",
  "nav:debug": "/debug",
};

interface OverlayCommandCenterProps {
  settings: AppSettings;
  games: Game[];
  metadataCache: Map<string, StoreMetadata>;
  activeSessions: GameSession[];
  favoritesCount: number;
  onTogglePanel?: (id: OverlayPanelId) => void;
  onSaveSettings: (settings: AppSettings) => Promise<void>;
  onHideOverlay: () => void;
}

function formatElapsed(startTime: number): string {
  const diffSec = Math.floor(Date.now() / 1000) - startTime;
  if (diffSec < 60) return "just started";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function OverlayCommandCenter({
  settings,
  games,
  metadataCache,
  activeSessions,
  favoritesCount,
  onTogglePanel,
  onSaveSettings,
  onHideOverlay,
}: OverlayCommandCenterProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const slotRefs = useRef<Map<number, HTMLElement>>(new Map());

  const [isEditing, setIsEditing] = useState(false);
  const [activePopover, setActivePopover] = useState<SlotActionId | null>(null);
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [showHints, setShowHints] = useState(false);
  const [aiState, setAiState] = useState<AiState>({ mode: "idle" });
  const [patternResult, setPatternResult] = useState<ResolvedIntent | null>(null);
  const patternSeqRef = useRef(0);

  const slotIds = settings.commandCenterSlots ?? DEFAULT_COMMAND_CENTER_SLOTS;

  const resolvedSlots = useMemo(() => {
    return slotIds.map((id) => {
      const action = SLOT_ACTIONS.find((a) => a.id === id);
      return action ?? SLOT_ACTIONS[0];
    });
  }, [slotIds]);

  const paletteActions = useMemo(() => buildActionRegistry(settings), [settings]);

  const paletteResults = useMemo(
    () => searchPalette(searchQuery, paletteActions, games, metadataCache),
    [searchQuery, paletteActions, games, metadataCache],
  );

  // Count items that participate in keyboard navigation
  // Pattern matcher renders as a single clickable row (confidence >= 0.5)
  const isConfidentPattern =
    !!patternResult &&
    patternResult.actions.length > 0 &&
    patternResult.confidence >= 0.5;
  const patternActionCount = isConfidentPattern ? 1 : 0;
  // Regular actions are suppressed when pattern matcher covers the query
  const renderedActionCount = isConfidentPattern ? 0 : paletteResults.actions.length;

  const aiMentions = useMemo(
    () =>
      aiState.mode === "result" ? extractGameMentions(aiState.intent.summary, games) : [],
    [aiState, games],
  );

  const cloudAiItemCount = useMemo(() => {
    if (aiState.mode === "available") return 1; // "Ask Assistant" button
    if (aiState.mode === "result") {
      return aiState.intent.actions.length + aiMentions.length;
    }
    return 0;
  }, [aiState, aiMentions]);

  const resultCount =
    renderedActionCount +
    paletteResults.games.length +
    patternActionCount +
    cloudAiItemCount;
  const isSearching = searchQuery.trim().length > 0;

  // Quick stats
  const totalGames = games.length;
  const totalPlaytime = games.reduce((sum, g) => sum + g.playtimeForever, 0);
  const installedCount = games.filter((g) => g.isInstalled).length;

  // Game name lookup for now-playing banner
  const gameNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of games) map.set(g.gameId, g.name);
    return map;
  }, [games]);

  const paletteSelectRef = useRef<(index: number) => void>(() => {});

  const hideOverlay = onHideOverlay;

  // Navigate: show main window + navigate + hide overlay
  const navigateMain = useCallback(async (route: string) => {
    await invoke("show_main_and_navigate", { route });
  }, []);

  // Keyboard handling
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (activePopover || editingSlotIndex !== null) {
          setActivePopover(null);
          setEditingSlotIndex(null);
        } else if (searchQuery.length > 0) {
          setSearchQuery("");
          setHighlightIndex(0);
        } else {
          hideOverlay();
        }
        return;
      }

      if (searchQuery.trim().length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((prev) => (resultCount > 0 ? (prev + 1) % resultCount : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((prev) =>
          resultCount > 0 ? (prev - 1 + resultCount) % resultCount : 0,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        paletteSelectRef.current(highlightIndex);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    activePopover,
    editingSlotIndex,
    searchQuery,
    resultCount,
    highlightIndex,
    hideOverlay,
  ]);

  // Auto-focus search on window focus
  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        setSearchQuery("");
        setHighlightIndex(0);
        setIsEditing(false);
        setActivePopover(null);
        setEditingSlotIndex(null);
        setShowHints(false);
        setPatternResult(null);
        setAiState({ mode: "idle" });
        setTimeout(() => searchRef.current?.focus(), 50);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Reset highlight when results change; dismiss hints when user starts typing
  useEffect(() => {
    setHighlightIndex(0);
    if (searchQuery.trim()) setShowHints(false);
  }, [searchQuery]);

  // Auto-fire pattern matcher on search (local, instant)
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || query.split(/\s+/).length < 2) {
      setPatternResult(null);
      return;
    }
    const seq = ++patternSeqRef.current;
    const timer = setTimeout(async () => {
      try {
        const result = await aiApi.resolveIntent(query);
        if (patternSeqRef.current === seq) {
          setPatternResult(result);
        }
      } catch {
        if (patternSeqRef.current === seq) {
          setPatternResult(null);
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Show "Ask Assistant" button when conditions are met (no auto-fire)
  const cloudEnabled = settings.cloudAiEnabled === true;
  useEffect(() => {
    if (cloudEnabled && shouldShowAskAssistant(searchQuery, paletteResults)) {
      setAiState((prev) => (prev.mode === "idle" ? { mode: "available" } : prev));
    } else {
      // Don't reset if we're already loading or showing a cloud result
      setAiState((prev) =>
        prev.mode === "loading" || prev.mode === "result" ? prev : { mode: "idle" },
      );
    }
  }, [searchQuery, paletteResults, cloudEnabled]);

  const handleSlotClick = useCallback(
    (action: SlotAction, index: number) => {
      if (isEditing) {
        setEditingSlotIndex((prev) => (prev === index ? null : index));
        return;
      }

      if (action.category === "navigation") {
        const path = NAV_PATHS[action.id];
        if (path) {
          navigateMain(path);
        }
        return;
      }

      switch (action.id) {
        case "action:refresh-library":
          if (settings.steamApiKey && settings.steamId) {
            invoke("fetch_owned_games", {
              apiKey: settings.steamApiKey,
              steamId: settings.steamId,
            });
          }
          hideOverlay();
          break;
        case "action:search":
          searchRef.current?.focus();
          break;
        case "action:theme-picker":
        case "action:quick-stats":
        case "action:random-game":
        case "action:tag-filter":
          setActivePopover((prev) => (prev === action.id ? null : action.id));
          break;
        case "action:system-monitor":
          onTogglePanel?.("system-monitor");
          break;
        case "action:media-controls":
          onTogglePanel?.("media-controls");
          break;
        case "action:audio-mixer":
          onTogglePanel?.("audio-mixer");
          break;
      }
    },
    [isEditing, navigateMain, hideOverlay, settings, onTogglePanel],
  );

  const handleSlotReplace = useCallback(
    (newActionId: SlotActionId) => {
      if (editingSlotIndex === null) return;
      const newSlots = [...slotIds];
      newSlots[editingSlotIndex] = newActionId;
      onSaveSettings({ ...settings, commandCenterSlots: newSlots });
      setEditingSlotIndex(null);
    },
    [editingSlotIndex, settings, slotIds, onSaveSettings],
  );

  const handleAskAssistant = useCallback(async () => {
    setAiState({ mode: "loading" });
    try {
      const result = await cloudAiApi.cloudResolve(searchQuery.trim());
      if (result) {
        setAiState({ mode: "result", intent: result });
      } else {
        setAiState({ mode: "idle" });
      }
    } catch {
      setAiState({ mode: "idle" });
    }
  }, [searchQuery]);

  const handlePatternActionSelect = useCallback(
    (actions: Array<{ actionId: string; gameId?: string }>) => {
      for (const action of actions) {
        invoke("overlay_execute_palette_action", {
          actionId: action.actionId,
          gameId: action.gameId ?? null,
          showMain: actionNeedsMainWindow(action.actionId),
        }).catch(() => {});
      }
      hideOverlay();
    },
    [hideOverlay],
  );

  const handleAiActionSelect = useCallback(
    (actions: Array<{ actionId: string; gameId?: string }>) => {
      for (const action of actions) {
        invoke("overlay_execute_palette_action", {
          actionId: action.actionId,
          gameId: action.gameId ?? null,
          showMain: actionNeedsMainWindow(action.actionId),
        }).catch(() => {});
      }
      hideOverlay();
    },
    [hideOverlay],
  );

  const handlePaletteSelect = useCallback(
    (index: number) => {
      // flatIndex order: actions (if shown) → games → pattern matcher (1 row) → cloud AI
      // renderedActionCount is 0 when pattern matcher suppresses regular actions
      const actionCount = renderedActionCount;
      const gameCount = paletteResults.games.length;

      if (index < actionCount) {
        const action = paletteResults.actions[index];
        if (!action) return;
        invoke("overlay_execute_palette_action", {
          actionId: action.id,
          showMain: actionNeedsMainWindow(action.id),
        }).catch(() => {});
      } else if (index < actionCount + gameCount) {
        const game = paletteResults.games[index - actionCount];
        if (!game) return;
        invoke("launch_game", { gameId: game.gameId }).catch(() => {});
        hideOverlay();
      } else if (index < actionCount + gameCount + patternActionCount) {
        // Pattern matcher — apply ALL pattern matcher actions
        if (patternResult) {
          handlePatternActionSelect(
            patternResult.actions.map((a) => ({
              actionId: a.actionId,
              gameId: a.gameId,
            })),
          );
        }
      } else {
        // Cloud AI item — Enter on "Ask Assistant" button
        if (aiState.mode === "available") {
          handleAskAssistant();
        }
        // Cloud result actions/mentions are handled by onClick in CommandPaletteResults
      }
    },
    [
      paletteResults,
      renderedActionCount,
      hideOverlay,
      patternActionCount,
      patternResult,
      handlePatternActionSelect,
      aiState,
      handleAskAssistant,
    ],
  );

  paletteSelectRef.current = handlePaletteSelect;

  // Determine body content mode
  const showInlinePopover = !isEditing && activePopover !== null;
  const showSlotPicker = isEditing && editingSlotIndex !== null;

  return (
    <>
      {activeSessions.length > 0 && (
        <div className="overlay-now-playing">
          {activeSessions.map((s) => (
            <div key={s.id} className="overlay-now-playing__session">
              <span className="overlay-now-playing__dot" />
              <span className="overlay-now-playing__name">
                {gameNameMap.get(s.gameId) ?? "Unknown Game"}
              </span>
              <span className="overlay-now-playing__elapsed">
                {formatElapsed(s.startTime)}
              </span>
              <span className="overlay-now-playing__badge">LIVE</span>
            </div>
          ))}
        </div>
      )}

      <div className="command-center__header">
        <div className="command-center__search-row">
          <input
            ref={searchRef}
            className="command-center__search"
            type="text"
            placeholder="Search games, actions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <button
            className={`command-center__hints-btn ${showHints ? "command-center__hints-btn--active" : ""}`}
            onClick={() => setShowHints(!showHints)}
            onPointerDown={(e) => e.stopPropagation()}
            title="Available commands"
          >
            ?
          </button>
        </div>
        {showHints && (
          <div className="command-center__hints-dropdown">
            <div className="command-center__hints-title">Available Commands</div>
            {PALETTE_HINTS.map((hint) => (
              <button
                key={hint.label}
                className="command-center__hints-item"
                onClick={() => {
                  setSearchQuery(hint.autofill);
                  setShowHints(false);
                  searchRef.current?.focus();
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <AppIcon name={hint.icon} size={14} />
                <span className="command-center__hints-label">{hint.label}</span>
                <span className="command-center__hints-desc">{hint.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="command-center__body">
        {isSearching ? (
          <CommandPaletteResults
            results={paletteResults}
            highlightIndex={highlightIndex}
            onSelect={handlePaletteSelect}
            onHover={setHighlightIndex}
            aiState={aiState}
            onAskAssistant={handleAskAssistant}
            onAiActionSelect={handleAiActionSelect}
            patternResult={patternResult}
            onPatternActionSelect={handlePatternActionSelect}
            games={games}
          />
        ) : showInlinePopover ? (
          <div className="overlay-inline-popover">
            <button
              className="overlay-inline-popover__back"
              onClick={() => setActivePopover(null)}
            >
              <AppIcon name="chevron-left" size={14} /> Back
            </button>
            {activePopover === "action:theme-picker" && (
              <ThemePickerPopover
                settings={settings}
                onSaveSettings={(s) => onSaveSettings(s)}
              />
            )}
            {activePopover === "action:quick-stats" && (
              <QuickStatsPopover games={games} favoritesCount={favoritesCount} />
            )}
            {activePopover === "action:random-game" && (
              <RandomGamePopover
                games={games}
                onClose={() => {
                  setActivePopover(null);
                  hideOverlay();
                }}
              />
            )}
            {activePopover === "action:tag-filter" && (
              <OverlayTagFilter onClose={() => setActivePopover(null)} />
            )}
          </div>
        ) : showSlotPicker ? (
          <div className="overlay-inline-popover">
            <button
              className="overlay-inline-popover__back"
              onClick={() => setEditingSlotIndex(null)}
            >
              <AppIcon name="chevron-left" size={14} /> Back
            </button>
            <div className="command-center__slot-picker">
              <div className="command-center__slot-picker-title">Choose Action</div>
              {SLOT_ACTIONS.map((a) => {
                const currentAction = resolvedSlots[editingSlotIndex];
                const isUsed = slotIds.includes(a.id) && a.id !== currentAction.id;
                return (
                  <button
                    key={a.id}
                    className={`command-center__picker-item ${isUsed ? "command-center__picker-item--disabled" : ""}`}
                    disabled={isUsed}
                    onClick={() => handleSlotReplace(a.id)}
                  >
                    <span>
                      <AppIcon name={a.icon} size={16} />
                    </span>
                    <span>{a.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="command-center__customize-bar">
              <button
                className="command-center__customize-btn"
                onClick={() => {
                  setIsEditing((prev) => !prev);
                  setEditingSlotIndex(null);
                  setActivePopover(null);
                }}
              >
                {isEditing ? "Done" : "Customize"}
              </button>
            </div>

            <div className="command-center__slots">
              {resolvedSlots.map((action, index) => (
                <CommandSlot
                  key={index}
                  ref={(el) => {
                    if (el) slotRefs.current.set(index, el);
                    else slotRefs.current.delete(index);
                  }}
                  action={action}
                  onClick={() => handleSlotClick(action, index)}
                  isEditing={isEditing}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="command-center__footer">
        <span className="command-center__stat">
          <span className="command-center__stat-value">{totalGames}</span> games
        </span>
        <span className="command-center__stat">
          <span className="command-center__stat-value">
            {formatPlaytime(totalPlaytime)}
          </span>{" "}
          played
        </span>
        <span className="command-center__stat">
          <span className="command-center__stat-value">{installedCount}</span> installed
        </span>
      </div>
    </>
  );
}

/**
 * Determine if an action requires showing/focusing the main window.
 * Actions that only save settings or trigger background tasks don't need it.
 */
function actionNeedsMainWindow(actionId: string): boolean {
  // Theme/appearance — settings save only
  if (actionId.startsWith("theme:")) return false;
  if (actionId.startsWith("font:")) return false;
  if (actionId.startsWith("icons:")) return false;
  if (actionId.startsWith("scale:")) return false;
  // Toggle settings — no navigation
  if (actionId === "settings:tray") return false;
  if (actionId === "action:toggle-dev-mode") return false;
  if (actionId === "dev:onboarding") return false;
  // Background tasks — no navigation
  if (actionId === "action:refresh") return false;
  if (actionId === "action:refresh-metadata") return false;
  if (actionId === "action:scan-external") return false;
  // Favorite toggle — no navigation
  if (actionId.startsWith("game:favorite")) return false;
  // Everything else navigates or opens UI
  return true;
}
