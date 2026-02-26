import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Header } from "../layout/Header";
import { StatCard } from "../common/StatCard";
import { ChartCard } from "../profile/ChartCard";
import { ChartToolbarSelect } from "../profile/ChartToolbar";
import { AppIcon } from "../common/AppIcon";
import { SessionHeatmap } from "../sessions/SessionHeatmap";
import { SessionTimeline } from "../sessions/SessionTimeline";
import { NowPlayingBanner } from "./NowPlayingBanner";
import { CardMenu } from "./CardMenu";
import { AddCardButton } from "./AddCardButton";
import { SessionDrillDown, type SessionDrillDownContext } from "./SessionDrillDown";
import { DailyPlaytimeChart } from "./charts/DailyPlaytimeChart";
import { MostPlayedChart } from "./charts/MostPlayedChart";
import { SessionLengthDistribution } from "./charts/SessionLengthDistribution";
import { PlaytimeByDayOfWeek } from "./charts/PlaytimeByDayOfWeek";
import { MemoriesCard } from "./cards/MemoriesCard";
import { ChartFilterMenu } from "./cards/ChartFilterMenu";
import { RecapTab } from "./recap/RecapTab";
import { useSessionStore } from "../../store/sessionSlice";
import { useLibraryStore } from "../../store/librarySlice";
import { useSettingsStore } from "../../store/settingsSlice";
import { useTagsStore } from "../../store/tagsSlice";
import { useMetadataStore } from "../../store/metadataSlice";
import {
  useActivityLayoutStore,
  getLayoutForPersistence,
} from "../../store/activityLayoutSlice";
import { useDrillDown } from "../../hooks/useDrillDown";
import type { ActivityCardConfig, ActivityCardType } from "../../types/activityLayout";
import { CARD_TYPE_META } from "../../types/activityLayout";
import type { GameSession } from "../../types/session";
import type { StoreMetadata } from "../../types/metadata";
import { formatDuration } from "../../utils/formatters";
import { calculatePlayStreak } from "../../utils/streaks";
import {
  computeActivityQuickStats,
  computeDailyPlaytime,
  computeMostPlayed,
  computeSessionLengthDistribution,
  computePlaytimeByDayOfWeek,
  filterSessionsByDate,
  filterSessionsByGame,
  filterSessionsByDurationRange,
  filterSessionsByDayOfWeek,
  filterSessionsByTags,
  filterSessionsBySource,
  filterSessionsByGenre,
  filterSessionsBySteamTag,
  filterSessionsByCategory,
  computeMemories,
} from "../../utils/activityStats";
import { logger } from "../../utils/logger";
import "./ActivityView.css";

// ── Constants ────────────────────────────────────────────────────

const DAILY_RANGE_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

const MOST_PLAYED_PERIOD_OPTIONS = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

// ── Helpers ──────────────────────────────────────────────────────

function formatTrend(current: number, previous: number): string | undefined {
  if (previous === 0 && current === 0) return undefined;
  if (previous === 0) return undefined;
  const diff = current - previous;
  if (diff === 0) return "Same as last period";
  const prefix = diff > 0 ? "+" : "";
  return `${prefix}${formatDuration(Math.abs(diff))} vs last`;
}

/** Extract all active filters from a card's options and apply them to sessions. */
function applyCardFilters(
  sessions: GameSession[],
  card: ActivityCardConfig,
  data: CardData,
): GameSession[] {
  const tagIds = (card.options?.filterByTagIds as number[]) ?? [];
  const sourceIds = (card.options?.filterBySource as string[]) ?? [];
  const genreIds = (card.options?.filterByGenreIds as string[]) ?? [];
  const steamTags = (card.options?.filterBySteamTagNames as string[]) ?? [];
  const categoryIds = (card.options?.filterByCategoryIds as number[]) ?? [];

  let result = filterSessionsByTags(sessions, tagIds, data.gameTagMap);
  result = filterSessionsBySource(result, sourceIds, data.gameSourceMap);
  result = filterSessionsByGenre(result, genreIds, data.metadataCache);
  result = filterSessionsBySteamTag(result, steamTags, data.metadataCache);
  result = filterSessionsByCategory(result, categoryIds, data.metadataCache);
  return result;
}

