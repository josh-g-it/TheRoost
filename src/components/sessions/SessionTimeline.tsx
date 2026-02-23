import { useMemo, useState } from "react";
import type { GameSession } from "../../types";
import {
  formatDate,
  formatTime,
  formatDuration,
  formatRelativeTime,
} from "../../utils/formatters";
import "./SessionTimeline.css";

interface SessionTimelineProps {
  sessions: GameSession[];
  showGameName?: boolean;
  gameNames?: Map<string, string>;
  initialLimit?: number;
}

interface DateGroup {
  date: string;
  sessions: GameSession[];
}

function groupByDate(sessions: GameSession[]): DateGroup[] {
  const groups = new Map<string, GameSession[]>();
  for (const s of sessions) {
    const key = formatDate(s.startTime);
    const group = groups.get(key);
    if (group) {
      group.push(s);
    } else {
      groups.set(key, [s]);
    }
  }
  return Array.from(groups.entries()).map(([date, sessions]) => ({
    date,
    sessions,
  }));
}

export function SessionTimeline({
  sessions,
  showGameName = false,
  gameNames,
  initialLimit = 10,
}: SessionTimelineProps) {
  const [expanded, setExpanded] = useState(false);

  const visibleSessions = expanded ? sessions : sessions.slice(0, initialLimit);

  const groups = useMemo(() => groupByDate(visibleSessions), [visibleSessions]);

  if (sessions.length === 0) {
    return (
      <div className="session-timeline__empty">
        <p>No sessions recorded yet</p>
      </div>
    );
  }

  return (
    <div className="session-timeline">
      {groups.map((group) => (
        <div key={group.date} className="session-timeline__group">
          <div className="session-timeline__date-header">{group.date}</div>
          <div className="session-timeline__entries">
            {group.sessions.map((session) => {
              const isActive = session.endTime === null;
              return (
                <div
                  key={session.id}
                  className={`session-timeline__entry${isActive ? " session-timeline__entry--active" : ""}`}
                >
                  <div className="session-timeline__indicator">
                    <div
                      className={`session-timeline__dot${isActive ? " session-timeline__dot--active" : ""}`}
                    />
                    <div className="session-timeline__line" />
                  </div>
                  <div className="session-timeline__content">
                    <div className="session-timeline__row">
                      <span className="session-timeline__time">
                        {formatTime(session.startTime)}
                        {isActive
                          ? " — now"
                          : session.endTime
                            ? ` — ${formatTime(session.endTime)}`
                            : ""}
                      </span>
                      {session.durationMinutes != null && (
                        <span className="session-timeline__duration">
                          {formatDuration(session.durationMinutes)}
                        </span>
                      )}
                      {isActive && (
                        <span className="session-timeline__live-badge">Playing</span>
                      )}
                    </div>
                    {showGameName && (
                      <span className="session-timeline__game-name">
                        {gameNames?.get(session.gameId) ?? `Game ${session.gameId}`}
                      </span>
                    )}
                    <span className="session-timeline__relative">
                      {formatRelativeTime(session.startTime)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {!expanded && sessions.length > initialLimit && (
        <button className="session-timeline__show-more" onClick={() => setExpanded(true)}>
          Show {sessions.length - initialLimit} more sessions
        </button>
      )}
    </div>
  );
}
