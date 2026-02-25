import { create } from "zustand";
import type {
  ViewMode,
  SortBy,
  SortOrder,
  LibraryFilters,
  CardDisplayOptions,
  GridSize,
  ListDensity,
} from "../types";
import type { GameSource } from "../types/game";
import { DEFAULT_CARD_DISPLAY } from "../types";

type ArtPickerType = "grid" | "hero" | "logo";

interface UIState {
  viewMode: ViewMode;
  sortBy: SortBy;
  sortOrder: SortOrder;
  filters: LibraryFilters;
  selectedGameId: string | null;
  cardDisplay: CardDisplayOptions;
  artPickerGameId: string | null;
  artPickerType: ArtPickerType | null;
  artVersion: Record<string, number>;
  customGameDialogOpen: boolean;
  editingCustomGameId: string | null;
  setViewMode: (mode: ViewMode) => void;
  setSorting: (sortBy: SortBy, order?: SortOrder) => void;
  setSearchQuery: (query: string) => void;
  setShowInstalledOnly: (show: boolean) => void;
  setShowFavoritesOnly: (show: boolean) => void;
  setFilterByTagIds: (tagIds: number[]) => void;
  setShowHiddenOnly: (show: boolean) => void;
  setFilterByGenreIds: (genreIds: string[]) => void;
  setFilterBySteamTagNames: (names: string[]) => void;
  setFilterByCategoryIds: (ids: number[]) => void;
  setFilterBySource: (sources: GameSource[]) => void;
  setFilterByRated: (filterByRated: "all" | "rated" | "unrated") => void;
  setFilterByMinRating: (filterByMinRating: number) => void;
  selectGame: (id: string | null) => void;
  setCardDisplay: (options: CardDisplayOptions) => void;
  setGridSize: (size: GridSize) => void;
  setListDensity: (density: ListDensity) => void;
  setListColumnVisibility: (columnId: string, visible: boolean) => void;
  openArtPicker: (gameId: string, type: ArtPickerType) => void;
  closeArtPicker: () => void;
  bumpArtVersion: (gameId: string) => void;
  openCustomGameDialog: () => void;
  openEditCustomGame: (gameId: string) => void;
  closeCustomGameDialog: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: "grid",
  sortBy: "name",
  sortOrder: "asc",
  filters: {
    searchQuery: "",
    showInstalledOnly: false,
    showFavoritesOnly: false,
    filterByTagIds: [],
    showHiddenOnly: false,
    filterByGenreIds: [],
    filterBySteamTagNames: [],
    filterByCategoryIds: [],
    filterBySource: [],
    filterByRated: "all",
    filterByMinRating: 0,
  },
  selectedGameId: null,
  cardDisplay: { ...DEFAULT_CARD_DISPLAY },
  artPickerGameId: null,
  artPickerType: null,
  artVersion: {},
  customGameDialogOpen: false,
  editingCustomGameId: null,

  setViewMode: (viewMode) => set({ viewMode }),

  setSorting: (sortBy, order) =>
    set((state) => ({
      sortBy,
      sortOrder:
        order ?? (state.sortBy === sortBy && state.sortOrder === "asc" ? "desc" : "asc"),
    })),

  setSearchQuery: (searchQuery) =>
    set((state) => ({
      filters: { ...state.filters, searchQuery },
    })),

  setShowInstalledOnly: (showInstalledOnly) =>
    set((state) => ({
      filters: { ...state.filters, showInstalledOnly },
    })),

  setShowFavoritesOnly: (showFavoritesOnly) =>
    set((state) => ({
      filters: { ...state.filters, showFavoritesOnly },
    })),

  setFilterByTagIds: (filterByTagIds) =>
    set((state) => ({
      filters: { ...state.filters, filterByTagIds },
    })),

  setShowHiddenOnly: (showHiddenOnly) =>
    set((state) => ({
      filters: { ...state.filters, showHiddenOnly },
    })),

  setFilterByGenreIds: (filterByGenreIds) =>
    set((state) => ({
      filters: { ...state.filters, filterByGenreIds },
    })),

  setFilterBySteamTagNames: (filterBySteamTagNames) =>
    set((state) => ({
      filters: { ...state.filters, filterBySteamTagNames },
    })),

  setFilterByCategoryIds: (filterByCategoryIds) =>
    set((state) => ({
      filters: { ...state.filters, filterByCategoryIds },
    })),

  setFilterBySource: (filterBySource) =>
    set((state) => ({
      filters: { ...state.filters, filterBySource },
    })),

  setFilterByRated: (filterByRated) =>
    set((state) => ({
      filters: { ...state.filters, filterByRated },
    })),

  setFilterByMinRating: (filterByMinRating) =>
    set((state) => ({
      filters: { ...state.filters, filterByMinRating },
    })),

  selectGame: (selectedGameId) => set({ selectedGameId }),

  setCardDisplay: (cardDisplay) => set({ cardDisplay }),

  setGridSize: (gridSize) =>
    set((state) => ({
      cardDisplay: { ...state.cardDisplay, gridSize },
    })),

  setListDensity: (listDensity) =>
    set((state) => ({
      cardDisplay: { ...state.cardDisplay, listDensity },
    })),

  setListColumnVisibility: (columnId, visible) =>
    set((state) => ({
      cardDisplay: {
        ...state.cardDisplay,
        listColumns: state.cardDisplay.listColumns.map((col) =>
          col.id === columnId ? { ...col, visible } : col,
        ),
      },
    })),

  openArtPicker: (gameId, type) => set({ artPickerGameId: gameId, artPickerType: type }),

  closeArtPicker: () => set({ artPickerGameId: null, artPickerType: null }),

  bumpArtVersion: (gameId) =>
    set((state) => ({
      artVersion: {
        ...state.artVersion,
        [gameId]: (state.artVersion[gameId] ?? 0) + 1,
      },
    })),

  openCustomGameDialog: () =>
    set({ customGameDialogOpen: true, editingCustomGameId: null }),
  openEditCustomGame: (gameId) =>
    set({ customGameDialogOpen: true, editingCustomGameId: gameId }),
  closeCustomGameDialog: () =>
    set({ customGameDialogOpen: false, editingCustomGameId: null }),
}));
