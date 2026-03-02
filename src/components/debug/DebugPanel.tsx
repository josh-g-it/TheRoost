import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Header } from "../layout/Header";
import { Button } from "../common/Button";
import { useDebugStore, filterEvents } from "../../store/debugSlice";
import { useSettingsStore } from "../../store/settingsSlice";
import { useLibraryStore } from "../../store/librarySlice";
import { useUIStore } from "../../store/uiSlice";
import { APP_NAME, MAX_LOG_EVENTS } from "../../constants";
import { useAppVersion } from "../../hooks/useAppVersion";
import type { LogEvent, LogLevel, LogCategory } from "../../types";
import "./DebugPanel.css";

const UPTIME_TICK_MS = 1000;

const ALL_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];
const ALL_CATEGORIES: LogCategory[] = [
  "api",
  "ui",
  "settings",
  "library",
  "launch",
  "system",
  "credential",
  "scan",
  "routing",
];

const SENSITIVE_KEYS = /key|token|password|secret/i;

/** Format metadata as inline key=value pairs for screenshot readability. */
function formatMetadata(meta: Record<string, unknown>): string {
  return Object.entries(meta)
    .map(([k, v]) => {
      if (SENSITIVE_KEYS.test(k)) return `${k}=[REDACTED]`;
      if (Array.isArray(v)) return `${k}=[${v.length} items]`;
      if (v && typeof v === "object") {
        // Flatten one level
        return Object.entries(v as Record<string, unknown>)
          .map(([sk, sv]) => `${k}.${sk}=${truncate(String(sv))}`)
          .join(", ");
      }
      return `${k}=${truncate(String(v))}`;
    })
    .join(", ");
}

