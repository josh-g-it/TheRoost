import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { ScatterPoint } from "../../../types/profile";
import { useChartColors } from "./useChartColors";
import "./MetacriticScatter.css";

interface MetacriticScatterProps {
  data: ScatterPoint[];
  onDotClick?: (point: ScatterPoint) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload as ScatterPoint;

  return (
    <div className="metacritic-scatter__tooltip">
      <div className="metacritic-scatter__tooltip-name">{point.name}</div>
      <div className="metacritic-scatter__tooltip-stat">
        Metacritic: {point.metacritic}
      </div>
      <div className="metacritic-scatter__tooltip-stat">
        Playtime: {point.playtimeHours}h
      </div>
    </div>
  );
}

export function MetacriticScatter({ data, onDotClick }: MetacriticScatterProps) {
  const colors = useChartColors();

  return (
    <div className="metacritic-scatter">
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} opacity={0.3} />
          <XAxis
            dataKey="metacritic"
            type="number"
            domain={[0, 100]}
            name="Metacritic"
            tick={{ fill: colors.textSecondary, fontSize: 11 }}
            label={{
              value: "Metacritic Score",
              position: "bottom",
              fill: colors.textTertiary,
              fontSize: 11,
            }}
          />
          <YAxis
            dataKey="playtimeHours"
            type="number"
            name="Playtime"
            tick={{ fill: colors.textSecondary, fontSize: 11 }}
            label={{
              value: "Hours",
              angle: -90,
              position: "insideLeft",
              fill: colors.textTertiary,
              fontSize: 11,
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Scatter
            data={data}
            fill={colors.accentSecondary}
            fillOpacity={0.7}
            shape="circle"
            r={5}
            cursor={onDotClick ? "pointer" : undefined}
            onClick={(entry) => onDotClick?.(entry as unknown as ScatterPoint)}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
