import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRecapStore } from "./recapSlice";
import type { RecapData, RecapSummary } from "../types";
import { makeRecap } from "../test/factories";

// Mock tauri service
vi.mock("../services/tauri", () => ({
  recapApi: {
    getRecap: vi.fn().mockResolvedValue(null),
    listRecaps: vi.fn().mockResolvedValue([]),
    generateRecap: vi.fn().mockResolvedValue(null),
    deleteRecap: vi.fn().mockResolvedValue(undefined),
  },
}));

// Import after mock so we get the mocked version
import { recapApi } from "../services/tauri";

function makeSummary(overrides: Partial<RecapSummary> = {}): RecapSummary {
  return {
    periodKey: "2026-02",
    periodType: "monthly",
    generatedAt: Date.now(),
    totalMinutes: 1200,
    topGameName: "Elden Ring",
    ...overrides,
  };
}

describe("recapSlice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useRecapStore.setState({
      summaries: [],
      summariesLoading: false,
      currentRecap: null,
      currentRecapLoading: false,
      currentRecapError: null,
      selectedPeriodKey: null,
    });
  });

  describe("loadSummaries", () => {
    it("loads summaries and auto-selects the latest", async () => {
      const summaries = [
        makeSummary({ periodKey: "2026-02" }),
        makeSummary({ periodKey: "2026-01" }),
      ];
      const recapData = makeRecap({ periodKey: "2026-02" });
      vi.mocked(recapApi.listRecaps).mockResolvedValueOnce(summaries);
      vi.mocked(recapApi.getRecap).mockResolvedValueOnce(recapData);

      await useRecapStore.getState().loadSummaries();

      const state = useRecapStore.getState();
      expect(state.summaries).toHaveLength(2);
      expect(state.summariesLoading).toBe(false);
      expect(state.selectedPeriodKey).toBe("2026-02");
      // getRecap should have been called for auto-selected period
      expect(recapApi.getRecap).toHaveBeenCalledWith("2026-02");
    });

    it("sets summariesLoading during fetch", async () => {
      let resolvePromise: (value: RecapSummary[]) => void;
      const promise = new Promise<RecapSummary[]>((r) => {
        resolvePromise = r;
      });
      vi.mocked(recapApi.listRecaps).mockReturnValueOnce(promise);

      const fetchPromise = useRecapStore.getState().loadSummaries();
      expect(useRecapStore.getState().summariesLoading).toBe(true);

      resolvePromise!([]);
      await fetchPromise;
      expect(useRecapStore.getState().summariesLoading).toBe(false);
    });

    it("does not auto-select if a period is already selected", async () => {
      useRecapStore.setState({ selectedPeriodKey: "2026-01" });

      const summaries = [makeSummary({ periodKey: "2026-02" })];
      vi.mocked(recapApi.listRecaps).mockResolvedValueOnce(summaries);

      await useRecapStore.getState().loadSummaries();

      const state = useRecapStore.getState();
      expect(state.summaries).toHaveLength(1);
      // Should keep existing selection, not auto-select 2026-02
      expect(state.selectedPeriodKey).toBe("2026-01");
      expect(recapApi.getRecap).not.toHaveBeenCalled();
    });

    it("does not auto-select when summaries list is empty", async () => {
      vi.mocked(recapApi.listRecaps).mockResolvedValueOnce([]);

      await useRecapStore.getState().loadSummaries();

      const state = useRecapStore.getState();
      expect(state.summaries).toHaveLength(0);
      expect(state.selectedPeriodKey).toBeNull();
      expect(recapApi.getRecap).not.toHaveBeenCalled();
    });

    it("handles API error gracefully", async () => {
      vi.mocked(recapApi.listRecaps).mockRejectedValueOnce(new Error("Network error"));

      await useRecapStore.getState().loadSummaries();

      const state = useRecapStore.getState();
      expect(state.summariesLoading).toBe(false);
      expect(state.summaries).toHaveLength(0);
    });
  });

  describe("loadRecap", () => {
    it("loads a recap and sets it as current", async () => {
      const recapData = makeRecap({ periodKey: "2026-01" });
      vi.mocked(recapApi.getRecap).mockResolvedValueOnce(recapData);

      await useRecapStore.getState().loadRecap("2026-01");

      const state = useRecapStore.getState();
      expect(state.currentRecap).toEqual(recapData);
      expect(state.currentRecapLoading).toBe(false);
      expect(state.currentRecapError).toBeNull();
      expect(state.selectedPeriodKey).toBe("2026-01");
    });

    it("sets currentRecapLoading during fetch", async () => {
      let resolvePromise: (value: RecapData | null) => void;
      const promise = new Promise<RecapData | null>((r) => {
        resolvePromise = r;
      });
      vi.mocked(recapApi.getRecap).mockReturnValueOnce(promise);

      const fetchPromise = useRecapStore.getState().loadRecap("2026-01");
      expect(useRecapStore.getState().currentRecapLoading).toBe(true);
      expect(useRecapStore.getState().currentRecapError).toBeNull();

      resolvePromise!(null);
      await fetchPromise;
      expect(useRecapStore.getState().currentRecapLoading).toBe(false);
    });

    it("sets error state on API failure", async () => {
      vi.mocked(recapApi.getRecap).mockRejectedValueOnce(new Error("Recap not found"));

      await useRecapStore.getState().loadRecap("2026-01");

      const state = useRecapStore.getState();
      expect(state.currentRecapError).toBe("Recap not found");
      expect(state.currentRecapLoading).toBe(false);
      expect(state.currentRecap).toBeNull();
    });

    it("clears previous error when starting a new load", async () => {
      useRecapStore.setState({ currentRecapError: "Old error" });

      vi.mocked(recapApi.getRecap).mockResolvedValueOnce(makeRecap());

      await useRecapStore.getState().loadRecap("2026-02");

      expect(useRecapStore.getState().currentRecapError).toBeNull();
    });
  });

  describe("generateRecap", () => {
    it("generates a recap, sets it as current, and refreshes summaries", async () => {
      const recapData = makeRecap({ periodKey: "2026-02", periodType: "monthly" });
      const summaries = [makeSummary({ periodKey: "2026-02" })];
      vi.mocked(recapApi.generateRecap).mockResolvedValueOnce(recapData);
      vi.mocked(recapApi.listRecaps).mockResolvedValueOnce(summaries);

      await useRecapStore.getState().generateRecap("2026-02", "monthly");

      const state = useRecapStore.getState();
      expect(state.currentRecap).toEqual(recapData);
      expect(state.currentRecapLoading).toBe(false);
      expect(state.selectedPeriodKey).toBe("2026-02");
      expect(recapApi.generateRecap).toHaveBeenCalledWith("2026-02", "monthly");
      // Should refresh summaries after generation
      expect(recapApi.listRecaps).toHaveBeenCalled();
    });

    it("sets error state on generation failure", async () => {
      vi.mocked(recapApi.generateRecap).mockRejectedValueOnce(
        new Error("Not enough data"),
      );

      await useRecapStore.getState().generateRecap("2026-02", "monthly");

      const state = useRecapStore.getState();
      expect(state.currentRecapError).toBe("Not enough data");
      expect(state.currentRecapLoading).toBe(false);
    });

    it("sets currentRecapLoading during generation", async () => {
      let resolvePromise: (value: RecapData) => void;
      const promise = new Promise<RecapData>((r) => {
        resolvePromise = r;
      });
      vi.mocked(recapApi.generateRecap).mockReturnValueOnce(promise);

      const genPromise = useRecapStore.getState().generateRecap("2026-02", "monthly");
      expect(useRecapStore.getState().currentRecapLoading).toBe(true);

      resolvePromise!(makeRecap());
      await genPromise;
      expect(useRecapStore.getState().currentRecapLoading).toBe(false);
    });

    it("generates a yearly recap correctly", async () => {
      const recapData = makeRecap({
        periodKey: "2025",
        periodType: "yearly",
        monthlyPlaytime: [100, 200, 150, 80, 60, 40, 30, 50, 90, 120, 140, 160],
      });
      vi.mocked(recapApi.generateRecap).mockResolvedValueOnce(recapData);
      vi.mocked(recapApi.listRecaps).mockResolvedValueOnce([]);

      await useRecapStore.getState().generateRecap("2025", "yearly");

      const state = useRecapStore.getState();
      expect(state.currentRecap?.periodType).toBe("yearly");
      expect(state.currentRecap?.monthlyPlaytime).toHaveLength(12);
      expect(recapApi.generateRecap).toHaveBeenCalledWith("2025", "yearly");
    });
  });

  describe("selectPeriod", () => {
    it("updates selectedPeriodKey and triggers loadRecap", async () => {
      const recapData = makeRecap({ periodKey: "2026-01" });
      vi.mocked(recapApi.getRecap).mockResolvedValueOnce(recapData);

      useRecapStore.getState().selectPeriod("2026-01");

      expect(useRecapStore.getState().selectedPeriodKey).toBe("2026-01");
      // loadRecap is called internally, which calls getRecap
      expect(recapApi.getRecap).toHaveBeenCalledWith("2026-01");
    });

    it("switching periods loads different recap data", async () => {
      const recap1 = makeRecap({ periodKey: "2026-01", totalMinutes: 800 });
      const recap2 = makeRecap({ periodKey: "2026-02", totalMinutes: 1200 });

      vi.mocked(recapApi.getRecap).mockResolvedValueOnce(recap1);
      useRecapStore.getState().selectPeriod("2026-01");
      await vi.waitFor(() => {
        expect(useRecapStore.getState().currentRecap?.periodKey).toBe("2026-01");
      });

      vi.mocked(recapApi.getRecap).mockResolvedValueOnce(recap2);
      useRecapStore.getState().selectPeriod("2026-02");
      await vi.waitFor(() => {
        expect(useRecapStore.getState().currentRecap?.periodKey).toBe("2026-02");
      });

      expect(useRecapStore.getState().selectedPeriodKey).toBe("2026-02");
      expect(useRecapStore.getState().currentRecap?.totalMinutes).toBe(1200);
    });
  });
});
