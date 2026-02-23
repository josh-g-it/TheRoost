import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { LeaderboardEntry, LeaderboardMode } from "../../../types/profile";
import { useChartColors } from "./useChartColors";
import "./DevPublisherLeaderboard.css";

interface DevPublisherLeaderboardProps {
  developerData: LeaderboardEntry[];
  publisherData: LeaderboardEntry[];
  onBarClick?: (entry: LeaderboardEntry, mode: LeaderboardMode) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const entry = payload[0].payload as LeaderboardEntry;

  return (
    <div className="dev-pub-leaderboard__tooltip">
      <div className="dev-pub-leaderboard__tooltip-name">{entry.name}</div>
      <div className="dev-pub-leaderboard__tooltip-stat">
        {entry.totalHours}h across {entry.gameCount} game
        {entry.gameCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

export function DevPublisherLeaderboard({
  developerData,
  publisherData,
  onBarClick,
}: DevPublisherLeaderboardProps) {
  const [mode, setMode] = useState<LeaderboardMode>("developer");
  const colors = useChartColors();

  const data = mode === "developer" ? developerData : publisherData;
  const barColor = mode === "developer" ? colors.accent : colors.accentSecondary;

  return (
    <div className="dev-pub-leaderboard">
      <div className="dev-pub-leaderboard__toggle">
        <button
          className={`dev-pub-leaderboard__toggle-btn${
            mode === "developer" ? " dev-pub-leaderboard__toggle-btn--active" : ""
          }`}
          onClick={() => setMode("developer")}
        >
          Developers
        </button>
        <button
          className={`dev-pub-leaderboard__toggle-btn${
            mode === "publisher" ? " dev-pub-leaderboard__toggle-btn--active" : ""
          }`}
          onClick={() => setMode("publisher")}
        >
          Publishers
        </button>
      </div>

      {data.length === 0 ? (
        <div className="dev-pub-leaderboard__empty">No {mode} data available</div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(300, data.length * 36)}>
          <BarChart layout="vertical" data={data}>
            <CartesianGrid
              horizontal={false}
              strokeDasharray="3 3"
              stroke={colors.border}
              strokeOpacity={0.3}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={150}
              tick={{ fill: colors.textSecondary, fontSize: 11 }}
            />
            <XAxis
              type="number"
              dataKey="totalHours"
              tick={{ fill: colors.textSecondary, fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: colors.bgTertiary }} />
            <Bar
              dataKey="totalHours"
              fill={barColor}
              radius={[0, 4, 4, 0]}
              cursor={onBarClick ? "pointer" : undefined}
              onClick={(data) => {
                const entry = (data as unknown as { payload: LeaderboardEntry })?.payload;
                if (entry && onBarClick) onBarClick(entry, mode);
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
