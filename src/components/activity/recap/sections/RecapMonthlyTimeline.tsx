import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { formatDuration } from "../../../../utils/formatters";
import { useChartColors } from "../../../profile/charts/useChartColors";

const MONTH_LABELS = [
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

interface RecapMonthlyTimelineProps {
  monthlyPlaytime: number[];
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { month: string; minutes: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div className="activity-chart-tooltip">
      <div className="activity-chart-tooltip__label">{entry.month}</div>
      <div className="activity-chart-tooltip__value">{formatDuration(entry.minutes)}</div>
    </div>
  );
}

export function RecapMonthlyTimeline({ monthlyPlaytime }: RecapMonthlyTimelineProps) {
  const colors = useChartColors();

  const data = monthlyPlaytime.map((minutes, i) => ({
    month: MONTH_LABELS[i],
    minutes,
    hours: Math.round((minutes / 60) * 10) / 10,
  }));

  return (
    <div className="recap-section">
      <h3 className="recap-section__title">Month by Month</h3>
      <div className="recap-section__chart">
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <defs>
              <linearGradient id="recapTimelineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors.accent} stopOpacity={0.3} />
                <stop offset="95%" stopColor={colors.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} opacity={0.3} />
            <XAxis dataKey="month" tick={{ fill: colors.textSecondary, fontSize: 11 }} />
            <YAxis
              tick={{ fill: colors.textSecondary, fontSize: 11 }}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="hours"
              stroke={colors.accent}
              fill="url(#recapTimelineGrad)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
