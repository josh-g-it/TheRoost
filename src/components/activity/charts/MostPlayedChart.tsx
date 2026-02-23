import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { MostPlayedEntry } from "../../../types/activity";
import { useChartColors } from "../../profile/charts/useChartColors";
import { formatDuration } from "../../../utils/formatters";
import "./chart-tooltip.css";

interface MostPlayedChartProps {
  data: MostPlayedEntry[];
  onBarClick?: (entry: MostPlayedEntry) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload as MostPlayedEntry;
  return (
    <div className="activity-chart-tooltip">
      <div className="activity-chart-tooltip__label">{entry.name}</div>
      <div className="activity-chart-tooltip__value">
        {formatDuration(entry.totalMinutes)} ({entry.sessionCount} session
        {entry.sessionCount !== 1 ? "s" : ""})
      </div>
    </div>
  );
}

export function MostPlayedChart({ data, onBarClick }: MostPlayedChartProps) {
  const colors = useChartColors();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} opacity={0.3} />
        <XAxis
          type="number"
          tick={{ fill: colors.textSecondary, fontSize: 11 }}
          allowDecimals={false}
          domain={[0, "auto"]}
          label={{
            value: "hours",
            position: "insideBottomRight",
            fill: colors.textTertiary,
            fontSize: 10,
            offset: -5,
          }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fill: colors.textSecondary, fontSize: 11 }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar
          dataKey="totalHours"
          fill={colors.accent}
          radius={[0, 4, 4, 0]}
          onClick={
            onBarClick
              ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (data: any) => onBarClick(data.payload as MostPlayedEntry)
              : undefined
          }
          style={onBarClick ? { cursor: "pointer" } : undefined}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
