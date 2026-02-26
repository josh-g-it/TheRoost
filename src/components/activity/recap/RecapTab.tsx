import { useEffect, useCallback, useMemo } from "react";
import { LoadingSpinner } from "../../common/LoadingSpinner";
import { RecapPeriodSelector } from "./RecapPeriodSelector";
import { RecapView } from "./RecapView";
import { useRecapStore } from "../../../store/recapSlice";
import "./RecapTab.css";

export function RecapTab() {
  const summaries = useRecapStore((s) => s.summaries);
  const summariesLoading = useRecapStore((s) => s.summariesLoading);
  const currentRecap = useRecapStore((s) => s.currentRecap);
  const currentRecapLoading = useRecapStore((s) => s.currentRecapLoading);
  const currentRecapError = useRecapStore((s) => s.currentRecapError);
  const selectedPeriodKey = useRecapStore((s) => s.selectedPeriodKey);
  const loadSummaries = useRecapStore((s) => s.loadSummaries);
  const selectPeriod = useRecapStore((s) => s.selectPeriod);
  const generateRecap = useRecapStore((s) => s.generateRecap);

  useEffect(() => {
    loadSummaries();
  }, [loadSummaries]);

  const handleGenerate = useCallback(
    (periodKey: string, periodType: "monthly" | "yearly") => {
      generateRecap(periodKey, periodType);
    },
    [generateRecap],
  );

  const handleRegenerate = useCallback(() => {
    if (!selectedPeriodKey || !currentRecap) return;
    generateRecap(selectedPeriodKey, currentRecap.periodType);
  }, [selectedPeriodKey, currentRecap, generateRecap]);

  // Compute current month/year for the "generate" empty state
  const now = useMemo(() => new Date(), []);
  const currentMonthKey = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, [now]);

  if (summariesLoading && summaries.length === 0) {
    return <LoadingSpinner message="Loading recaps..." />;
  }

  if (summaries.length === 0 && !summariesLoading) {
    return (
      <div className="recap-tab__empty">
        <div className="recap-tab__empty-icon">&#x1F4CA;</div>
        <h3>No Recaps Yet</h3>
        <p>Generate your first gaming recap to see your stats and highlights.</p>
        <div className="recap-tab__empty-actions">
          <button
            className="recap-tab__generate-btn"
            onClick={() => handleGenerate(currentMonthKey, "monthly")}
          >
            Generate This Month
          </button>
          <button
            className="recap-tab__generate-btn recap-tab__generate-btn--secondary"
            onClick={() => handleGenerate(String(now.getFullYear()), "yearly")}
          >
            Generate {now.getFullYear()} Year in Review
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="recap-tab">
      <RecapPeriodSelector
        summaries={summaries}
        selectedKey={selectedPeriodKey}
        onSelect={selectPeriod}
        onRegenerate={handleRegenerate}
        onGenerate={handleGenerate}
      />

      {currentRecapLoading ? (
        <LoadingSpinner message="Loading recap..." />
      ) : currentRecapError ? (
        <div className="recap-tab__error">{currentRecapError}</div>
      ) : currentRecap ? (
        <RecapView recap={currentRecap} />
      ) : null}
    </div>
  );
}