function truncate(s: string, max = 80): string {
  return s.length > max ? s.slice(0, max) + "\u2026" : s;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

function formatUptime(startTime: number): string {
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ${seconds % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function copyLogEntry(event: LogEvent): void {
  const lines = [
    `[${event.timestamp}] ${event.level.toUpperCase()} ${event.origin.toUpperCase()} [${event.category}] ${event.source}`,
    `  ${event.message}`,
  ];
  if (event.metadata && Object.keys(event.metadata).length > 0) {
    lines.push(`  ${formatMetadata(event.metadata)}`);
  }
  navigator.clipboard.writeText(lines.join("\n"));
}

function exportLogs(events: LogEvent[]): void {
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `theroost-debug-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Log Entry ─── */

function LogEntry({ event }: { event: LogEvent }) {
  return (
    <div
      className={`debug-panel__log-entry debug-panel__log-entry--${event.level}`}
      onClick={() => copyLogEntry(event)}
      title="Click to copy"
    >
      <div className="debug-panel__log-header">
        <span className="debug-panel__log-time">{formatTime(event.timestamp)}</span>
        <span className={`debug-panel__log-level debug-panel__log-level--${event.level}`}>
          {event.level.toUpperCase()}
        </span>
        <span
          className={`debug-panel__log-origin debug-panel__log-origin--${event.origin === "rust" ? "rust" : "frontend"}`}
        >
          {event.origin === "rust" ? "RUST" : "FE"}
        </span>
        <span className="debug-panel__log-category">{event.category}</span>
        <span className="debug-panel__log-source">{event.source}</span>
        <span className="debug-panel__log-separator">&mdash;</span>
        <span className="debug-panel__log-message">{event.message}</span>
      </div>
      {event.metadata && Object.keys(event.metadata).length > 0 && (
        <div className="debug-panel__log-meta">
          <span className="debug-panel__log-meta-prefix">{"\u2570\u2500 "}</span>
          {formatMetadata(event.metadata)}
        </div>
      )}
    </div>
  );
}

/* ─── Filter Dropdown ─── */

function FilterDropdown<T extends string>({
  items,
  selected,
  onToggle,
}: {
  items: T[];
  selected: Set<T>;
  onToggle: (item: T) => void;
}) {
  return (
    <div className="debug-panel__filter-dropdown">
      {items.map((item) => (
        <label key={item} className="debug-panel__filter-option">
          <input
            type="checkbox"
            checked={selected.has(item)}
            onChange={() => onToggle(item)}
          />
          {item}
        </label>
      ))}
    </div>
  );
}

/* ─── App State Dashboard ─── */

function Dashboard() {
  const events = useDebugStore((s) => s.events);
  const startTime = useDebugStore((s) => s.startTime);
  const isCapturing = useDebugStore((s) => s.isCapturing);
  const settings = useSettingsStore((s) => s.settings);
  const appVersion = useAppVersion();
  const settingsLoading = useSettingsStore((s) => s.isLoading);
  const library = useLibraryStore((s) => s.library);
  const viewMode = useUIStore((s) => s.viewMode);
  const sortBy = useUIStore((s) => s.sortBy);
  const sortOrder = useUIStore((s) => s.sortOrder);
  const filters = useUIStore((s) => s.filters);

  const [uptime, setUptime] = useState(() => formatUptime(startTime));

  useEffect(() => {
    const interval = setInterval(
      () => setUptime(formatUptime(startTime)),
      UPTIME_TICK_MS,
    );
    return () => clearInterval(interval);
  }, [startTime]);

  const installedCount = library?.games.filter((g) => g.isInstalled).length ?? 0;

  return (
    <div className="debug-panel__dashboard">
      <div className="debug-panel__dash-section">
        <span className="debug-panel__dash-title">App</span>
        <span className="debug-panel__dash-row">
          {APP_NAME} <span className="debug-panel__dash-value">v{appVersion}</span>
        </span>
        <span className="debug-panel__dash-row">
          Uptime <span className="debug-panel__dash-value">{uptime}</span>
        </span>
        <span className="debug-panel__dash-row">
          Events{" "}
          <span className="debug-panel__dash-value">
            {events.length}/{MAX_LOG_EVENTS}
          </span>
        </span>
        <span className="debug-panel__dash-row">
          Capture{" "}
          <span
            className={isCapturing ? "debug-panel__dash-ok" : "debug-panel__dash-missing"}
          >
            {isCapturing ? "Active" : "Paused"}
          </span>
        </span>
      </div>

      <div className="debug-panel__dash-section">
        <span className="debug-panel__dash-title">Library</span>
        <span className="debug-panel__dash-row">
          Total{" "}
          <span className="debug-panel__dash-value">
            {library ? `${library.totalCount} games` : "Not loaded"}
          </span>
        </span>
        <span className="debug-panel__dash-row">
          Installed <span className="debug-panel__dash-value">{installedCount}</span>
        </span>
        <span className="debug-panel__dash-row">
          View <span className="debug-panel__dash-value">{viewMode}</span> | Sort{" "}
          <span className="debug-panel__dash-value">
            {sortBy} {sortOrder === "asc" ? "\u2191" : "\u2193"}
          </span>
        </span>
        <span className="debug-panel__dash-row">
          Search{" "}
          <span className="debug-panel__dash-value">
            {filters.searchQuery || "\u2014"}
          </span>
          {filters.showInstalledOnly && " | Installed only"}
        </span>
      </div>

      <div className="debug-panel__dash-section">
        <span className="debug-panel__dash-title">Settings</span>
        <span className="debug-panel__dash-row">
          Status{" "}
          <span
            className={settings ? "debug-panel__dash-ok" : "debug-panel__dash-missing"}
          >
            {settingsLoading ? "Loading..." : settings ? "Loaded" : "Not loaded"}
          </span>
        </span>
        <span className="debug-panel__dash-row">
          Theme{" "}
          <span className="debug-panel__dash-value">{settings?.theme ?? "\u2014"}</span>
        </span>
        <span className="debug-panel__dash-row">
          API Key{" "}
          <span
            className={
              settings?.steamApiKey ? "debug-panel__dash-ok" : "debug-panel__dash-missing"
            }
          >
            {settings?.steamApiKey ? "Present" : "Missing"}
          </span>
        </span>
        <span className="debug-panel__dash-row">
          Steam ID{" "}
          <span
            className={
              settings?.steamId ? "debug-panel__dash-ok" : "debug-panel__dash-missing"
            }
          >
            {settings?.steamId ? "Present" : "Missing"}
          </span>
        </span>
      </div>

      <div className="debug-panel__dash-section">
        <span className="debug-panel__dash-title">System</span>
        <span className="debug-panel__dash-row">
          Platform <span className="debug-panel__dash-value">Windows</span>
        </span>
        <span className="debug-panel__dash-row">
          First Run{" "}
          <span className="debug-panel__dash-value">
            {settings?.isFirstRun ? "Yes" : "No"}
          </span>
        </span>
        <span className="debug-panel__dash-row">
          Tauri ID <span className="debug-panel__dash-value">app.theroost</span>
        </span>
      </div>
    </div>
  );
}

/* ─── Main Panel ─── */

export function DebugPanel() {
  const events = useDebugStore((s) => s.events);
  const isCapturing = useDebugStore((s) => s.isCapturing);
  const clearEvents = useDebugStore((s) => s.clearEvents);
  const setCapturing = useDebugStore((s) => s.setCapturing);

  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<Set<LogLevel>>(
    () => new Set(ALL_LEVELS),
  );
  const [categoryFilter, setCategoryFilter] = useState<Set<LogCategory>>(
    () => new Set(ALL_CATEGORIES),
  );
  const [showLevelDropdown, setShowLevelDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [dashCollapsed, setDashCollapsed] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const logEndRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => filterEvents(events, levelFilter, categoryFilter, search || undefined),
    [events, levelFilter, categoryFilter, search],
  );

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "instant" });
    }
  }, [filtered.length, autoScroll]);

  const toggleLevel = useCallback((level: LogLevel) => {
    setLevelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }, []);

  const toggleCategory = useCallback((cat: LogCategory) => {
    setCategoryFilter((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const levelFilterActive = levelFilter.size < ALL_LEVELS.length;
  const categoryFilterActive = categoryFilter.size < ALL_CATEGORIES.length;

  return (
    <div className="debug-panel">
      <Header
        title="Debug Info"
        subtitle={`${filtered.length} events`}
        actions={
          <Button
            variant={isCapturing ? "ghost" : "danger"}
            size="sm"
            onClick={() => setCapturing(!isCapturing)}
          >
            {isCapturing ? "Pause" : "Resume"}
          </Button>
        }
      />

      <div className="debug-panel__content">
        {/* Toolbar */}
        <div className="debug-panel__toolbar">
          <div style={{ position: "relative" }}>
            <button
              className={`debug-panel__filter-btn ${categoryFilterActive ? "debug-panel__filter-btn--active" : ""}`}
              onClick={() => {
                setShowCategoryDropdown(!showCategoryDropdown);
                setShowLevelDropdown(false);
              }}
            >
              Category {categoryFilterActive ? `(${categoryFilter.size})` : "▼"}
            </button>
            {showCategoryDropdown && (
              <FilterDropdown
                items={ALL_CATEGORIES}
                selected={categoryFilter}
                onToggle={toggleCategory}
              />
            )}
          </div>

          <div style={{ position: "relative" }}>
            <button
              className={`debug-panel__filter-btn ${levelFilterActive ? "debug-panel__filter-btn--active" : ""}`}
              onClick={() => {
                setShowLevelDropdown(!showLevelDropdown);
                setShowCategoryDropdown(false);
              }}
            >
              Level {levelFilterActive ? `(${levelFilter.size})` : "▼"}
            </button>
            {showLevelDropdown && (
              <FilterDropdown
                items={ALL_LEVELS}
                selected={levelFilter}
                onToggle={toggleLevel}
              />
            )}
          </div>

          <input
            type="text"
            className="debug-panel__search"
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={() => {
              setShowLevelDropdown(false);
              setShowCategoryDropdown(false);
            }}
          />

          <button
            className="debug-panel__toolbar-action"
            onClick={() => exportLogs(filtered)}
            title="Export filtered logs as JSON"
          >
            Export
          </button>

          <button
            className="debug-panel__toolbar-action"
            onClick={clearEvents}
            title="Clear all logs"
          >
            Clear
          </button>

          <button
            className={`debug-panel__toolbar-action ${!autoScroll ? "debug-panel__toolbar-action--pause" : ""}`}
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
          >
            {autoScroll ? "Auto-scroll" : "Scroll off"}
          </button>
        </div>

        {/* Dashboard */}
        {!dashCollapsed && <Dashboard />}
        <div
          className="debug-panel__dash-toggle"
          onClick={() => setDashCollapsed(!dashCollapsed)}
        >
          {dashCollapsed ? "▼ Show Dashboard" : "▲ Hide Dashboard"}
        </div>

        {/* Log Stream */}
        <div
          className="debug-panel__log-stream"
          onClick={() => {
            setShowLevelDropdown(false);
            setShowCategoryDropdown(false);
          }}
        >
          {filtered.length === 0 ? (
            <div className="debug-panel__empty">
              {events.length === 0
                ? "No events captured yet. Interact with the app to generate logs."
                : "No events match the current filters."}
            </div>
          ) : (
            filtered.map((event) => <LogEntry key={event.id} event={event} />)
          )}
          <div ref={logEndRef} />
        </div>

        {/* Status bar */}
        <div className="debug-panel__status-bar">
          <span>
            <span
              className={`debug-panel__capture-dot ${!isCapturing ? "debug-panel__capture-dot--paused" : ""}`}
            />
            {isCapturing ? "Capturing" : "Paused"}
          </span>
          <span>
            {filtered.length} / {events.length} events
            {events.length >= MAX_LOG_EVENTS && " (buffer full — oldest events dropped)"}
          </span>
        </div>
      </div>
    </div>
  );
}
