import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { RecapGenreEntry } from "../../../../types";
import { formatDuration } from "../../../../utils/formatters";
import { useChartColors } from "../../../profile/charts/useChartColors";

const GENRE_COLORS = [
  "var(--color-accent-primary)",
  "var(--color-accent-secondary)",
  "var(--color-accent-success)",
  "var(--color-accent-warning)",
  "var(--color-accent-error)",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7c43",
  "#a4de6c",
];

interface RecapGenreBreakdownProps {
  genreBreakdown: RecapGenreEntry[];
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: RecapGenreEntry }>;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div className="activity-chart-tooltip">
      <div className="activity-chart-tooltip__label">{entry.genre}</div>
      <div className="activity-chart-tooltip__value">
        {formatDuration(entry.minutes)} ({entry.percentage}%)
      </div>
    </div>
  );
}

export function RecapGenreBreakdown({ genreBreakdown }: RecapGenreBreakdownProps) {
  const colors = useChartColors();

  return (
    <div className="recap-section">
      <h3 className="recap-section__title">Genre Breakdown</h3>
      <div className="recap-section__chart">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={genreBreakdown}
              dataKey="minutes"
              nameKey="genre"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={100}
              paddingAngle={2}
            >
              {genreBreakdown.map((_, i) => (
                <Cell key={i} fill={GENRE_COLORS[i % GENRE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value: string) => (
                <span style={{ color: colors.textSecondary, fontSize: 12 }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