/** Build the ChartFilterMenu props from a card's options. */
function getFilterProps(card: ActivityCardConfig, data: CardData) {
  return {
    filterByTagIds: (card.options?.filterByTagIds as number[]) ?? [],
    filterBySource: (card.options?.filterBySource as string[]) ?? [],
    filterByGenreIds: (card.options?.filterByGenreIds as string[]) ?? [],
    filterBySteamTagNames: (card.options?.filterBySteamTagNames as string[]) ?? [],
    filterByCategoryIds: (card.options?.filterByCategoryIds as number[]) ?? [],
    playedGameIds: data.playedGameIds,
  };
}

/** All computed data the card renderers need */
interface CardData {
  recentSessions: GameSession[];
  activeSessions: GameSession[];
  gameNames: Map<string, string>;
  gameTagMap: Map<string, number[]>;
  gameSourceMap: Map<string, string>;
  metadataCache: Map<string, StoreMetadata>;
  playedGameIds: Set<string>;
  streak: { current: number; longest: number };
  quickStats: ReturnType<typeof computeActivityQuickStats>;
  weekTrend: string | undefined;
  monthTrend: string | undefined;
}

// ── Drop Slot Computation ────────────────────────────────────────

interface DropSlotInfo {
  top: number;
  left: number;
  width: number;
  height: number;
  targetIndex: number; // insertion index in remaining array
}

/**
 * Compute visual drop-slot positions from the current grid layout.
 * Uses offsetTop/Left for scroll-independent coordinates.
 * Grid container must have `position: relative` for offsetParent to match.
 */
function computeDropSlots(
  gridEl: HTMLElement,
  cards: ActivityCardConfig[],
  draggedId: string,
): DropSlotInfo[] {
  const draggedCard = cards.find((c) => c.id === draggedId);
  if (!draggedCard) return [];

  const gap = parseFloat(getComputedStyle(gridEl).gap) || 16;
  const gridWidth = gridEl.offsetWidth;
  const halfWidth = (gridWidth - gap) / 2;
  const remaining = cards.filter((c) => c.id !== draggedId);

  // Get all card positions using offsetTop/Left (scroll-independent)
  const cardEls = gridEl.querySelectorAll<HTMLElement>("[data-card-id]");
  const positions: { id: string; top: number; left: number; height: number }[] = [];
  cardEls.forEach((el) => {
    const id = el.getAttribute("data-card-id");
    if (id) {
      positions.push({
        id,
        top: el.offsetTop,
        left: el.offsetLeft,
        height: el.offsetHeight,
      });
    }
  });

  // Group into visual rows by Y coordinate
  positions.sort((a, b) => a.top - b.top || a.left - b.left);
  const rows: (typeof positions)[] = [];
  for (const pos of positions) {
    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(lastRow[0].top - pos.top) < 10) {
      lastRow.push(pos);
    } else {
      rows.push([pos]);
    }
  }

  // Find the dragged card's original row top to determine move direction
  const draggedPos = positions.find((p) => p.id === draggedId);
  const draggedRowTop = draggedPos ? draggedPos.top : 0;

  const slots: DropSlotInfo[] = [];

  for (const rowCards of rows) {
    const rowTop = rowCards[0].top;
    const rowHeight = rowCards[0].height;

    // Find remaining (non-dragged) cards in this row
    const remainingInRow = rowCards
      .filter((c) => c.id !== draggedId)
      .map((c) => ({ ...c, remIdx: remaining.findIndex((r) => r.id === c.id) }))
      .filter((c) => c.remIdx !== -1)
      .sort((a, b) => a.left - b.left);

    // Base target = first remaining card in or after this row
    let base: number;
    if (remainingInRow.length > 0) {
      base = remainingInRow[0].remIdx;
    } else {
      const below = positions
        .filter((p) => p.top > rowTop + 10 && p.id !== draggedId)
        .sort((a, b) => a.top - b.top);
      const idx =
        below.length > 0 ? remaining.findIndex((r) => r.id === below[0].id) : -1;
      base = idx >= 0 ? idx : remaining.length;
    }

    // Moving UP → "insert before" (card lands before row cards)
    // Moving DOWN or same row → "insert after" (row cards stay above)
    const movingDown = rowTop >= draggedRowTop + 10;

    if (draggedCard.width === "half") {
      const leftTarget =
        remainingInRow.length > 0
          ? movingDown
            ? remainingInRow[0].remIdx + 1
            : base
          : base;
      slots.push({
        top: rowTop,
        left: 0,
        width: halfWidth,
        height: rowHeight,
        targetIndex: leftTarget,
      });
      const rightTarget =
        remainingInRow.length > 1
          ? movingDown
            ? remainingInRow[remainingInRow.length - 1].remIdx + 1
            : remainingInRow[1].remIdx
          : movingDown
            ? leftTarget
            : Math.min(base + 1, remaining.length);
      slots.push({
        top: rowTop,
        left: halfWidth + gap,
        width: halfWidth,
        height: rowHeight,
        targetIndex: rightTarget,
      });
    } else {
      const lastInRow = remainingInRow[remainingInRow.length - 1];
      const fullTarget = movingDown ? (lastInRow ? lastInRow.remIdx + 1 : base) : base;
      slots.push({
        top: rowTop,
        left: 0,
        width: gridWidth,
        height: rowHeight,
        targetIndex: fullTarget,
      });
    }
  }

  // Append slot at the bottom
  if (rows.length > 0) {
    const lastRow = rows[rows.length - 1];
    const appendTop = lastRow[0].top + lastRow[0].height + gap;
    const appendHeight = lastRow[0].height;
    if (draggedCard.width === "half") {
      slots.push({
        top: appendTop,
        left: 0,
        width: halfWidth,
        height: appendHeight,
        targetIndex: remaining.length,
      });
    } else {
      slots.push({
        top: appendTop,
        left: 0,
        width: gridWidth,
        height: appendHeight,
        targetIndex: remaining.length,
      });
    }
  }

  return slots;
}

