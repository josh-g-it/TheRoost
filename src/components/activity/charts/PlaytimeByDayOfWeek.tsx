import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { DayOfWeekEntry } from "../../../types/activity";
import { useChartColors } from "../../profile/charts/useChartColors";
import "./chart-tooltip.css";

interface PlaytimeByDayOfWeekProps {
  data: DayOfWeekEntry[];
  onBarClick?: (entry: DayOfWeekEntry) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload as DayOfWeekEntry;
  return (
    <div className="activity-chart-tooltip">
      <div className="activity-chart-tooltip__label">{entry.day}</div>
      <div className="activity-chart-tooltip__value">
        {entry.totalHours}h ({entry.sessionCount} session
        {entry.sessionCount !== 1 ? "s" : ""})
      </div>
    </div>
  );
}

export function PlaytimeByDayOfWeek({ data, onBarClick }: PlaytimeByDayOfWeekProps) {
  const colors = useChartColors();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} opacity={0.3} />
        <XAxis dataKey="day" tick={{ fill: colors.textSecondary, fontSize: 11 }} />
        <YAxis
          width={50}
          tick={{ fill: colors.textSecondary, fontSize: 11 }}
          allowDecimals={false}
          domain={[0, "auto"]}
          label={{
            value: "hours",
            angle: -90,
            position: "insideLeft",
            fill: colors.textTertiary,
            fontSize: 10,
          }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar
          dataKey="totalHours"
          fill={colors.accent}
          radius={[4, 4, 0, 0]}
          onClick={
            onBarClick
              ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (data: any) => onBarClick(data.payload as DayOfWeekEntry)
              : undefined
          }
          style={onBarClick ? { cursor: "pointer" } : undefined}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
