import { describe, it, expect, vi, beforeEach } from "vitest";
import { useMetadataStore } from "./metadataSlice";
import type { StoreMetadata } from "../types";
import { makeMeta } from "../test/factories";

const mockFetchGameMetadata = vi.fn();
const mockFetchLibraryMetadata = vi.fn();
const mockBackfillSteamTags = vi.fn();

vi.mock("../services/tauri", () => ({
  metadataApi: {
    fetchGameMetadata: (...args: unknown[]) => mockFetchGameMetadata(...args),
    fetchLibraryMetadata: (...args: unknown[]) => mockFetchLibraryMetadata(...args),
    backfillSteamTags: (...args: unknown[]) => mockBackfillSteamTags(...args),
  },
}));

describe("metadataSlice", () => {
  beforeEach(() => {
    useMetadataStore.setState({ cache: new Map(), loading: new Set() });
    vi.clearAllMocks();
  });

  // ── fetchMetadata ────────────────────────────────────────────

  describe("fetchMetadata", () => {
    it("fetches and caches metadata from API", async () => {
      const meta = makeMeta("g1", { metacriticScore: 85 });
      mockFetchGameMetadata.mockResolvedValue(meta);

      const result = await useMetadataStore.getState().fetchMetadata("g1");

      expect(mockFetchGameMetadata).toHaveBeenCalledWith("g1");
      expect(result).toBe(meta);
      expect(useMetadataStore.getState().cache.get("g1")).toBe(meta);
    });

    it("returns cached metadata if fully enriched (has shortDescription)", async () => {
      const meta = makeMeta("g1", { metacriticScore: 90 });
      // Simulate a fully enriched entry with shortDescription
      const enriched = { ...meta, shortDescription: "A great game" };
      const cache = new Map<string, StoreMetadata>();
      cache.set("g1", enriched);
      useMetadataStore.setState({ cache });

      const result = await useMetadataStore.getState().fetchMetadata("g1");

      expect(mockFetchGameMetadata).not.toHaveBeenCalled();
      expect(result).toBe(enriched);
    });

    it("re-fetches cached metadata missing shortDescription", async () => {
      const stale = makeMeta("g1");
      // shortDescription is null by default in makeMeta
      const cache = new Map<string, StoreMetadata>();
      cache.set("g1", stale);
      useMetadataStore.setState({ cache });

      const fresh = { ...stale, shortDescription: "Now enriched" };
      mockFetchGameMetadata.mockResolvedValue(fresh);

      const result = await useMetadataStore.getState().fetchMetadata("g1");
      expect(mockFetchGameMetadata).toHaveBeenCalledWith("g1");
      expect(result).toBe(fresh);
    });

    it("skips fetch if gameId is already loading (dedup guard)", async () => {
      useMetadataStore.setState({ loading: new Set(["g1"]) });
      mockFetchGameMetadata.mockResolvedValue(makeMeta("g1"));

      await useMetadataStore.getState().fetchMetadata("g1");

      expect(mockFetchGameMetadata).not.toHaveBeenCalled();
    });

    it("clears loading flag after fetch completes", async () => {
      mockFetchGameMetadata.mockResolvedValue(makeMeta("g1"));

      await useMetadataStore.getState().fetchMetadata("g1");

      expect(useMetadataStore.getState().loading.has("g1")).toBe(false);
    });

    it("clears loading flag even on error", async () => {
      mockFetchGameMetadata.mockRejectedValue(new Error("Network error"));

      const result = await useMetadataStore.getState().fetchMetadata("g1");

      expect(useMetadataStore.getState().loading.has("g1")).toBe(false);
      expect(result).toBeNull();
    });

    it("returns cached data on error if available", async () => {
      const stale = makeMeta("g1");
      const cache = new Map<string, StoreMetadata>();
      cache.set("g1", stale);
      useMetadataStore.setState({ cache });

      mockFetchGameMetadata.mockRejectedValue(new Error("fail"));

      const result = await useMetadataStore.getState().fetchMetadata("g1");
      expect(result).toBe(stale);
    });

    it("handles null response from API", async () => {
      mockFetchGameMetadata.mockResolvedValue(null);

      const result = await useMetadataStore.getState().fetchMetadata("g1");

      expect(result).toBeNull();
      expect(useMetadataStore.getState().cache.has("g1")).toBe(false);
    });
  });

  // ── fetchBatch ───────────────────────────────────────────────

  describe("fetchBatch", () => {
    it("fetches only uncached gameIds", async () => {
      const existing = makeMeta("g1");
      const cache = new Map<string, StoreMetadata>();
      cache.set("g1", existing);
      useMetadataStore.setState({ cache });

      const newMeta = makeMeta("g2", { metacriticScore: 75 });
      mockFetchLibraryMetadata.mockResolvedValue([["g2", newMeta]]);

      await useMetadataStore.getState().fetchBatch(["g1", "g2"]);

      // Only g2 should be requested
      expect(mockFetchLibraryMetadata).toHaveBeenCalledWith(["g2"]);
      // Both should be in cache
      expect(useMetadataStore.getState().cache.get("g1")).toBe(existing);
      expect(useMetadataStore.getState().cache.get("g2")).toBe(newMeta);
    });

    it("skips API call when all gameIds are cached", async () => {
      const cache = new Map<string, StoreMetadata>();
      cache.set("g1", makeMeta("g1"));
      cache.set("g2", makeMeta("g2"));
      useMetadataStore.setState({ cache });

      await useMetadataStore.getState().fetchBatch(["g1", "g2"]);

      expect(mockFetchLibraryMetadata).not.toHaveBeenCalled();
    });

    it("handles null entries in batch results", async () => {
      mockFetchLibraryMetadata.mockResolvedValue([
        ["g1", makeMeta("g1")],
        ["g2", null],
      ]);

      await useMetadataStore.getState().fetchBatch(["g1", "g2"]);

      expect(useMetadataStore.getState().cache.has("g1")).toBe(true);
      expect(useMetadataStore.getState().cache.has("g2")).toBe(false);
    });

    it("handles API error gracefully", async () => {
      mockFetchLibraryMetadata.mockRejectedValue(new Error("batch fail"));

      await useMetadataStore.getState().fetchBatch(["g1"]);

      // Should not throw, cache stays empty
      expect(useMetadataStore.getState().cache.size).toBe(0);
    });
  });

  // ── refreshAllMetadata ───────────────────────────────────────

  describe("refreshAllMetadata", () => {
    it("clears cache and reloads from API", async () => {
      const old = makeMeta("g1");
      const cache = new Map<string, StoreMetadata>();
      cache.set("g1", old);
      useMetadataStore.setState({ cache });

      mockBackfillSteamTags.mockResolvedValue(5);
      const fresh = makeMeta("g1", { metacriticScore: 95 });
      mockFetchLibraryMetadata.mockResolvedValue([["g1", fresh]]);

      await useMetadataStore.getState().refreshAllMetadata(["g1"]);

      expect(mockBackfillSteamTags).toHaveBeenCalled();
      expect(useMetadataStore.getState().cache.get("g1")).toBe(fresh);
    });

    it("handles empty gameIds by only running backfill", async () => {
      mockBackfillSteamTags.mockResolvedValue(0);

      await useMetadataStore.getState().refreshAllMetadata([]);

      expect(mockBackfillSteamTags).toHaveBeenCalled();
      expect(mockFetchLibraryMetadata).not.toHaveBeenCalled();
      expect(useMetadataStore.getState().cache.size).toBe(0);
    });

    it("handles backfill error gracefully", async () => {
      mockBackfillSteamTags.mockRejectedValue(new Error("backfill fail"));

      await useMetadataStore.getState().refreshAllMetadata(["g1"]);

      // Should not throw
      expect(mockFetchLibraryMetadata).not.toHaveBeenCalled();
    });
  });

  // ── getMetadata ──────────────────────────────────────────────

  describe("getMetadata", () => {
    it("returns cached metadata", () => {
      const meta = makeMeta("g1");
      const cache = new Map<string, StoreMetadata>();
      cache.set("g1", meta);
      useMetadataStore.setState({ cache });

      expect(useMetadataStore.getState().getMetadata("g1")).toBe(meta);
    });

    it("returns undefined for uncached gameId", () => {
      expect(useMetadataStore.getState().getMetadata("missing")).toBeUndefined();
    });
  });
});