// ── Card Renderers ───────────────────────────────────────────────

type CardRenderer = (
  card: ActivityCardConfig,
  data: CardData,
  updateOptions: (id: string, options: Record<string, unknown>) => void,
  openDrillDown: (ctx: SessionDrillDownContext) => void,
) => ReactNode;

const CARD_REGISTRY: Record<ActivityCardType, CardRenderer> = {
  "quick-stats": (_card, data) => (
    <div className="activity-view__stats">
      <StatCard
        icon={<AppIcon name="activity" size={16} />}
        label="Current Streak"
        value={`${data.streak.current} day${data.streak.current !== 1 ? "s" : ""}`}
      />
      <StatCard
        icon={<AppIcon name="stats" size={16} />}
        label="Longest Streak"
        value={`${data.streak.longest} day${data.streak.longest !== 1 ? "s" : ""}`}
      />
      <StatCard
        icon={<AppIcon name="play" size={16} />}
        label="This Week"
        value={formatDuration(data.quickStats.weeklyMinutes)}
        secondary={data.weekTrend}
      />
      <StatCard
        icon={<AppIcon name="play" size={16} />}
        label="This Month"
        value={formatDuration(data.quickStats.monthlyMinutes)}
        secondary={data.monthTrend}
      />
    </div>
  ),

  heatmap: (_card, data, _updateOptions, openDrillDown) => (
    <ChartCard
      title="Play Activity"
      subtitle="365-day overview"
      isEmpty={data.recentSessions.length === 0}
      emptyMessage="No sessions recorded yet — start playing to see your activity!"
    >
      <SessionHeatmap
        sessions={data.recentSessions}
        onCellClick={(dateKey) => {
          const filtered = filterSessionsByDate(data.recentSessions, dateKey);
          const [, m, d] = dateKey.split("-");
          const MONTHS = [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ];
          openDrillDown({
            title: `${MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`,
            subtitle: `${filtered.length} session${filtered.length !== 1 ? "s" : ""}`,
            sessions: filtered,
          });
        }}
      />
    </ChartCard>
  ),

  "daily-playtime": (card, data, updateOptions, openDrillDown) => {
    const range = (card.options?.range as number) ?? 30;
    const sessions = applyCardFilters(data.recentSessions, card, data);
    const dailyData = computeDailyPlaytime(sessions, range);
    return (
      <ChartCard
        title="Daily Playtime"
        subtitle="Your play time each day"
        isEmpty={dailyData.every((d) => d.minutes === 0)}
        emptyMessage="No session data available"
        actions={
          <>
            <ChartFilterMenu
              {...getFilterProps(card, data)}
              onChange={(opts) => updateOptions(card.id, opts)}
            />
            <ChartToolbarSelect
              label="Range"
              value={range}
              options={DAILY_RANGE_OPTIONS}
              onChange={(v) => updateOptions(card.id, { range: Number(v) })}
            />
          </>
        }
      >
        <DailyPlaytimeChart
          data={dailyData}
          onPointClick={(point) => {
            const filtered = filterSessionsByDate(sessions, point.dateKey);
            openDrillDown({
              title: point.date,
              subtitle: `${filtered.length} session${filtered.length !== 1 ? "s" : ""}`,
              sessions: filtered,
            });
          }}
        />
      </ChartCard>
    );
  },

  "most-played": (card, data, updateOptions, openDrillDown) => {
    const period = (card.options?.period as string) ?? "week";
    const sessions = applyCardFilters(data.recentSessions, card, data);
    const now = Math.floor(Date.now() / 1000);
    let since = 0;
    if (period === "week") since = now - 7 * 86400;
    else if (period === "month") since = now - 30 * 86400;
    const mostPlayedData = computeMostPlayed(sessions, data.gameNames, since, 5);
    return (
      <ChartCard
        title="Most Played"
        subtitle="Top games by session time"
        isEmpty={mostPlayedData.length === 0}
        emptyMessage="No session data for this period"
        actions={
          <>
            <ChartFilterMenu
              {...getFilterProps(card, data)}
              onChange={(opts) => updateOptions(card.id, opts)}
            />
            <ChartToolbarSelect
              label="Period"
              value={period}
              options={MOST_PLAYED_PERIOD_OPTIONS}
              onChange={(v) => updateOptions(card.id, { period: String(v) })}
            />
          </>
        }
      >
        <MostPlayedChart
          data={mostPlayedData}
          onBarClick={(entry) => {
            const filtered = filterSessionsByGame(sessions, entry.gameId);
            openDrillDown({
              title: entry.name,
              subtitle: `${filtered.length} session${filtered.length !== 1 ? "s" : ""}`,
              sessions: filtered,
            });
          }}
        />
      </ChartCard>
    );
  },

  "session-length": (card, data, updateOptions, openDrillDown) => {
    const sessions = applyCardFilters(data.recentSessions, card, data);
    const sessionLengthData = computeSessionLengthDistribution(sessions);
    return (
      <ChartCard
        title="Session Length"
        subtitle="How long are your gaming sessions?"
        isEmpty={sessionLengthData.every((b) => b.count === 0)}
        emptyMessage="No session data available"
        actions={
          <ChartFilterMenu
            {...getFilterProps(card, data)}
            onChange={(opts) => updateOptions(card.id, opts)}
          />
        }
      >
        <SessionLengthDistribution
          data={sessionLengthData}
          onBarClick={(bucket) => {
            const filtered = filterSessionsByDurationRange(
              sessions,
              bucket.min,
              bucket.max,
            );
            openDrillDown({
              title: `Sessions: ${bucket.label}`,
              subtitle: `${filtered.length} session${filtered.length !== 1 ? "s" : ""}`,
              sessions: filtered,
            });
          }}
        />
      </ChartCard>
    );
  },

  "playtime-by-day": (card, data, updateOptions, openDrillDown) => {
    const sessions = applyCardFilters(data.recentSessions, card, data);
    const dayOfWeekData = computePlaytimeByDayOfWeek(sessions);
    return (
      <ChartCard
        title="Playtime by Day"
        subtitle="When do you play the most?"
        isEmpty={dayOfWeekData.every((d) => d.totalHours === 0)}
        emptyMessage="No session data available"
        actions={
          <ChartFilterMenu
            {...getFilterProps(card, data)}
            onChange={(opts) => updateOptions(card.id, opts)}
          />
        }
      >
        <PlaytimeByDayOfWeek
          data={dayOfWeekData}
          onBarClick={(entry) => {
            const filtered = filterSessionsByDayOfWeek(sessions, entry.dayIndex);
            openDrillDown({
              title: `${entry.day} Sessions`,
              subtitle: `${filtered.length} session${filtered.length !== 1 ? "s" : ""}`,
              sessions: filtered,
            });
          }}
        />
      </ChartCard>
    );
  },

  "recent-sessions": (_card, data) => (
    <ChartCard
      title="Recent Sessions"
      subtitle="Your latest play sessions"
      isEmpty={data.recentSessions.length === 0}
      emptyMessage="No sessions recorded yet"
    >
      <SessionTimeline
        sessions={data.recentSessions}
        showGameName
        gameNames={data.gameNames}
        initialLimit={20}
      />
    </ChartCard>
  ),

  memories: (_card, data) => {
    const memories = computeMemories(data.recentSessions, data.gameNames);
    return (
      <ChartCard
        title="Memories"
        subtitle="On this day..."
        isEmpty={memories.length === 0}
        emptyMessage="No gaming memories for this period yet"
      >
        <MemoriesCard memories={memories} />
      </ChartCard>
    );
  },
};

