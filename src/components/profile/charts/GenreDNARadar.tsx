import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from "recharts";
import type { RadarDataPoint } from "../../../types/profile";
import { useChartColors } from "./useChartColors";
import "./GenreDNARadar.css";

interface GenreDNARadarProps {
  data: RadarDataPoint[];
  onGenreClick?: (genre: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload as RadarDataPoint;

  return (
    <div className="genre-dna-radar__tooltip">
      <div className="genre-dna-radar__tooltip-label">{point.genre}</div>
      <div className="genre-dna-radar__tooltip-value">{point.playtime.toFixed(1)}h</div>
    </div>
  );
}

export function GenreDNARadar({ data, onGenreClick }: GenreDNARadarProps) {
  const colors = useChartColors();

  return (
    <div className="genre-dna-radar">
      <ResponsiveContainer width="100%" height={350}>
        <RadarChart data={data}>
          <PolarGrid stroke={colors.border} />
          <PolarAngleAxis
            dataKey="genre"
            tick={({ x, y, payload, textAnchor }) => (
              <text
                x={x}
                y={y}
                textAnchor={textAnchor}
                fill={colors.textSecondary}
                fontSize={12}
                style={{
                  cursor: onGenreClick ? "pointer" : undefined,
                  pointerEvents: onGenreClick ? "auto" : undefined,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onGenreClick?.(payload.value);
                }}
              >
                {payload.value}
              </text>
            )}
          />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            dataKey="normalized"
            fill={colors.accent}
            fillOpacity={0.6}
            stroke={colors.accent}
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
