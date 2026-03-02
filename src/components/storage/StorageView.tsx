import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { YAxisTickContentProps } from "recharts";
import { listen } from "@tauri-apps/api/event";
import { storageApi, steamInstallApi } from "../../services/tauri";
import { useLibraryStore } from "../../store/librarySlice";
import type { StorageScanResult, DriveInfo, GameStorageEntry } from "../../types/storage";
import { formatBytes, getSourceDisplayName } from "../../utils/formatters";
import type { GameSource } from "../../types/game";
import { useChartColors } from "../profile/charts/useChartColors";
import { Header } from "../layout/Header";
import { StatCard } from "../common/StatCard";
import { ChartCard } from "../profile/ChartCard";
import { LoadingSpinner } from "../common/LoadingSpinner";
import {
  UNINSTALL_RESCAN_FIRST_MS,
  UNINSTALL_RESCAN_SECOND_MS,
} from "../../constants/timings";
import { AppIcon } from "../common/AppIcon";
import "./StorageView.css";

const SOURCE_COLORS: Record<string, string> = {
  steam: "var(--color-accent-primary)",
  epic: "var(--color-accent-secondary)",
  gog: "var(--color-accent-success)",
  ea_app: "var(--color-accent-warning)",
  ubisoft: "var(--color-accent-error)",
  battlenet: "#8884d8",
  manual: "#82ca9d",
};
const SOURCE_COLOR_FALLBACK = "#999";

function getSourceColor(source: string): string {
  return SOURCE_COLORS[source.toLowerCase()] ?? SOURCE_COLOR_FALLBACK;
}

const DEFAULT_VISIBLE = 20;

interface ScanProgress {
  scanned: number;
  total: number;
  currentGame: string;
}

interface ActiveFilters {
  drive: string | null;
  source: string | null;
}

// ── Filter Chips ─────────────────────────────────────────

function FilterChips({
  filters,
  onClearDrive,
  onClearSource,
}: {
  filters: ActiveFilters;
  onClearDrive: () => void;
  onClearSource: () => void;
}) {
  if (!filters.drive && !filters.source) return null;

  return (
    <div className="storage-filter-chips">
      {filters.drive && (
        <button
          className="storage-filter-chip"
          onClick={onClearDrive}
          title="Clear drive filter"
        >
          <span className="storage-filter-chip__label">Drive: {filters.drive}</span>
          <AppIcon name="close" size={10} />
        </button>
      )}
      {filters.source && (
        <button
          className="storage-filter-chip"
          onClick={onClearSource}
          title="Clear launcher filter"
        >
          <span className="storage-filter-chip__label">
            {getSourceDisplayName(filters.source as GameSource)}
          </span>
          <AppIcon name="close" size={10} />
        </button>
      )}
    </div>
  );
}

// ── Drive Overview ──────────────────────────────────────────

