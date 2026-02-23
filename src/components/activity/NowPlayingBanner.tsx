import { useEffect, useState } from "react";
import type { GameSession } from "../../types";
import "./NowPlayingBanner.css";

interface NowPlayingBannerProps {
  activeSessions: GameSession[];
  gameNames: Map<string, string>;
}

function formatElapsed(startTime: number): string {
  const diffSec = Math.floor(Date.now() / 1000) - startTime;
  if (diffSec < 60) return "just started";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function NowPlayingBanner({ activeSessions, gameNames }: NowPlayingBannerProps) {
  const [, setTick] = useState(0);

  // Re-render every 30s to update elapsed times
  useEffect(() => {
    if (activeSessions.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, [activeSessions.length]);

  if (activeSessions.length === 0) return null;

  return (
    <div className="now-playing-banner">
      {activeSessions.map((s) => (
        <div key={s.id} className="now-playing-banner__session">
          <span className="now-playing-banner__dot" />
          <span className="now-playing-banner__name">
            {gameNames.get(s.gameId) ?? `Game ${s.gameId.slice(0, 8)}`}
          </span>
          <span className="now-playing-banner__elapsed">
            {formatElapsed(s.startTime)}
          </span>
          <span className="now-playing-banner__badge">LIVE</span>
        </div>
      ))}
    </div>
  );
}
