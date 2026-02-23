import { DrillDownOverlay } from "../common/DrillDownOverlay";
import { SessionTimeline } from "../sessions/SessionTimeline";
import type { GameSession } from "../../types/session";

export interface SessionDrillDownContext {
  title: string;
  subtitle?: string;
  sessions: GameSession[];
}

interface SessionDrillDownProps {
  context: SessionDrillDownContext;
  gameNames: Map<string, string>;
  onClose: () => void;
}

export function SessionDrillDown({ context, gameNames, onClose }: SessionDrillDownProps) {
  return (
    <DrillDownOverlay title={context.title} subtitle={context.subtitle} onClose={onClose}>
      {context.sessions.length === 0 ? (
        <p style={{ color: "var(--color-text-secondary)", textAlign: "center" }}>
          No sessions found for this selection.
        </p>
      ) : (
        <SessionTimeline
          sessions={context.sessions}
          showGameName
          gameNames={gameNames}
          initialLimit={50}
        />
      )}
    </DrillDownOverlay>
  );
}
