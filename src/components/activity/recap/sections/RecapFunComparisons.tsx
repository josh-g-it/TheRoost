import type { RecapComparison } from "../../../../types";

interface RecapFunComparisonsProps {
  comparisons: RecapComparison[];
}

export function RecapFunComparisons({ comparisons }: RecapFunComparisonsProps) {
  return (
    <div className="recap-section">
      <h3 className="recap-section__title">Put Into Perspective</h3>
      <p className="recap-section__subtitle">Your playtime is equivalent to...</p>
      <div className="recap-comparisons__list">
        {comparisons.map((c, i) => (
          <div key={i} className="recap-comparisons__card">
            <span className="recap-comparisons__emoji">{c.emoji}</span>
            <span className="recap-comparisons__text">
              <strong>{c.count.toFixed(1)}x</strong> {c.activity}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
