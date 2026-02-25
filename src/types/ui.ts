import type { AppSettings } from "./settings";
import type { Game, GameSource } from "./game";
import type { IconName } from "../utils/icons";

export type ViewMode = "grid" | "list";
export type SortBy =
  | "name"
  | "playtime"
  | "lastPlayed"
  | "recentlyAdded"
  | "size"
  | "metacritic"
  | "source"
  | "personalRating";
export type SortOrder = "asc" | "desc";

// ── Grid Sizing ─────────────────────────────────────────────────
export type GridSize = "small" | "medium" | "large";

export const GRID_SIZE_CONFIG: Record<GridSize, { minWidth: number; label: string }> = {
  small: { minWidth: 200, label: "Small" },
  medium: { minWidth: 280, label: "Medium" },
  large: { minWidth: 380, label: "Large" },
};

// ── List View ───────────────────────────────────────────────────
export type ListDensity = "compact" | "default" | "comfortable";

export type ListColumnId =
  | "favorite"
  | "image"
  | "name"
  | "genres"
  | "tags"
  | "playtime"
  | "lastPlayed"
  | "size"
  | "metacritic"
  | "personalRating";

export interface ListColumnConfig {
  id: ListColumnId;
  label: string;
  visible: boolean;
  width: number;
  sortable: boolean;
}

export const DEFAULT_LIST_COLUMNS: ListColumnConfig[] = [
  { id: "favorite", label: "", visible: true, width: 40, sortable: false },
  { id: "image", label: "", visible: true, width: 64, sortable: false },
  { id: "name", label: "Name", visible: true, width: 0, sortable: true },
  { id: "genres", label: "Genres", visible: false, width: 180, sortable: false },
  { id: "tags", label: "Tags", visible: false, width: 160, sortable: false },
  { id: "playtime", label: "Playtime", visible: true, width: 100, sortable: true },
  { id: "lastPlayed", label: "Last Played", visible: true, width: 120, sortable: true },
  { id: "size", label: "Size", visible: true, width: 80, sortable: true },
  { id: "metacritic", label: "Metacritic", visible: false, width: 90, sortable: true },
  {
    id: "personalRating",
    label: "My Rating",
    visible: false,
    width: 100,
    sortable: true,
  },
];

// ── Filters ─────────────────────────────────────────────────────
export interface LibraryFilters {
  searchQuery: string;
  showInstalledOnly: boolean;
  showFavoritesOnly: boolean;
  filterByTagIds: number[];
  showHiddenOnly: boolean;
  filterByGenreIds: string[];
  filterBySteamTagNames: string[];
  filterByCategoryIds: number[];
  filterBySource: GameSource[];
  filterByRated: "all" | "rated" | "unrated";
  filterByMinRating: number;
}

// ── Saved Filters ───────────────────────────────────────────────
export interface SavedFilter {
  id: number;
  name: string;
  filters: LibraryFilters;
  sortBy?: SortBy;
  sortOrder?: SortOrder;
}

// ── Card Display ────────────────────────────────────────────────
export interface CardDisplayOptions {
  showGenreTags: boolean;
  showPlaytime: boolean;
  showInstalledBadge: boolean;
  showTags: boolean;
  showRatingBadge: boolean;
  gridSize: GridSize;
  listDensity: ListDensity;
  listColumns: ListColumnConfig[];
}

export const DEFAULT_CARD_DISPLAY: CardDisplayOptions = {
  showGenreTags: true,
  showPlaytime: true,
  showInstalledBadge: true,
  showTags: true,
  showRatingBadge: false,
  gridSize: "medium",
  listDensity: "default",
  listColumns: DEFAULT_LIST_COLUMNS,
};

// ── Profile Chart Options ───────────────────────────────────────
export type PlaytimeBucketConfig = "simple" | "default" | "detailed";

export interface ProfileChartFilters {
  filterByTagIds: number[];
  filterBySource: string[];
  filterByGenreIds: string[];
  filterBySteamTagNames: string[];
  filterByCategoryIds: number[];
}

export const EMPTY_PROFILE_CHART_FILTERS: ProfileChartFilters = {
  filterByTagIds: [],
  filterBySource: [],
  filterByGenreIds: [],
  filterBySteamTagNames: [],
  filterByCategoryIds: [],
};

export type ProfileChartId =
  | "genreRadar"
  | "playtimeDistribution"
  | "metacriticScatter"
  | "devPubLeaderboard";

export interface ProfileChartOptions {
  genreRadarCount: number;
  playtimeBuckets: PlaytimeBucketConfig;
  leaderboardTopN: number;
  chartFilters?: Partial<Record<ProfileChartId, ProfileChartFilters>>;
}

