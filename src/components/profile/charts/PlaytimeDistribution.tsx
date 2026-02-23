import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { DistributionBucket } from "../../../types/profile";
import { useChartColors } from "./useChartColors";
import "./PlaytimeDistribution.css";

interface PlaytimeDistributionProps {
  data: DistributionBucket[];
  onBucketClick?: (bucket: DistributionBucket) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const bucket = payload[0].payload as DistributionBucket;

  return (
    <div className="playtime-distribution__tooltip">
      {bucket.label}: {bucket.count} game{bucket.count !== 1 ? "s" : ""}
    </div>
  );
}

export function PlaytimeDistribution({ data, onBucketClick }: PlaytimeDistributionProps) {
  const colors = useChartColors();

  return (
    <div className="playtime-distribution">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} opacity={0.3} />
          <XAxis dataKey="label" tick={{ fill: colors.textSecondary, fontSize: 11 }} />
          <YAxis
            tick={{ fill: colors.textSecondary, fontSize: 11 }}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="count"
            fill={colors.accent}
            radius={[4, 4, 0, 0]}
            cursor={onBucketClick ? "pointer" : undefined}
            onClick={(data) => {
              const bucket = (data as unknown as { payload: DistributionBucket })
                ?.payload;
              if (bucket && onBucketClick) onBucketClick(bucket);
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