function DriveOverview({
  drives,
  selectedDrive,
  onDriveClick,
}: {
  drives: DriveInfo[];
  selectedDrive: string | null;
  onDriveClick: (drive: string) => void;
}) {
  return (
    <div className="drive-bars">
      {drives.map((d) => {
        const usedBytes = d.totalBytes - d.freeBytes;
        const otherBytes = Math.max(0, usedBytes - d.gameBytes);
        const gamePct = d.totalBytes > 0 ? (d.gameBytes / d.totalBytes) * 100 : 0;
        const otherPct = d.totalBytes > 0 ? (otherBytes / d.totalBytes) * 100 : 0;
        const isSelected = selectedDrive === d.driveLetter;

        return (
          <div
            key={d.driveLetter}
            className={`drive-bar ${isSelected ? "drive-bar--selected" : ""}`}
            onClick={() => onDriveClick(d.driveLetter)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onDriveClick(d.driveLetter);
            }}
            title={`Click to ${isSelected ? "clear" : "filter by"} ${d.driveLetter}`}
          >
            <div className="drive-bar__header">
              <span className="drive-bar__label">
                {d.driveLetter} — {formatBytes(d.totalBytes)}
              </span>
              <span className="drive-bar__detail">
                {d.gameCount} game{d.gameCount !== 1 ? "s" : ""} ·{" "}
                {formatBytes(d.freeBytes)} free
              </span>
            </div>
            <div className="drive-bar__track">
              <div
                className="drive-bar__segment--games"
                style={{ width: `${gamePct}%` }}
              />
              <div
                className="drive-bar__segment--other"
                style={{ width: `${otherPct}%` }}
              />
            </div>
            <div className="drive-bar__legend">
              <span className="drive-bar__legend-item">
                <span className="drive-bar__legend-dot drive-bar__legend-dot--games" />
                Games {formatBytes(d.gameBytes)}
              </span>
              <span className="drive-bar__legend-item">
                <span className="drive-bar__legend-dot drive-bar__legend-dot--other" />
                Other {formatBytes(otherBytes)}
              </span>
              <span className="drive-bar__legend-item">
                <span className="drive-bar__legend-dot drive-bar__legend-dot--free" />
                Free {formatBytes(d.freeBytes)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Storage by Launcher (Donut) ─────────────────────────────

function StorageBySource({
  games,
  selectedSource,
  onSourceClick,
}: {
  games: GameStorageEntry[];
  selectedSource: string | null;
  onSourceClick: (source: string) => void;
}) {
  const colors = useChartColors();

  // Aggregate by source
  const data = useMemo(() => {
    const bySource = new Map<string, number>();
    for (const g of games) {
      bySource.set(g.source, (bySource.get(g.source) ?? 0) + g.sizeBytes);
    }
    return Array.from(bySource.entries())
      .map(([source, bytes]) => ({
        source,
        label: getSourceDisplayName(source as GameSource),
        bytes,
      }))
      .sort((a, b) => b.bytes - a.bytes);
  }, [games]);

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="bytes"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={100}
          paddingAngle={2}
          cursor="pointer"
          onClick={(entry) => {
            if (entry?.source) onSourceClick(entry.source);
          }}
        >
          {data.map((d) => (
            <Cell
              key={d.source}
              fill={getSourceColor(d.source)}
              opacity={selectedSource && selectedSource !== d.source ? 0.35 : 1}
              stroke={selectedSource === d.source ? "var(--color-text-primary)" : "none"}
              strokeWidth={selectedSource === d.source ? 2 : 0}
            />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as {
              source: string;
              label: string;
              bytes: number;
            };
            return (
              <div className="activity-chart-tooltip">
                <div className="activity-chart-tooltip__label">{d.label}</div>
                <div className="activity-chart-tooltip__value">
                  {formatBytes(d.bytes)}
                </div>
              </div>
            );
          }}
        />
        <Legend
          formatter={(value: string) => (
            <span style={{ color: colors.textSecondary, fontSize: 12 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Games by Size (Bar Chart) ───────────────────────────────

function GamesBySize({
  games,
  showAll,
  onToggle,
  onBarClick,
}: {
  games: GameStorageEntry[];
  showAll: boolean;
  onToggle: () => void;
  onBarClick: (game: GameStorageEntry, event: React.MouseEvent) => void;
}) {
  const colors = useChartColors();

  const sorted = useMemo(
    () =>
      [...games].filter((g) => g.sizeBytes > 0).sort((a, b) => b.sizeBytes - a.sizeBytes),
    [games],
  );

  const data = useMemo(() => {
    const visible = showAll ? sorted : sorted.slice(0, DEFAULT_VISIBLE);
    return visible.map((g) => ({
      ...g,
      gb: Math.round((g.sizeBytes / (1024 * 1024 * 1024)) * 100) / 100,
      label: getSourceDisplayName(g.source as GameSource),
      color: getSourceColor(g.source),
    }));
  }, [sorted, showAll]);

  if (data.length === 0) return null;

  const LABEL_WIDTH = 230;
  const MAX_CHARS = 36;

  return (
    <>
      {sorted.length > DEFAULT_VISIBLE && (
        <div className="storage-view__toggle-row">
          <button className="storage-view__toggle-btn" onClick={onToggle}>
            {showAll ? `Show Top ${DEFAULT_VISIBLE}` : `Show All ${sorted.length}`}
          </button>
        </div>
      )}
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 36)}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={colors.border}
            opacity={0.3}
            horizontal={false}
          />
          <XAxis
            type="number"
            tick={{ fill: colors.textSecondary, fontSize: 12 }}
            allowDecimals
            unit=" GB"
          />
          <YAxis
            type="category"
            dataKey="name"
            width={LABEL_WIDTH}
            tick={(props: YAxisTickContentProps) => {
              const full = String(props.payload.value ?? "");
              const display =
                full.length > MAX_CHARS ? full.slice(0, MAX_CHARS - 1) + "…" : full;
              return (
                <g transform={`translate(${props.x},${props.y})`}>
                  <title>{full}</title>
                  <text
                    x={-4}
                    y={0}
                    dy="0.35em"
                    textAnchor="end"
                    fill={colors.textSecondary}
                    fontSize={12}
                  >
                    {display}
                  </text>
                </g>
              );
            }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as GameStorageEntry & {
                gb: number;
                label: string;
              };
              return (
                <div className="activity-chart-tooltip">
                  <div className="activity-chart-tooltip__label">{d.name}</div>
                  <div className="activity-chart-tooltip__value">
                    {formatBytes(d.sizeBytes)} · {d.label}
                  </div>
                  <div
                    className="activity-chart-tooltip__value"
                    style={{ opacity: 0.7, fontSize: 11, marginTop: 2 }}
                  >
                    {d.installPath}
                  </div>
                </div>
              );
            }}
          />
          <Bar
            dataKey="gb"
            radius={[0, 4, 4, 0]}
            barSize={20}
            cursor="pointer"
            onClick={(barData, _index, event) => {
              const game = barData as unknown as GameStorageEntry;
              onBarClick(game, event as unknown as React.MouseEvent);
            }}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

// ── Main StorageView ────────────────────────────────────────

export function StorageView() {
  const [result, setResult] = useState<StorageScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [filters, setFilters] = useState<ActiveFilters>({
    drive: null,
    source: null,
  });
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    game: GameStorageEntry;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const scanInFlight = useRef(false);
  const uninstallTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      for (const t of uninstallTimersRef.current) clearTimeout(t);
    };
  }, []);

  const runScan = useCallback(async () => {
    if (scanInFlight.current) return;
    scanInFlight.current = true;
    setLoading(true);
    setError(null);
    setProgress(null);
    setShowAll(false);
    setFilters({ drive: null, source: null });

    const unlisten = await listen<ScanProgress>("storage-scan-progress", (event) =>
      setProgress(event.payload),
    );

    try {
      const data = await storageApi.scanStorage();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      unlisten();
      setLoading(false);
      scanInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    runScan();
  }, [runScan]);

  // ── Filter handlers ──────────────────────────────────

  const handleDriveClick = useCallback((drive: string) => {
    setFilters((f) => ({
      ...f,
      drive: f.drive === drive ? null : drive,
    }));
    setShowAll(false);
  }, []);

  const handleSourceClick = useCallback((source: string) => {
    setFilters((f) => ({
      ...f,
      source: f.source === source ? null : source,
    }));
    setShowAll(false);
  }, []);

  // ── Context menu ────────────────────────────────────

  const handleBarClick = useCallback(
    (game: GameStorageEntry, event: React.MouseEvent) => {
      if (game.source !== "steam") return;
      setContextMenu({ x: event.clientX, y: event.clientY, game });
    },
    [],
  );

  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [contextMenu]);

  // ── Derived data ─────────────────────────────────────

  const filteredGames = useMemo(() => {
    if (!result) return [];
    let games = result.games;
    if (filters.drive) {
      games = games.filter((g) => g.driveLetter === filters.drive);
    }
    if (filters.source) {
      games = games.filter(
        (g) => g.source.toLowerCase() === filters.source!.toLowerCase(),
      );
    }
    return games;
  }, [result, filters]);

  const largestGame =
    result?.games.reduce<GameStorageEntry | null>(
      (max, g) => (!max || g.sizeBytes > max.sizeBytes ? g : max),
      null,
    ) ?? null;

  const avgGameSize =
    result && result.scannedCount > 0 ? result.totalGameBytes / result.scannedCount : 0;

  const hasActiveFilters = filters.drive !== null || filters.source !== null;

  return (
    <div className="storage-view">
      <Header
        title="Storage"
        subtitle="Your game library on disk"
        actions={
          <button
            className="storage-view__toggle-btn"
            onClick={runScan}
            disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <AppIcon name="refresh" size={12} />
            Rescan
          </button>
        }
      />

      <div className="storage-view__content">
        {loading && (
          <div className="storage-view__loading">
            <LoadingSpinner size="md" />
            <span className="storage-view__loading-text">
              {progress
                ? `Scanning ${progress.scanned} of ${progress.total} games${progress.currentGame ? `... ${progress.currentGame}` : ""}`
                : "Preparing scan..."}
            </span>
          </div>
        )}

        {!loading && error && (
          <div className="storage-view__empty">
            <h3>Scan failed</h3>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && result && result.games.length === 0 && (
          <div className="storage-view__empty">
            <h3>No installed games found</h3>
            <p>Scan your Steam or external game libraries first from the Library page.</p>
          </div>
        )}

        {!loading && !error && result && result.games.length > 0 && (
          <>
            {/* ── Stat Cards ─────────────────────────────── */}
            <div className="storage-view__stats">
              <StatCard label="Games on Disk" value={String(result.scannedCount)} />
              <StatCard label="Game Storage" value={formatBytes(result.totalGameBytes)} />
              <StatCard
                label="Largest Game"
                value={largestGame?.name ?? "—"}
                secondary={largestGame ? formatBytes(largestGame.sizeBytes) : undefined}
              />
              <StatCard label="Avg. Game Size" value={formatBytes(avgGameSize)} />
            </div>

            {/* ── Charts Row ─────────────────────────────── */}
            <div className="storage-view__charts">
              <ChartCard
                title="Drive Overview"
                subtitle="Click a drive to filter games below"
              >
                <DriveOverview
                  drives={result.drives}
                  selectedDrive={filters.drive}
                  onDriveClick={handleDriveClick}
                />
              </ChartCard>

              <ChartCard
                title="Storage by Launcher"
                subtitle="Click a slice to filter games below"
              >
                <StorageBySource
                  games={result.games}
                  selectedSource={filters.source}
                  onSourceClick={handleSourceClick}
                />
              </ChartCard>

              <div className="storage-view__full-width">
                <ChartCard
                  title="Games by Size"
                  subtitle={
                    hasActiveFilters
                      ? `${filteredGames.filter((g) => g.sizeBytes > 0).length} games matching filters`
                      : `${result.games.filter((g) => g.sizeBytes > 0).length} games sorted by disk usage`
                  }
                >
                  <FilterChips
                    filters={filters}
                    onClearDrive={() => {
                      setFilters((f) => ({ ...f, drive: null }));
                      setShowAll(false);
                    }}
                    onClearSource={() => {
                      setFilters((f) => ({ ...f, source: null }));
                      setShowAll(false);
                    }}
                  />
                  <GamesBySize
                    games={filteredGames}
                    showAll={showAll}
                    onToggle={() => setShowAll((v) => !v)}
                    onBarClick={handleBarClick}
                  />
                </ChartCard>
              </div>
            </div>

            {/* ── Scan info ──────────────────────────────── */}
            <div className="storage-view__scan-info">
              Scanned in{" "}
              {result.scanDurationMs < 1000
                ? `${result.scanDurationMs}ms`
                : `${(result.scanDurationMs / 1000).toFixed(1)}s`}
            </div>
          </>
        )}
      </div>

      {contextMenu &&
        createPortal(
          <div
            ref={contextMenuRef}
            className="storage-view__context-menu"
            style={{
              position: "fixed",
              top: contextMenu.y,
              left: contextMenu.x,
            }}
          >
            <div className="storage-view__context-header">{contextMenu.game.name}</div>
            <div className="storage-view__context-detail">
              {formatBytes(contextMenu.game.sizeBytes)}
            </div>
            <div className="storage-view__context-separator" />
            <button
              className="storage-view__context-item storage-view__context-item--danger"
              onClick={() => {
                steamInstallApi.uninstallGame(contextMenu.game.sourceId);
                uninstallTimersRef.current.push(
                  setTimeout(
                    () => useLibraryStore.getState().scanLocalOnly(),
                    UNINSTALL_RESCAN_FIRST_MS,
                  ),
                  setTimeout(() => {
                    useLibraryStore.getState().scanLocalOnly();
                    runScan();
                  }, UNINSTALL_RESCAN_SECOND_MS),
                );
                setContextMenu(null);
              }}
            >
              Uninstall Game
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