// ── Sortable Card Wrapper ────────────────────────────────────────

function SortableCard({
  card,
  index,
  totalCards,
  isEditMode,
  isScrollable,
  children,
  onReorder,
  onRemove,
  onToggleWidth,
  onReset,
}: {
  card: ActivityCardConfig;
  index: number;
  totalCards: number;
  isEditMode: boolean;
  isScrollable: boolean;
  children: ReactNode;
  onReorder: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onToggleWidth: (id: string, width: "full" | "half") => void;
  onReset: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: !isEditMode });

  // Only apply transform to the dragged item — non-dragged items stay in their
  // grid positions and reflow naturally when the drop completes. This prevents
  // stretching artifacts when items have different column spans (full vs half).
  const style = {
    transform: isDragging ? CSS.Transform.toString(transform) : undefined,
    transition: isDragging ? transition : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      data-card-id={card.id}
      style={style}
      className={
        `activity-card activity-card--${card.width}` +
        (isScrollable ? " activity-card--scrollable" : "") +
        (isEditMode ? " activity-card--editing" : "") +
        (isDragging ? " activity-card--drag-origin" : "")
      }
    >
      {isEditMode && (
        <>
          {/* Invisible overlay covering entire card — acts as drag surface */}
          <div className="activity-card__drag-overlay" {...attributes} {...listeners} />
          <div className="activity-card__edit-bar">
            <div className="activity-card__edit-left">
              <button
                className="activity-card__move-btn"
                disabled={index === 0}
                onClick={() => onReorder(index, index - 1)}
                title="Move up"
              >
                <AppIcon name="sort-asc" size={12} />
              </button>
              <button
                className="activity-card__move-btn"
                disabled={index === totalCards - 1}
                onClick={() => onReorder(index, index + 1)}
                title="Move down"
              >
                <AppIcon name="sort-desc" size={12} />
              </button>
            </div>
            <CardMenu
              card={card}
              onRemove={onRemove}
              onToggleWidth={onToggleWidth}
              onReset={onReset}
            />
          </div>
        </>
      )}
      {children}
    </div>
  );
}

