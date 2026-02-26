import { create } from "zustand";
import type { RecapData, RecapSummary } from "../types";
import { recapApi } from "../services/tauri";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

interface RecapState {
  summaries: RecapSummary[];
  summariesLoading: boolean;

  currentRecap: RecapData | null;
  currentRecapLoading: boolean;
  currentRecapError: string | null;

  selectedPeriodKey: string | null;

  loadSummaries: () => Promise<void>;
  loadRecap: (periodKey: string) => Promise<void>;
  generateRecap: (periodKey: string, periodType: "monthly" | "yearly") => Promise<void>;
  selectPeriod: (periodKey: string) => void;
}

export const useRecapStore = create<RecapState>((set, get) => ({
  summaries: [],
  summariesLoading: false,

  currentRecap: null,
  currentRecapLoading: false,
  currentRecapError: null,

  selectedPeriodKey: null,

  loadSummaries: async () => {
    set({ summariesLoading: true });
    try {
      const summaries = await recapApi.listRecaps();
      set({ summaries, summariesLoading: false });

      // Auto-select latest if nothing selected
      if (!get().selectedPeriodKey && summaries.length > 0) {
        const latest = summaries[0];
        set({ selectedPeriodKey: latest.periodKey });
        get().loadRecap(latest.periodKey);
      }
    } catch (e) {
      logger.error("recapSlice", "activity", "Failed to load recap summaries", {
        error: getErrorMessage(e),
      });
      set({ summariesLoading: false });
    }
  },

  loadRecap: async (periodKey: string) => {
    set({ currentRecapLoading: true, currentRecapError: null });
    try {
      const recap = await recapApi.getRecap(periodKey);
      set({
        currentRecap: recap,
        currentRecapLoading: false,
        selectedPeriodKey: periodKey,
      });
    } catch (e) {
      const msg = getErrorMessage(e);
      set({ currentRecapError: msg, currentRecapLoading: false });
      logger.error("recapSlice", "activity", "Failed to load recap", {
        periodKey,
        error: msg,
      });
    }
  },

  generateRecap: async (periodKey: string, periodType: "monthly" | "yearly") => {
    set({ currentRecapLoading: true, currentRecapError: null });
    try {
      const recap = await recapApi.generateRecap(periodKey, periodType);
      set({
        currentRecap: recap,
        currentRecapLoading: false,
        selectedPeriodKey: periodKey,
      });
      // Refresh summaries list
      get().loadSummaries();
      logger.info("recapSlice", "activity", "Recap generated", {
        periodKey,
        periodType,
      });
    } catch (e) {
      const msg = getErrorMessage(e);
      set({ currentRecapError: msg, currentRecapLoading: false });
      logger.error("recapSlice", "activity", "Failed to generate recap", {
        periodKey,
        error: msg,
      });
    }
  },

  selectPeriod: (periodKey: string) => {
    set({ selectedPeriodKey: periodKey });
    get().loadRecap(periodKey);
  },
}));
