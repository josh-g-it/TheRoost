import { create } from "zustand";
import type { StoreMetadata } from "../types";
import { metadataApi } from "../services/tauri";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

interface MetadataState {
  cache: Map<string, StoreMetadata>;
  loading: Set<string>;
  fetchMetadata: (gameId: string) => Promise<StoreMetadata | null>;
  fetchBatch: (gameIds: string[]) => Promise<void>;
  refreshAllMetadata: (gameIds: string[]) => Promise<void>;
  getMetadata: (gameId: string) => StoreMetadata | undefined;
}

export const useMetadataStore = create<MetadataState>((set, get) => ({
  cache: new Map(),
  loading: new Set(),

  fetchMetadata: async (gameId: string) => {
    const { cache, loading } = get();

    // Return cached if fully enriched (has description from Store API)
    const cached = cache.get(gameId);
    if (cached && cached.shortDescription != null) return cached;

    // Skip if already loading
    if (loading.has(gameId)) return cached ?? null;

    set({ loading: new Set([...loading, gameId]) });

    try {
      // This triggers on-demand Store API enrichment on the backend
      // if the game only has SteamSpy data cached
      const meta = await metadataApi.fetchGameMetadata(gameId);
      if (meta) {
        const newCache = new Map(get().cache);
        newCache.set(gameId, meta);
        set({ cache: newCache });
      }
      return meta;
    } catch (e) {
      logger.error("metadataSlice", "metadata", "Metadata fetch failed", {
        gameId,
        error: getErrorMessage(e),
      });
      // Fall back to SteamSpy-only data if available
      return cached ?? null;
    } finally {
      const updated = new Set(get().loading);
      updated.delete(gameId);
      set({ loading: updated });
    }
  },

  fetchBatch: async (gameIds: string[]) => {
    const { cache } = get();
    const uncached = gameIds.filter((id) => !cache.has(id));

    if (uncached.length === 0) return;

    try {
      const results = await metadataApi.fetchLibraryMetadata(uncached);
      const newCache = new Map(get().cache);
      let fetched = 0;

      for (const [gameId, meta] of results) {
        if (meta) {
          newCache.set(gameId, meta);
          fetched++;
        }
      }

      set({ cache: newCache });
      logger.info("metadataSlice", "metadata", "Batch complete", {
        fetched,
        total: uncached.length,
      });
    } catch (e) {
      logger.error("metadataSlice", "metadata", "Batch fetch failed", {
        error: getErrorMessage(e),
      });
    }
  },

  refreshAllMetadata: async (gameIds: string[]) => {
    logger.info(
      "metadataSlice",
      "metadata",
      "Refreshing metadata (backfilling SteamSpy tags)",
      {
        count: gameIds.length,
      },
    );

    try {
      const updated = await metadataApi.backfillSteamTags();
      logger.info("metadataSlice", "metadata", "SteamSpy tag backfill complete", {
        updated,
      });

      set({ cache: new Map() });

      if (gameIds.length > 0) {
        const results = await metadataApi.fetchLibraryMetadata(gameIds);
        const newCache = new Map<string, StoreMetadata>();
        let fetched = 0;

        for (const [gameId, meta] of results) {
          if (meta) {
            newCache.set(gameId, meta);
            fetched++;
          }
        }

        set({ cache: newCache });
        logger.info("metadataSlice", "metadata", "Metadata cache reloaded", {
          fetched,
          total: gameIds.length,
        });
      }
    } catch (e) {
      logger.error("metadataSlice", "metadata", "Metadata refresh failed", {
        error: getErrorMessage(e),
      });
    }
  },

  getMetadata: (gameId: string) => {
    return get().cache.get(gameId);
  },
}));
