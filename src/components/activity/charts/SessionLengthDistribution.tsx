import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { SessionLengthBucket } from "../../../types/activity";
import { useChartColors } from "../../profile/charts/useChartColors";
import "./chart-tooltip.css";

interface SessionLengthDistributionProps {
  data: SessionLengthBucket[];
  onBarClick?: (bucket: SessionLengthBucket) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const bucket = payload[0].payload as SessionLengthBucket;
  return (
    <div className="activity-chart-tooltip">
      <div className="activity-chart-tooltip__label">{bucket.label}</div>
      <div className="activity-chart-tooltip__value">
        {bucket.count} session{bucket.count !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

export function SessionLengthDistribution({
  data,
  onBarClick,
}: SessionLengthDistributionProps) {
  const colors = useChartColors();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} opacity={0.3} />
        <XAxis dataKey="label" tick={{ fill: colors.textSecondary, fontSize: 11 }} />
        <YAxis
          width={50}
          tick={{ fill: colors.textSecondary, fontSize: 11 }}
          allowDecimals={false}
          domain={[0, "auto"]}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar
          dataKey="count"
          fill={colors.accentSecondary}
          radius={[4, 4, 0, 0]}
          onClick={
            onBarClick
              ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (data: any) => onBarClick(data.payload as SessionLengthBucket)
              : undefined
          }
          style={onBarClick ? { cursor: "pointer" } : undefined}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