// ── Drag Overlay Content ─────────────────────────────────────────

function DragOverlayCard({ card }: { card?: ActivityCardConfig }) {
  if (!card) return null;
  const meta = CARD_TYPE_META[card.type];
  return (
    <div className={`activity-card activity-card--${card.width} activity-card--overlay`}>
      <div className="activity-card__overlay-content">
        <AppIcon name={meta.icon} size={20} />
        <span>{meta.label}</span>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export function ActivityView() {
  const [activeTab, setActiveTab] = useState<"activity" | "recaps">("activity");

  const recentSessions = useSessionStore((s) => s.recentSessions);
  const activeSessions = useSessionStore((s) => s.activeSessions);
  const loadRecentSessions = useSessionStore((s) => s.loadRecentSessions);
  const loadActiveSessions = useSessionStore((s) => s.loadActiveSessions);
  const library = useLibraryStore((s) => s.library);
  const gameTagMap = useTagsStore((s) => s.gameTagMap);
  const metadataCache = useMetadataStore((s) => s.cache);

  const saveSettings = useSettingsStore((s) => s.saveSettings);

  const cards = useActivityLayoutStore((s) => s.cards);
  const isEditMode = useActivityLayoutStore((s) => s.isEditMode);
  const setEditMode = useActivityLayoutStore((s) => s.setEditMode);
  const updateCardOptions = useActivityLayoutStore((s) => s.updateCardOptions);
  const removeCard = useActivityLayoutStore((s) => s.removeCard);
  const setCardWidth = useActivityLayoutStore((s) => s.setCardWidth);
  const addCard = useActivityLayoutStore((s) => s.addCard);
  const reorderCards = useActivityLayoutStore((s) => s.reorderCards);
  const resetCardOptions = useActivityLayoutStore((s) => s.resetCardOptions);

  // Drill-down overlay state
  const drillDown = useDrillDown<SessionDrillDownContext>();

  // Auto-persist layout changes to settings.json
  const isInitialized = useRef(false);
  useEffect(() => {
    // Skip the initial render (settings load triggers initLayout → sets cards)
    if (!isInitialized.current) {
      if (cards.length > 0) isInitialized.current = true;
      return;
    }
    // Read settings fresh from store inside callback to avoid having `settings`
    // in the dependency array (which would cause an infinite loop:
    // cards change → persist → settings change → initLayout → cards change → ...)
    const timer = setTimeout(() => {
      const currentSettings = useSettingsStore.getState().settings;
      if (!currentSettings) return;
      const currentLayout = getLayoutForPersistence();
      saveSettings({ ...currentSettings, activityLayout: currentLayout });
      logger.debug("ActivityView", "activity", "Layout persisted", {
        count: currentLayout.length,
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [cards, saveSettings]);

  // dnd-kit sensors — pointer-based (works in WebView2, unlike HTML5 DnD)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  // DragOverlay + drop slots
  const gridRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropSlots, setDropSlots] = useState<DropSlotInfo[]>([]);
  const [activeSlotIdx, setActiveSlotIdx] = useState<number | null>(null);
  // Refs mirror state for use in handleDragEnd (avoids stale closures)
  const dropSlotsRef = useRef<DropSlotInfo[]>([]);
  const activeSlotRef = useRef<number | null>(null);

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string;
    setActiveId(id);
    // Compute drop slots from current grid layout (after next frame so ghost renders)
    requestAnimationFrame(() => {
      if (gridRef.current) {
        const slots = computeDropSlots(gridRef.current, cards, id);
        dropSlotsRef.current = slots;
        setDropSlots(slots);
      }
    });
  }

  function handleDragMove(event: DragMoveEvent) {
    if (!gridRef.current || dropSlotsRef.current.length === 0) return;
    const gridRect = gridRef.current.getBoundingClientRect();
    const act = event.activatorEvent as PointerEvent;
    const cx = act.clientX + event.delta.x - gridRect.left;
    const cy = act.clientY + event.delta.y - gridRect.top;

    let nearest = -1;
    let minDist = Infinity;
    for (let i = 0; i < dropSlotsRef.current.length; i++) {
      const s = dropSlotsRef.current[i];
      const dist = Math.hypot(cx - (s.left + s.width / 2), cy - (s.top + s.height / 2));
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    }

    const idx = nearest >= 0 ? nearest : null;
    if (idx !== activeSlotRef.current) {
      activeSlotRef.current = idx;
      setActiveSlotIdx(idx);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const slotIdx = activeSlotRef.current;
    const slots = dropSlotsRef.current;
    const draggedId = event.active.id as string;

    // Clear all drag state
    setActiveId(null);
    setDropSlots([]);
    setActiveSlotIdx(null);
    dropSlotsRef.current = [];
    activeSlotRef.current = null;

    // Use slot-based targeting
    if (slotIdx !== null && slotIdx >= 0 && slotIdx < slots.length) {
      const fromIndex = cards.findIndex((c) => c.id === draggedId);
      if (fromIndex !== -1) {
        reorderCards(fromIndex, slots[slotIdx].targetIndex);
      }
    }
  }

  function handleDragCancel() {
    setActiveId(null);
    setDropSlots([]);
    setActiveSlotIdx(null);
    dropSlotsRef.current = [];
    activeSlotRef.current = null;
  }

  useEffect(() => {
    logger.info("ActivityView", "activity", "Loading activity data");
    loadRecentSessions(500);
    loadActiveSessions();
  }, [loadRecentSessions, loadActiveSessions]);

  // Listen for live session updates
  useEffect(() => {
    const promise = listen("session-update", () => {
      logger.debug("ActivityView", "activity", "Session update received");
      loadActiveSessions();
      loadRecentSessions(500);
    });
    return () => {
      promise.then((fn) => fn());
    };
  }, [loadActiveSessions, loadRecentSessions]);

  const gameNames = useMemo(() => {
    const map = new Map<string, string>();
    library?.games.forEach((g) => map.set(g.gameId, g.name));
    return map;
  }, [library?.games]);

  const gameSourceMap = useMemo(() => {
    const map = new Map<string, string>();
    library?.games.forEach((g) => map.set(g.gameId, g.source));
    return map;
  }, [library?.games]);

  // Set of game IDs that appear in recent sessions — used to scope filter options
  const playedGameIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of recentSessions) ids.add(s.gameId);
    return ids;
  }, [recentSessions]);

  const streak = useMemo(() => calculatePlayStreak(recentSessions), [recentSessions]);
  const quickStats = useMemo(
    () => computeActivityQuickStats(recentSessions),
    [recentSessions],
  );

  const weekTrend = formatTrend(quickStats.weeklyMinutes, quickStats.previousWeekMinutes);
  const monthTrend = formatTrend(
    quickStats.monthlyMinutes,
    quickStats.previousMonthMinutes,
  );

  const cardData: CardData = useMemo(
    () => ({
      recentSessions,
      activeSessions,
      gameNames,
      gameTagMap,
      gameSourceMap,
      metadataCache,
      playedGameIds,
      streak,
      quickStats,
      weekTrend,
      monthTrend,
    }),
    [
      recentSessions,
      activeSessions,
      gameNames,
      gameTagMap,
      gameSourceMap,
      metadataCache,
      playedGameIds,
      streak,
      quickStats,
      weekTrend,
      monthTrend,
    ],
  );

  const existingTypes = useMemo(() => cards.map((c) => c.type), [cards]);

  const sortableIds = useMemo(() => cards.map((c) => c.id), [cards]);

  return (
    <div className="activity-view">
      <Header
        title="Activity"
        subtitle="Your gaming activity"
        actions={
          <div className="activity-view__header-actions">
            <div className="activity-view__tabs">
              <button
                className={`activity-view__tab${activeTab === "activity" ? " activity-view__tab--active" : ""}`}
                onClick={() => setActiveTab("activity")}
              >
                Activity
              </button>
              <button
                className={`activity-view__tab${activeTab === "recaps" ? " activity-view__tab--active" : ""}`}
                onClick={() => setActiveTab("recaps")}
              >
                Recaps
              </button>
            </div>

            {activeTab === "activity" && (
              <button
                className={`activity-view__edit-btn${isEditMode ? " activity-view__edit-btn--active" : ""}`}
                onClick={() => setEditMode(!isEditMode)}
              >
                <AppIcon name="edit" size={14} />
                <span>{isEditMode ? "Done Editing" : "Edit Layout"}</span>
              </button>
            )}
          </div>
        }
      />

      {activeTab === "activity" ? (
        <>
          <div className="activity-view__content">
            <NowPlayingBanner activeSessions={activeSessions} gameNames={gameNames} />

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
                <div className="activity-view__cards" ref={gridRef}>
                  {cards.map((card, index) => {
                    const render = CARD_REGISTRY[card.type];
                    if (!render) return null;
                    const isScrollable =
                      card.type === "recent-sessions" || card.type === "memories";

                    return (
                      <SortableCard
                        key={card.id}
                        card={card}
                        index={index}
                        totalCards={cards.length}
                        isEditMode={isEditMode}
                        isScrollable={isScrollable}
                        onReorder={reorderCards}
                        onRemove={removeCard}
                        onToggleWidth={setCardWidth}
                        onReset={resetCardOptions}
                      >
                        {render(card, cardData, updateCardOptions, drillDown.open)}
                      </SortableCard>
                    );
                  })}

                  {isEditMode && (
                    <AddCardButton existingTypes={existingTypes} onAdd={addCard} />
                  )}

                  {/* Drop slot indicators during drag */}
                  {dropSlots.length > 0 && (
                    <div className="drop-slot-overlay">
                      {dropSlots.map((slot, i) => (
                        <div
                          key={i}
                          className={`drop-slot${i === activeSlotIdx ? " drop-slot--active" : ""}`}
                          style={{
                            top: slot.top,
                            left: slot.left,
                            width: slot.width,
                            height: slot.height,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </SortableContext>

              {/* Floating overlay follows cursor during drag — avoids grid stretching */}
              <DragOverlay dropAnimation={null}>
                {activeId ? (
                  <DragOverlayCard card={cards.find((c) => c.id === activeId)} />
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>

          {drillDown.isOpen && drillDown.context && (
            <SessionDrillDown
              context={drillDown.context}
              gameNames={gameNames}
              onClose={drillDown.close}
            />
          )}
        </>
      ) : (
        <div className="activity-view__content">
          <RecapTab />
        </div>
      )}
    </div>
  );
}
