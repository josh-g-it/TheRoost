import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { RecapTopGame } from "../../../../types";
import { formatDuration } from "../../../../utils/formatters";
import { useChartColors } from "../../../profile/charts/useChartColors";

interface RecapTopGamesProps {
  topGames: RecapTopGame[];
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: RecapTopGame & { hours: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div className="activity-chart-tooltip">
      <div className="activity-chart-tooltip__label">{entry.name}</div>
      <div className="activity-chart-tooltip__value">
        {formatDuration(entry.minutes)} ({entry.sessions} session
        {entry.sessions !== 1 ? "s" : ""})
      </div>
    </div>
  );
}

export function RecapTopGames({ topGames }: RecapTopGamesProps) {
  const colors = useChartColors();

  const data = topGames.map((g) => ({
    ...g,
    hours: Math.round((g.minutes / 60) * 10) / 10,
    // Truncate long names for the axis
    shortName: g.name.length > 20 ? g.name.slice(0, 18) + "..." : g.name,
  }));

  return (
    <div className="recap-section">
      <h3 className="recap-section__title">Top Games</h3>
      <div className="recap-section__chart">
        <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={colors.border}
              opacity={0.3}
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={{ fill: colors.textSecondary, fontSize: 11 }}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="shortName"
              width={130}
              tick={{ fill: colors.textSecondary, fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="hours"
              fill={colors.accent}
              radius={[0, 4, 4, 0]}
              barSize={24}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
