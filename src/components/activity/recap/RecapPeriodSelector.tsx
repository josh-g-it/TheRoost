import { useMemo } from "react";
import type { RecapSummary } from "../../../types";
import { formatDuration } from "../../../utils/formatters";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatPeriodLabel(summary: RecapSummary): string {
  if (summary.periodType === "yearly") {
    return `${summary.periodKey} Year in Review`;
  }
  const [year, month] = summary.periodKey.split("-");
  const monthName = MONTH_NAMES[parseInt(month, 10) - 1] || month;
  return `${monthName} ${year}`;
}

interface RecapPeriodSelectorProps {
  summaries: RecapSummary[];
  selectedKey: string | null;
  onSelect: (periodKey: string) => void;
  onRegenerate: () => void;
  onGenerate: (periodKey: string, periodType: "monthly" | "yearly") => void;
}

export function RecapPeriodSelector({
  summaries,
  selectedKey,
  onSelect,
  onRegenerate,
  onGenerate,
}: RecapPeriodSelectorProps) {
  const selectedSummary = useMemo(
    () => summaries.find((s) => s.periodKey === selectedKey),
    [summaries, selectedKey],
  );

  // Check if current month and year recaps exist
  const now = useMemo(() => new Date(), []);
  const currentMonthKey = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, [now]);
  const currentYearKey = String(now.getFullYear());

  const hasCurrentMonth = summaries.some((s) => s.periodKey === currentMonthKey);
  const hasCurrentYear = summaries.some((s) => s.periodKey === currentYearKey);

  return (
    <div className="recap-period-selector">
      <div className="recap-period-selector__left">
        <select
          className="recap-period-selector__dropdown"
          value={selectedKey || ""}
          onChange={(e) => onSelect(e.target.value)}
        >
          {summaries.map((s) => (
            <option key={s.periodKey} value={s.periodKey}>
              {formatPeriodLabel(s)} — {formatDuration(s.totalMinutes)}
            </option>
          ))}
        </select>

        {selectedSummary && (
          <span className="recap-period-selector__subtitle">
            Top game: {selectedSummary.topGameName}
          </span>
        )}
      </div>

      <div className="recap-period-selector__actions">
        {!hasCurrentMonth && (
          <button
            className="recap-period-selector__btn"
            onClick={() => onGenerate(currentMonthKey, "monthly")}
          >
            Generate This Month
          </button>
        )}
        {!hasCurrentYear && (
          <button
            className="recap-period-selector__btn"
            onClick={() => onGenerate(currentYearKey, "yearly")}
          >
            Generate {now.getFullYear()}
          </button>
        )}
        <button
          className="recap-period-selector__btn recap-period-selector__btn--secondary"
          onClick={onRegenerate}
          title="Regenerate this recap with latest data"
        >
          Regenerate
        </button>
      </div>
    </div>
  );
}
