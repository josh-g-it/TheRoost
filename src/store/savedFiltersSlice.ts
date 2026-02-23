import { create } from "zustand";
import type { SavedFilter, LibraryFilters, SortBy, SortOrder } from "../types";
import { savedFiltersApi } from "../services/tauri";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

interface SavedFiltersState {
  savedFilters: SavedFilter[];
  isLoading: boolean;
  loadSavedFilters: () => Promise<void>;
  saveFilter: (
    name: string,
    filters: LibraryFilters,
    sortBy?: SortBy,
    sortOrder?: SortOrder,
  ) => Promise<void>;
  deleteFilter: (id: number) => Promise<void>;
}

export const useSavedFiltersStore = create<SavedFiltersState>((set, get) => ({
  savedFilters: [],
  isLoading: false,

  loadSavedFilters: async () => {
    set({ isLoading: true });
    try {
      const filters = await savedFiltersApi.getAll();
      logger.info("savedFiltersSlice", "filter", "Saved filters loaded", {
        count: filters.length,
      });
      set({ savedFilters: filters, isLoading: false });
    } catch (e) {
      logger.error("savedFiltersSlice", "filter", "Failed to load saved filters", {
        error: getErrorMessage(e),
      });
      set({ isLoading: false });
    }
  },

  saveFilter: async (name, filters, sortBy, sortOrder) => {
    try {
      const saved = await savedFiltersApi.save(name, filters, sortBy, sortOrder);
      logger.info("savedFiltersSlice", "filter", "Filter saved", {
        name,
        id: saved.id,
      });
      set({ savedFilters: [...get().savedFilters, saved] });
    } catch (e) {
      logger.error("savedFiltersSlice", "filter", "Failed to save filter", {
        error: getErrorMessage(e),
      });
      throw e;
    }
  },

  deleteFilter: async (id) => {
    const prev = get().savedFilters;
    // Optimistic removal
    set({ savedFilters: prev.filter((f) => f.id !== id) });
    try {
      await savedFiltersApi.delete(id);
      logger.info("savedFiltersSlice", "filter", "Filter deleted", { id });
    } catch (e) {
      // Revert
      set({ savedFilters: prev });
      logger.error("savedFiltersSlice", "filter", "Failed to delete filter", {
        error: getErrorMessage(e),
      });
    }
  },
}));
