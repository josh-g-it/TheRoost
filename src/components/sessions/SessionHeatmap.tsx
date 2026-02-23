import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import type { GameSession } from "../../types";
import { formatDuration } from "../../utils/formatters";
import "./SessionHeatmap.css";

interface SessionHeatmapProps {
  sessions: GameSession[];
  days?: number;
  onCellClick?: (dateKey: string) => void;
}

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_NAMES = [
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

const DAY_LABEL_WIDTH = 28;
const GAP = 2;
const MIN_CELL = 8;
const MAX_CELL = 14;
const DEFAULT_CELL = 12;

function getIntensity(minutes: number): number {
  if (minutes === 0) return 0;
  if (minutes <= 30) return 1;
  if (minutes <= 120) return 2;
  if (minutes <= 300) return 3;
  return 4;
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function SessionHeatmap({
  sessions,
  days = 365,
  onCellClick,
}: SessionHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const handleResize = useCallback(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.offsetWidth);
    }
  }, []);

  useEffect(() => {
    handleResize();
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [handleResize]);

  const { cells, monthLabels, totalCols } = useMemo(() => {
    // Build playtime-per-day map
    const dayMap = new Map<string, number>();
    for (const s of sessions) {
      const date = new Date(s.startTime * 1000);
      const key = toDateKey(date);
      dayMap.set(key, (dayMap.get(key) ?? 0) + (s.durationMinutes ?? 0));
    }

    // Generate grid cells from (today - days) to today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days + 1);
    // Align to start of week (Sunday)
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const cellList: {
      key: string;
      date: Date;
      minutes: number;
      intensity: number;
      col: number;
      row: number;
    }[] = [];

    const labels: { label: string; col: number }[] = [];
    let lastMonth = -1;

    const current = new Date(startDate);
    let col = 0;

    while (current <= today) {
      const row = current.getDay();
      if (row === 0 && current > startDate) col++;

      const key = toDateKey(current);
      const minutes = dayMap.get(key) ?? 0;

      cellList.push({
        key,
        date: new Date(current),
        minutes,
        intensity: getIntensity(minutes),
        col,
        row,
      });

      // Month labels on first day of month visible
      if (current.getMonth() !== lastMonth && current.getDate() <= 7) {
        labels.push({ label: MONTH_NAMES[current.getMonth()], col });
        lastMonth = current.getMonth();
      }

      current.setDate(current.getDate() + 1);
    }

    const cols = cellList.length > 0 ? cellList[cellList.length - 1].col + 1 : 0;
    return { cells: cellList, monthLabels: labels, totalCols: cols };
  }, [sessions, days]);

  // Compute dynamic cell size to fill available container width
  const cellSize = useMemo(() => {
    if (containerWidth <= 0 || totalCols === 0) return DEFAULT_CELL;
    const availableWidth = containerWidth - DAY_LABEL_WIDTH - GAP;
    const size = Math.floor((availableWidth - (totalCols - 1) * GAP) / totalCols);
    return Math.max(MIN_CELL, Math.min(MAX_CELL, size));
  }, [containerWidth, totalCols]);

  return (
    <div className="session-heatmap" ref={containerRef}>
      <div className="session-heatmap__container">
        <div
          className="session-heatmap__day-labels"
          style={{ gridTemplateRows: `repeat(7, ${cellSize}px)` }}
        >
          {DAY_LABELS.map((label, i) => (
            <span key={i} className="session-heatmap__day-label">
              {label}
            </span>
          ))}
        </div>
        <div className="session-heatmap__grid-wrapper">
          <div
            className="session-heatmap__month-labels"
            style={{ gridTemplateColumns: `repeat(${totalCols}, ${cellSize}px)` }}
          >
            {monthLabels.map((m, i) => (
              <span
                key={i}
                className="session-heatmap__month-label"
                style={{ gridColumn: m.col + 1 }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div
            className="session-heatmap__grid"
            style={{
              gridTemplateColumns: `repeat(${totalCols}, ${cellSize}px)`,
              gridTemplateRows: `repeat(7, ${cellSize}px)`,
            }}
          >
            {cells.map((cell) => (
              <div
                key={cell.key}
                className={`session-heatmap__cell session-heatmap__cell--level-${cell.intensity}${onCellClick ? " session-heatmap__cell--clickable" : ""}`}
                style={{
                  gridColumn: cell.col + 1,
                  gridRow: cell.row + 1,
                }}
                title={`${cell.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}${cell.minutes > 0 ? ` — ${formatDuration(cell.minutes)}` : ""}`}
                onClick={onCellClick ? () => onCellClick(cell.key) : undefined}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="session-heatmap__legend">
        <span className="session-heatmap__legend-label">Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={`session-heatmap__cell session-heatmap__cell--level-${level}`}
          />
        ))}
        <span className="session-heatmap__legend-label">More</span>
      </div>
    </div>
  );
}
