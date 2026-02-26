import type { RecapDiscovery } from "../../../../types";

interface RecapDiscoveriesProps {
  discoveries: RecapDiscovery[];
}

export function RecapDiscoveries({ discoveries }: RecapDiscoveriesProps) {
  return (
    <div className="recap-section">
      <h3 className="recap-section__title">New Discoveries ({discoveries.length})</h3>
      <p className="recap-section__subtitle">Games you played for the first time</p>
      <div className="recap-discoveries__list">
        {discoveries.map((d) => (
          <span key={d.gameId} className="recap-discoveries__pill">
            {d.name}
          </span>
        ))}
      </div>
    </div>
  );
}