export const DEFAULT_PROFILE_CHART_OPTIONS: ProfileChartOptions = {
  genreRadarCount: 8,
  playtimeBuckets: "default",
  leaderboardTopN: 10,
};

// ── Command Center Slots ────────────────────────────────────────
export type SlotActionId =
  | "nav:library"
  | "nav:activity"
  | "nav:profile"
  | "nav:notes"
  | "nav:settings"
  | "nav:debug"
  | "action:theme-picker"
  | "action:search"
  | "action:quick-stats"
  | "action:random-game"
  | "action:tag-filter"
  | "action:refresh-library"
  | "action:system-monitor"
  | "action:media-controls"
  | "action:audio-mixer";

export interface SlotAction {
  id: SlotActionId;
  label: string;
  icon: IconName;
  category: "navigation" | "quick-action";
}

export const SLOT_ACTIONS: SlotAction[] = [
  { id: "nav:library", label: "Library", icon: "library", category: "navigation" },
  { id: "nav:activity", label: "Activity", icon: "activity", category: "navigation" },
  { id: "nav:profile", label: "Profile", icon: "profile", category: "navigation" },
  { id: "nav:settings", label: "Settings", icon: "settings", category: "navigation" },
  { id: "nav:debug", label: "Debug", icon: "debug", category: "navigation" },
  {
    id: "action:theme-picker",
    label: "Theme",
    icon: "palette",
    category: "quick-action",
  },
  { id: "action:search", label: "Search", icon: "search", category: "quick-action" },
  { id: "action:quick-stats", label: "Stats", icon: "stats", category: "quick-action" },
  { id: "action:random-game", label: "Random", icon: "dice", category: "quick-action" },
  { id: "action:tag-filter", label: "Tags", icon: "tag", category: "quick-action" },
  {
    id: "action:refresh-library",
    label: "Refresh",
    icon: "refresh",
    category: "quick-action",
  },
  { id: "nav:notes", label: "Notes", icon: "notes", category: "navigation" },
  {
    id: "action:system-monitor",
    label: "System Monitor",
    icon: "stats",
    category: "quick-action",
  },
  {
    id: "action:media-controls",
    label: "Media Controls",
    icon: "music",
    category: "quick-action",
  },
  {
    id: "action:audio-mixer",
    label: "Audio Mixer",
    icon: "volume",
    category: "quick-action",
  },
];

export const DEFAULT_COMMAND_CENTER_SLOTS: SlotActionId[] = [
  "nav:library",
  "nav:activity",
  "nav:profile",
  "action:theme-picker",
  "action:random-game",
  "action:quick-stats",
];

// ── Rail Mode ───────────────────────────────────────────────────
export type RailMode = "collapsed" | "expanded" | "dynamic";

// ── Overlay Shortcut ────────────────────────────────────────────
export type CommandCenterShortcut =
  | "Ctrl+Space"
  | "Ctrl+K"
  | "Ctrl+J"
  | "Ctrl+Shift+Space";

export const SHORTCUT_OPTIONS: { id: CommandCenterShortcut; label: string }[] = [
  { id: "Ctrl+Space", label: "Ctrl + Space" },
  { id: "Ctrl+Shift+Space", label: "Ctrl + Shift + Space" },
  { id: "Ctrl+K", label: "Ctrl + K" },
  { id: "Ctrl+J", label: "Ctrl + J" },
];

// ── Command Palette ─────────────────────────────────────────────
export type PaletteActionCategory =
  | "navigation"
  | "action"
  | "theme"
  | "settings"
  | "game-action";

export interface PaletteAction {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  icon: IconName;
  category: PaletteActionCategory;
  execute: (ctx: PaletteContext) => void;
  /** If true, this action is prefix-triggered and accepts a game parameter */
  parameterized?: boolean;
  /** Display hint for parameterized actions, e.g. "favorite {game name}" */
  parameterHint?: string;
}

export interface PaletteContext {
  navigate: (path: string) => void;
  closeCommandCenter: () => void;
  settings: AppSettings;
  saveSettings: (s: AppSettings) => void;
  /** For parameterized actions: the resolved target game */
  targetGame?: Game;
}

export interface PaletteResults {
  actions: PaletteAction[];
  games: Game[];
}

/** Hint category shown in the command palette help dropdown */
export interface PaletteHint {
  label: string;
  description: string;
  icon: IconName;
  autofill: string;
}

/** Serializable manifest entry for AI / programmatic introspection */
export interface ActionManifestEntry {
  id: string;
  label: string;
  description: string;
  category: PaletteActionCategory;
  parameterized: boolean;
  parameterHint?: string;
}
