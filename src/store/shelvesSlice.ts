import { create } from "zustand";
import type { ShelfConfig, ShelfDisplayMode } from "../types/shelf";
import { DEFAULT_SHELVES } from "../types/shelf";
import { logger } from "../utils/logger";

interface ShelvesState {
  shelves: ShelfConfig[];
  editingShelfId: string | null;

  initShelves: (fromSettings: ShelfConfig[] | undefined) => void;
  addShelf: (shelf: ShelfConfig) => void;
  updateShelf: (id: string, updates: Partial<ShelfConfig>) => void;
  removeShelf: (id: string) => void;
  reorderShelves: (fromIndex: number, toIndex: number) => void;
  setDisplayMode: (id: string, mode: ShelfDisplayMode) => void;
  toggleGroupByGenre: (id: string) => void;
  setEditingShelf: (id: string | null) => void;
}

export const useShelvesStore = create<ShelvesState>((set, get) => ({
  shelves: [],
  editingShelfId: null,

  initShelves: (fromSettings) => {
    const raw =
      fromSettings && fromSettings.length > 0 ? fromSettings : [...DEFAULT_SHELVES];
    // Backfill maxVisibleGames for shelves saved before this field existed
    const shelves = raw.map((s) => ({
      ...s,
      maxVisibleGames: s.maxVisibleGames !== undefined ? s.maxVisibleGames : null,
    }));
    logger.info("ShelvesStore", "shelf", "Shelves initialized", {
      count: shelves.length,
      fromDefaults: !fromSettings || fromSettings.length === 0,
    });
    set({ shelves });
  },

  addShelf: (shelf) => {
    set({ shelves: [...get().shelves, shelf] });
    logger.info("ShelvesStore", "shelf", "Shelf added", {
      id: shelf.id,
      name: shelf.name,
      preset: shelf.preset,
    });
  },

  updateShelf: (id, updates) => {
    set({
      shelves: get().shelves.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    });
    logger.info("ShelvesStore", "shelf", "Shelf updated", {
      id,
      updates: Object.keys(updates),
    });
  },

  removeShelf: (id) => {
    const prev = get().shelves;
    if (prev.length <= 1) return;
    set({ shelves: prev.filter((s) => s.id !== id) });
    logger.info("ShelvesStore", "shelf", "Shelf removed", { id });
  },

  reorderShelves: (fromIndex, toIndex) => {
    const shelves = [...get().shelves];
    if (fromIndex < 0 || fromIndex >= shelves.length) return;
    if (toIndex < 0 || toIndex >= shelves.length) return;
    const [moved] = shelves.splice(fromIndex, 1);
    shelves.splice(toIndex, 0, moved);
    set({ shelves });
    logger.info("ShelvesStore", "shelf", "Shelves reordered", { fromIndex, toIndex });
  },

  setDisplayMode: (id, mode) => {
    set({
      shelves: get().shelves.map((s) => (s.id === id ? { ...s, displayMode: mode } : s)),
    });
  },

  toggleGroupByGenre: (id) => {
    set({
      shelves: get().shelves.map((s) =>
        s.id === id ? { ...s, groupByGenre: !s.groupByGenre } : s,
      ),
    });
  },

  setEditingShelf: (id) => set({ editingShelfId: id }),
}));

/** Helper to get shelves array for persistence */
export function getShelvesForPersistence(): ShelfConfig[] {
  return useShelvesStore.getState().shelves;
}
