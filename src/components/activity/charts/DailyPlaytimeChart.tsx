import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { DailyPlaytimePoint } from "../../../types/activity";
import { useChartColors } from "../../profile/charts/useChartColors";
import { formatDuration } from "../../../utils/formatters";
import "./chart-tooltip.css";

interface DailyPlaytimeChartProps {
  data: DailyPlaytimePoint[];
  onPointClick?: (point: DailyPlaytimePoint) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as DailyPlaytimePoint;
  return (
    <div className="activity-chart-tooltip">
      <div className="activity-chart-tooltip__label">{point.date}</div>
      <div className="activity-chart-tooltip__value">
        {point.minutes > 0
          ? `${formatDuration(point.minutes)} (${point.sessionCount} session${point.sessionCount !== 1 ? "s" : ""})`
          : "No play time"}
      </div>
    </div>
  );
}

export function DailyPlaytimeChart({ data, onPointClick }: DailyPlaytimeChartProps) {
  const colors = useChartColors();

  // Show ~6-7 labels regardless of range
  const tickInterval =
    data.length <= 7 ? 0 : Math.max(1, Math.floor(data.length / 6) - 1);

  // Custom activeDot that handles click on individual data points

  const renderActiveDot = onPointClick
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (props: any) => {
        const { cx, cy, payload } = props;
        if (cx == null || cy == null) return null;
        return (
          <circle
            key={`active-${payload.dateKey}`}
            cx={cx}
            cy={cy}
            r={6}
            fill={colors.accent}
            stroke={colors.bgSecondary}
            strokeWidth={2}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onPointClick(payload as DailyPlaytimePoint);
            }}
          />
        );
      }
    : undefined;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="dailyPlaytimeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.accent} stopOpacity={0.3} />
            <stop offset="95%" stopColor={colors.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} opacity={0.3} />
        <XAxis
          dataKey="date"
          tick={{ fill: colors.textSecondary, fontSize: 11 }}
          interval={tickInterval}
        />
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
        <Area
          type="monotone"
          dataKey="hours"
          stroke={colors.accent}
          fill="url(#dailyPlaytimeGrad)"
          strokeWidth={2}
          dot={false}
          activeDot={renderActiveDot}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
