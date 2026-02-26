import { THEMES } from "../hooks/useTheme";
import type { ThemeId } from "../hooks/useTheme";
import type {
  ActionManifestEntry,
  AppSettings,
  Game,
  PaletteAction,
  PaletteContext,
  PaletteHint,
  PaletteResults,
  StoreMetadata,
  SortBy,
} from "../types";
import type { FontFamilyId, IconSetId, UIScaleId } from "../types/theme";
import { FONT_OPTIONS, ICON_SET_OPTIONS, UI_SCALE_OPTIONS } from "../types/theme";
import { useUIStore } from "../store/uiSlice";
import { useLibraryStore } from "../store/librarySlice";
import { useMetadataStore } from "../store/metadataSlice";
import { useNotesStore } from "../store/notesSlice";
import { useFavoritesStore } from "../store/favoritesSlice";
import { externalApi } from "../services/tauri";
import {
  extractAllSteamTags,
  extractAllGenres,
  extractAllCategories,
  extractAllSources,
} from "./filtering";
import { GAME_SOURCE_LABELS } from "../types/game";
import type { GameSource } from "../types/game";

const MAX_ACTION_RESULTS = 12;
const MAX_GAME_RESULTS = 8;
const MAX_FILTER_RESULTS = 5;

// ── Palette Hints (help dropdown categories) ─────────────────────

export const PALETTE_HINTS: PaletteHint[] = [
  {
    label: "Navigate",
    description: "Jump to a page",
    icon: "library",
    autofill: "go to ",
  },
  {
    label: "Filter",
    description: "Filter by genre, tag, or launcher",
    icon: "filter",
    autofill: "filter ",
  },
  {
    label: "Sort",
    description: "Sort your library",
    icon: "sort-asc",
    autofill: "sort ",
  },
  {
    label: "Theme",
    description: "Change theme, font, icons, scale",
    icon: "palette",
    autofill: "theme ",
  },
  {
    label: "Favorite",
    description: "Toggle favorite on a game",
    icon: "star-filled",
    autofill: "favorite ",
  },
  {
    label: "Notes",
    description: "Open or create game notes",
    icon: "notes",
    autofill: "notes ",
  },
];

// ── Action Descriptors (data-only, serializable) ────────────────

interface ActionDescriptor {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  icon: string;
  category: string;
  devOnly?: boolean;
}

/** Static actions that are always available (or gated on devSettingsEnabled). */
const STATIC_DESCRIPTORS: ActionDescriptor[] = [
  // Navigation
  {
    id: "nav:library",
    label: "Go to Library",
    description: "Navigate to the game library view",
    keywords: ["games", "collection", "browse"],
    icon: "library",
    category: "navigation",
  },
  {
    id: "nav:activity",
    label: "Go to Activity",
    description: "Navigate to the activity dashboard with session tracking",
    keywords: ["sessions", "playtime", "streak", "heatmap"],
    icon: "activity",
    category: "navigation",
  },
  {
    id: "nav:profile",
    label: "Go to Profile",
    description: "Navigate to the player profile and statistics",
    keywords: ["stats", "charts", "player", "statistics"],
    icon: "profile",
    category: "navigation",
  },
  {
    id: "nav:notes",
    label: "Go to Notes",
    description: "Navigate to the notes compendium",
    keywords: ["notes", "notepad", "scratchpad", "journal"],
    icon: "notes",
    category: "navigation",
  },
  {
    id: "nav:news",
    label: "Go to News Feed",
    description: "Navigate to the game news feed",
    keywords: ["news", "feed", "articles", "updates"],
    icon: "news",
    category: "navigation",
  },
  {
    id: "nav:settings",
    label: "Go to Settings",
    description: "Navigate to the settings page",
    keywords: ["preferences", "config", "options"],
    icon: "settings",
    category: "navigation",
  },

  // Developer (gated)
  {
    id: "nav:debug",
    label: "Open Debug Panel",
    description: "Navigate to the debug panel with event logs",
    keywords: ["logs", "diagnostics", "developer", "console"],
    icon: "debug",
    category: "navigation",
    devOnly: true,
  },
  {
    id: "dev:onboarding",
    label: "Re-run Setup Wizard",
    description: "Reset the first-run flag to re-trigger the setup wizard",
    keywords: ["onboarding", "setup", "wizard", "first run", "developer"],
    icon: "settings",
    category: "action",
    devOnly: true,
  },
  {
    id: "dev:clear-data",
    label: "Clear All Data",
    description: "Navigate to settings to access the clear-all-data option",
    keywords: ["reset", "nuke", "delete", "wipe", "developer", "fresh"],
    icon: "settings",
    category: "action",
    devOnly: true,
  },

  // View controls
  {
    id: "view:grid",
    label: "Switch to Grid View",
    description: "Display the library as a grid of game cover cards",
    keywords: ["cards", "thumbnails", "gallery"],
    icon: "grid-view",
    category: "action",
  },
  {
    id: "view:list",
    label: "Switch to List View",
    description: "Display the library as a compact list of games",
    keywords: ["table", "rows", "compact"],
    icon: "list-view",
    category: "action",
  },

  // Quick filters
  {
    id: "filter:installed",
    label: "Show Installed Games Only",
    description: "Toggle the installed-only filter on the library",
    keywords: ["filter", "downloaded", "local"],
    icon: "installed",
    category: "action",
  },
  {
    id: "filter:favorites",
    label: "Show Favorites Only",
    description: "Toggle the favorites-only filter on the library",
    keywords: ["filter", "starred", "liked"],
    icon: "star-filled",
    category: "action",
  },
  {
    id: "action:hidden-games",
    label: "Toggle Hidden Games",
    description: "Show or hide games marked as hidden in the library",
    keywords: ["show", "hide", "filter", "invisible"],
    icon: "eye",
    category: "action",
  },
  {
    id: "filter:rated",
    label: "Show Rated Games Only",
    description: "Show only games you have rated",
    keywords: ["filter", "rated", "stars", "reviewed"],
    icon: "star-filled",
    category: "action",
  },
  {
    id: "filter:unrated",
    label: "Show Unrated Games",
    description: "Show only games you have not rated yet",
    keywords: ["filter", "unrated", "no rating", "not rated"],
    icon: "star-outline",
    category: "action",
  },

  // Quick actions
  {
    id: "action:refresh",
    label: "Refresh Library",
    description: "Re-fetch the Steam library and merge with external games",
    keywords: ["reload", "rescan", "update"],
    icon: "refresh",
    category: "action",
  },
  {
    id: "action:refresh-metadata",
    label: "Refresh Metadata",
    description: "Re-fetch SteamSpy tags and metadata for all games",
    keywords: ["refetch", "tags", "steamspy", "metadata", "update", "cache"],
    icon: "refresh",
    category: "action",
  },
  {
    id: "action:scan-external",
    label: "Scan External Games",
    description: "Scan Epic, GOG, EA, Ubisoft, and Battle.net for games",
    keywords: [
      "scan",
      "external",
      "epic",
      "gog",
      "ea",
      "ubisoft",
      "battlenet",
      "import",
      "launcher",
    ],
    icon: "refresh",
    category: "action",
  },
  {
    id: "action:reset-filters",
    label: "Reset All Filters",
    description: "Clear all library filters, search, and show all games",
    keywords: ["reset", "clear", "filter", "filters", "all", "remove"],
    icon: "close",
    category: "action",
  },
  {
    id: "action:add-custom-game",
    label: "Add Custom Game",
    description: "Open the dialog to add a custom/manual game to the library",
    keywords: ["custom", "manual", "add", "game", "executable", "import"],
    icon: "plus",
    category: "action",
  },

  // Settings shortcuts
  {
    id: "action:sidebar-mode",
    label: "Change Sidebar Mode",
    description: "Navigate to settings to change the sidebar/rail mode",
    keywords: ["rail", "collapse", "expand", "pin", "navigation"],
    icon: "sidebar",
    category: "settings",
  },
  {
    id: "settings:api-key",
    label: "Change Steam API Key",
    description: "Navigate to settings to update your Steam API key",
    keywords: ["steam", "connection", "key", "credential"],
    icon: "key",
    category: "settings",
  },
  {
    id: "settings:shortcut",
    label: "Change Command Center Shortcut",
    description: "Navigate to settings to change the command center keyboard shortcut",
    keywords: ["keyboard", "hotkey", "keybind", "spacebar"],
    icon: "keyboard",
    category: "settings",
  },
  {
    id: "settings:tags",
    label: "Open Tag Manager",
    description: "Navigate to settings to manage custom tags",
    keywords: ["tags", "labels", "organize", "custom"],
    icon: "tag",
    category: "settings",
  },
  {
    id: "settings:tray",
    label: "Toggle Minimize to Tray",
    description: "Enable or disable minimizing the app to the system tray on close",
    keywords: ["tray", "system tray", "minimize", "close", "background"],
    icon: "settings",
    category: "settings",
  },
  {
    id: "action:toggle-dev-mode",
    label: "Toggle Developer Mode",
    description: "Enable or disable developer settings and the debug panel",
    keywords: ["developer", "dev", "debug", "toggle", "mode"],
    icon: "debug",
    category: "settings",
  },
];

/** Build theme/font/icon/scale descriptors from their option arrays. */
function buildOptionDescriptors(): ActionDescriptor[] {
  const descriptors: ActionDescriptor[] = [];

  for (const theme of THEMES) {
    descriptors.push({
      id: `theme:${theme.id}`,
      label: `Switch to ${theme.name}`,
      description: `Change the application theme to ${theme.name}`,
      keywords: ["theme", "appearance", theme.description.toLowerCase()],
      icon: "palette",
      category: "theme",
    });
  }

  for (const font of FONT_OPTIONS) {
    descriptors.push({
      id: `font:${font.id}`,
      label: `Font - ${font.name}`,
      description: `Change the application font to ${font.name}`,
      keywords: ["font", "typeface", "typography", font.name.toLowerCase()],
      icon: "palette",
      category: "theme",
    });
  }

  for (const iconSet of ICON_SET_OPTIONS) {
    descriptors.push({
      id: `icons:${iconSet.id}`,
      label: `Icons - ${iconSet.name}`,
      description: `Switch to the ${iconSet.name} icon set (${iconSet.description.toLowerCase()})`,
      keywords: ["icons", "icon set", iconSet.description.toLowerCase()],
      icon: "palette",
      category: "theme",
    });
  }

  for (const scale of UI_SCALE_OPTIONS) {
    descriptors.push({
      id: `scale:${scale.id}`,
      label: `UI Scale - ${scale.name}`,
      description: `Set the UI density to ${scale.name.toLowerCase()}`,
      keywords: ["scale", "density", "size", "spacing", "zoom", scale.name.toLowerCase()],
      icon: "palette",
      category: "theme",
    });
  }

  return descriptors;
}

/** Sort option descriptors. */
const SORT_DESCRIPTORS: (ActionDescriptor & { sortBy: string })[] = [
  {
    id: "sort:name",
    label: "Sort by Name",
    description: "Sort the library alphabetically by game name",
    keywords: ["sort", "order", "alphabetical", "a-z"],
    icon: "sort-asc",
    category: "action",
    sortBy: "name",
  },
  {
    id: "sort:playtime",
    label: "Sort by Playtime",
    description: "Sort the library by total playtime (most played first)",
    keywords: ["sort", "order", "hours", "most played"],
    icon: "sort-asc",
    category: "action",
    sortBy: "playtime",
  },
  {
    id: "sort:lastPlayed",
    label: "Sort by Last Played",
    description: "Sort the library by most recently played",
    keywords: ["sort", "order", "recent", "latest"],
    icon: "sort-asc",
    category: "action",
    sortBy: "lastPlayed",
  },
  {
    id: "sort:recentlyAdded",
    label: "Sort by Recently Added",
    description: "Sort the library by when games were added",
    keywords: ["sort", "order", "new", "newest"],
    icon: "sort-asc",
    category: "action",
    sortBy: "recentlyAdded",
  },
  {
    id: "sort:size",
    label: "Sort by Size",
    description: "Sort the library by disk size",
    keywords: ["sort", "order", "disk", "storage", "space"],
    icon: "sort-asc",
    category: "action",
    sortBy: "size",
  },
  {
    id: "sort:metacritic",
    label: "Sort by Metacritic",
    description: "Sort the library by Metacritic score",
    keywords: ["sort", "order", "metacritic", "critic"],
    icon: "sort-asc",
    category: "action",
    sortBy: "metacritic",
  },
  {
    id: "sort:personalRating",
    label: "Sort by My Rating",
    description: "Sort the library by your personal star rating",
    keywords: ["sort", "order", "rating", "stars", "my rating"],
    icon: "star-filled",
    category: "action",
    sortBy: "personalRating",
  },
  {
    id: "sort:source",
    label: "Sort by Launcher",
    description: "Group the library by game launcher/platform",
    keywords: ["sort", "order", "launcher", "platform", "group"],
    icon: "sort-asc",
    category: "action",
    sortBy: "source",
  },
];

/** Source/launcher filter descriptors. */
const ALL_GAME_SOURCES: GameSource[] = [
  "steam",
  "epic",
  "gog",
  "ea_app",
  "ubisoft",
  "battlenet",
  "manual",
];

function buildSourceFilterDescriptors(): ActionDescriptor[] {
  return ALL_GAME_SOURCES.map((source) => ({
    id: `filter:source:${source}`,
    label: `Filter: ${GAME_SOURCE_LABELS[source]} only`,
    description: `Show only ${GAME_SOURCE_LABELS[source]} games in the library`,
    keywords: ["filter", "launcher", "source", GAME_SOURCE_LABELS[source].toLowerCase()],
    icon: "filter",
    category: "action",
  }));
}

// ── Parameterized Game Action Descriptors ────────────────────────

interface GameActionDescriptor {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  icon: string;
  category: "game-action";
  parameterized: true;
  parameterHint: string;
  prefixes: string[];
}

const GAME_ACTION_DESCRIPTORS: GameActionDescriptor[] = [
  {
    id: "game:favorite",
    label: "Toggle Favorite",
    description: "Toggle a game's favorite status",
    keywords: ["favorite", "star", "like", "unfavorite"],
    icon: "star-filled",
    category: "game-action",
    parameterized: true,
    parameterHint: "favorite {game name}",
    prefixes: ["favorite", "fav", "unfavorite", "unfav"],
  },
  {
    id: "game:notes",
    label: "Open Game Notes",
    description:
      "Navigate to the Notes view and focus on a specific game's note, creating it if needed",
    keywords: ["notes", "note", "write", "journal"],
    icon: "notes",
    category: "game-action",
    parameterized: true,
    parameterHint: "notes {game name}",
    prefixes: ["notes", "note"],
  },
];

/** Build a lookup from prefix keyword → game action descriptor. */
const PREFIX_MAP: Record<string, GameActionDescriptor> = {};
for (const desc of GAME_ACTION_DESCRIPTORS) {
  for (const prefix of desc.prefixes) {
    PREFIX_MAP[prefix] = desc;
  }
}

// ── Executor Registry ───────────────────────────────────────────

type ActionExecutor = (ctx: PaletteContext) => void;

/** Direct executor lookup for static action IDs. */
const EXECUTORS: Record<string, ActionExecutor> = {
  // Navigation
  "nav:library": (ctx) => {
    ctx.navigate("/library");
    ctx.closeCommandCenter();
  },
  "nav:activity": (ctx) => {
    ctx.navigate("/activity");
    ctx.closeCommandCenter();
  },
  "nav:profile": (ctx) => {
    ctx.navigate("/profile");
    ctx.closeCommandCenter();
  },
  "nav:notes": (ctx) => {
    ctx.navigate("/notes");
    ctx.closeCommandCenter();
  },
  "nav:news": (ctx) => {
    ctx.navigate("/news");
    ctx.closeCommandCenter();
  },
  "nav:settings": (ctx) => {
    ctx.navigate("/settings");
    ctx.closeCommandCenter();
  },
  "nav:debug": (ctx) => {
    ctx.navigate("/debug");
    ctx.closeCommandCenter();
  },

  // Developer
  "dev:onboarding": (ctx) => {
    ctx.saveSettings({ ...ctx.settings, isFirstRun: true });
    ctx.closeCommandCenter();
  },
  "dev:clear-data": (ctx) => {
    ctx.navigate("/settings");
    ctx.closeCommandCenter();
  },

  // View controls
  "view:grid": (ctx) => {
    useUIStore.getState().setViewMode("grid");
    ctx.navigate("/library");
    ctx.closeCommandCenter();
  },
  "view:list": (ctx) => {
    useUIStore.getState().setViewMode("list");
    ctx.navigate("/library");
    ctx.closeCommandCenter();
  },

  // Quick filters
  "filter:installed": (ctx) => {
    const ui = useUIStore.getState();
    ui.setShowInstalledOnly(!ui.filters.showInstalledOnly);
    ui.setViewMode("list");
    ctx.navigate("/library");
    ctx.closeCommandCenter();
  },
  "filter:favorites": (ctx) => {
    const ui = useUIStore.getState();
    ui.setShowFavoritesOnly(!ui.filters.showFavoritesOnly);
    ui.setViewMode("list");
    ctx.navigate("/library");
    ctx.closeCommandCenter();
  },
  "action:hidden-games": (ctx) => {
    const ui = useUIStore.getState();
    ui.setShowHiddenOnly(!ui.filters.showHiddenOnly);
    ui.setViewMode("list");
    ctx.navigate("/library");
    ctx.closeCommandCenter();
  },
  "filter:rated": (ctx) => {
    const ui = useUIStore.getState();
    ui.setFilterByRated(ui.filters.filterByRated === "rated" ? "all" : "rated");
    ui.setViewMode("list");
    ctx.navigate("/library");
    ctx.closeCommandCenter();
  },
  "filter:unrated": (ctx) => {
    const ui = useUIStore.getState();
    ui.setFilterByRated(ui.filters.filterByRated === "unrated" ? "all" : "unrated");
    ui.setViewMode("list");
    ctx.navigate("/library");
    ctx.closeCommandCenter();
  },

  // Quick actions
  "action:refresh": (ctx) => {
    if (ctx.settings?.steamApiKey && ctx.settings?.steamId) {
      useLibraryStore
        .getState()
        .refreshLibrary(ctx.settings.steamApiKey, ctx.settings.steamId);
    }
    ctx.closeCommandCenter();
  },
  "action:refresh-metadata": (ctx) => {
    const games = useLibraryStore.getState().library?.games ?? [];
    const gameIds = games.map((g) => g.gameId);
    useMetadataStore.getState().refreshAllMetadata(gameIds);
    ctx.closeCommandCenter();
  },
  "action:scan-external": (ctx) => {
    externalApi.scanExternalGames();
    ctx.closeCommandCenter();
  },
  "action:reset-filters": (ctx) => {
    const ui = useUIStore.getState();
    ui.setSearchQuery("");
    ui.setShowInstalledOnly(false);
    ui.setShowFavoritesOnly(false);
    ui.setFilterByTagIds([]);
    ui.setShowHiddenOnly(false);
    ui.setFilterByGenreIds([]);
    ui.setFilterBySteamTagNames([]);
    ui.setFilterByCategoryIds([]);
    ui.setFilterBySource([]);
    ui.setFilterByRated("all");
    ui.setFilterByMinRating(0);
    ctx.navigate("/library");
    ctx.closeCommandCenter();
  },
  "action:add-custom-game": (ctx) => {
    ctx.navigate("/library");
    useUIStore.getState().openCustomGameDialog();
    ctx.closeCommandCenter();
  },

  // Settings shortcuts
  "action:sidebar-mode": (ctx) => {
    ctx.navigate("/settings");
    ctx.closeCommandCenter();
  },
  "settings:api-key": (ctx) => {
    ctx.navigate("/settings");
    ctx.closeCommandCenter();
  },
  "settings:shortcut": (ctx) => {
    ctx.navigate("/settings");
    ctx.closeCommandCenter();
  },
  "settings:tags": (ctx) => {
    ctx.navigate("/settings");
    ctx.closeCommandCenter();
  },
  "settings:tray": (ctx) => {
    const toggled = !ctx.settings.minimizeToTray;
    ctx.saveSettings({ ...ctx.settings, minimizeToTray: toggled });
    ctx.closeCommandCenter();
  },
  "action:toggle-dev-mode": (ctx) => {
    const toggled = !ctx.settings.devSettingsEnabled;
    ctx.saveSettings({ ...ctx.settings, devSettingsEnabled: toggled });
    ctx.closeCommandCenter();
  },

  // Parameterized game actions
  "game:favorite": (ctx) => {
    if (ctx.targetGame) {
      useFavoritesStore.getState().toggleFavorite(ctx.targetGame.gameId);
    }
    ctx.closeCommandCenter();
  },
  "game:notes": (ctx) => {
    if (!ctx.targetGame) {
      ctx.closeCommandCenter();
      return;
    }
    const game = ctx.targetGame;
    const notesState = useNotesStore.getState();
    const exists = notesState.notes.some((n) => n.gameId === game.gameId);
    if (!exists) {
      useNotesStore.setState((s) => ({
        notes: [
          ...s.notes,
          {
            gameId: game.gameId,
            gameName: game.name,
            content: "",
            updatedAt: Math.floor(Date.now() / 1000),
          },
        ],
      }));
    }
    notesState.setScrollTarget(game.gameId);
    ctx.navigate("/notes");
    ctx.closeCommandCenter();
  },
};

/**
 * Resolve an executor for any action ID, including prefix-pattern IDs
 * (theme:*, font:*, icons:*, scale:*, sort:*, filter:source:*).
 */
function resolveExecutor(actionId: string): ActionExecutor | null {
  if (EXECUTORS[actionId]) return EXECUTORS[actionId];

  // Theme prefix
  if (actionId.startsWith("theme:")) {
    const themeId = actionId.slice(6);
    return (ctx) => {
      document.documentElement.setAttribute("data-theme", themeId);
      ctx.saveSettings({ ...ctx.settings, theme: themeId as ThemeId });
      ctx.closeCommandCenter();
    };
  }

  // Font prefix
  if (actionId.startsWith("font:")) {
    const fontId = actionId.slice(5);
    return (ctx) => {
      ctx.saveSettings({ ...ctx.settings, fontFamily: fontId as FontFamilyId });
      ctx.closeCommandCenter();
    };
  }

  // Icon set prefix
  if (actionId.startsWith("icons:")) {
    const iconSetId = actionId.slice(6);
    return (ctx) => {
      ctx.saveSettings({ ...ctx.settings, iconSet: iconSetId as IconSetId });
      ctx.closeCommandCenter();
    };
  }

  // UI scale prefix
  if (actionId.startsWith("scale:")) {
    const scaleId = actionId.slice(6);
    return (ctx) => {
      if (scaleId === "comfortable") {
        document.documentElement.removeAttribute("data-ui-scale");
      } else {
        document.documentElement.setAttribute("data-ui-scale", scaleId);
      }
      ctx.saveSettings({ ...ctx.settings, uiScale: scaleId as UIScaleId });
      ctx.closeCommandCenter();
    };
  }

  // Sort prefix
  if (actionId.startsWith("sort:")) {
    const sortBy = actionId.slice(5);
    return (ctx) => {
      const ui = useUIStore.getState();
      ui.setSorting(sortBy as SortBy);
      ui.setViewMode("list");
      ctx.navigate("/library");
      ctx.closeCommandCenter();
    };
  }

  // Source filter prefix
  if (actionId.startsWith("filter:source:")) {
    const source = actionId.slice(14) as GameSource;
    return (ctx) => {
      const ui = useUIStore.getState();
      ui.setFilterBySource([source]);
      ui.setViewMode("list");
      ctx.navigate("/library");
      ctx.closeCommandCenter();
    };
  }

  // Dynamic metadata filter prefixes (genre-filter:*, tag-filter:*, category-filter:*, source-filter:*)
  if (actionId.startsWith("genre-filter:")) {
    const genreId = actionId.slice(13);
    return (ctx) => {
      const ui = useUIStore.getState();
      const current = ui.filters.filterByGenreIds;
      if (!current.includes(genreId)) {
        ui.setFilterByGenreIds([...current, genreId]);
      }
      ui.setViewMode("list");
      ctx.navigate("/library");
      ctx.closeCommandCenter();
    };
  }

  if (actionId.startsWith("tag-filter:")) {
    const tagName = actionId.slice(11);
    return (ctx) => {
      const ui = useUIStore.getState();
      const current = ui.filters.filterBySteamTagNames;
      if (!current.includes(tagName)) {
        ui.setFilterBySteamTagNames([...current, tagName]);
      }
      ui.setViewMode("list");
      ctx.navigate("/library");
      ctx.closeCommandCenter();
    };
  }

  if (actionId.startsWith("category-filter:")) {
    const catId = Number(actionId.slice(16));
    return (ctx) => {
      const ui = useUIStore.getState();
      const current = ui.filters.filterByCategoryIds;
      if (!current.includes(catId)) {
        ui.setFilterByCategoryIds([...current, catId]);
      }
      ui.setViewMode("list");
      ctx.navigate("/library");
      ctx.closeCommandCenter();
    };
  }

  if (actionId.startsWith("source-filter:")) {
    const source = actionId.slice(14) as GameSource;
    return (ctx) => {
      const ui = useUIStore.getState();
      const current = ui.filters.filterBySource ?? [];
      if (!current.includes(source)) {
        ui.setFilterBySource([...current, source]);
      }
      ui.setViewMode("list");
      ctx.navigate("/library");
      ctx.closeCommandCenter();
    };
  }

  return null;
}

// ── Build Runtime Registry ──────────────────────────────────────

/**
 * Build the full action registry for the command palette.
 * Called once per settings change (memoized in the command center component).
 */
export function buildActionRegistry(settings: AppSettings | null): PaletteAction[] {
  const allDescriptors: ActionDescriptor[] = [
    ...STATIC_DESCRIPTORS.filter((d) => !d.devOnly || settings?.devSettingsEnabled),
    ...buildOptionDescriptors(),
    ...SORT_DESCRIPTORS,
    ...buildSourceFilterDescriptors(),
  ];

  return allDescriptors.map((d) => {
    const executor = resolveExecutor(d.id);
    return {
      id: d.id,
      label: d.label,
      description: d.description,
      keywords: d.keywords,
      icon: d.icon,
      category: d.category,
      execute: executor ?? ((ctx) => ctx.closeCommandCenter()),
    } as PaletteAction;
  });
}

// ── Prefix-Triggered Game Actions ───────────────────────────────

/**
 * Check if a query matches a prefix-triggered game action pattern.
 * Returns exclusive results (only prefix matches) or null to fall through.
 */
function matchGameActionPrefix(query: string, games: Game[]): PaletteAction[] | null {
  const spaceIndex = query.indexOf(" ");
  if (spaceIndex === -1) return null;

  const prefix = query.slice(0, spaceIndex).toLowerCase();
  const rest = query.slice(spaceIndex + 1).trim();

  const descriptor = PREFIX_MAP[prefix];
  if (!descriptor || !rest) return null;

  const matchedGames = games
    .filter((g) => g.name.toLowerCase().includes(rest.toLowerCase()))
    .slice(0, MAX_GAME_RESULTS);

  if (matchedGames.length === 0) return null;

  return matchedGames.map((game) => {
    const baseExecutor = resolveExecutor(descriptor.id);
    return {
      id: `${descriptor.id}:${game.gameId}`,
      label: `${descriptor.label}: ${game.name}`,
      description: `${descriptor.description} — ${game.name}`,
      keywords: descriptor.keywords,
      icon: descriptor.icon,
      category: descriptor.category,
      parameterized: true,
      parameterHint: descriptor.parameterHint,
      execute: (ctx: PaletteContext) => {
        baseExecutor?.({ ...ctx, targetGame: game });
      },
    } as PaletteAction;
  });
}

// ── Dynamic Metadata Filter Actions ─────────────────────────────

function buildDynamicFilterActions(
  query: string,
  metadataCache: Map<string, StoreMetadata>,
  games: Game[],
): PaletteAction[] {
  const dynamicFilters: PaletteAction[] = [];

  // Genre filter suggestions
  const allGenres = extractAllGenres(metadataCache);
  for (const genre of allGenres) {
    if (genre.description.toLowerCase().includes(query)) {
      const executor = resolveExecutor(`genre-filter:${genre.id}`);
      dynamicFilters.push({
        id: `genre-filter:${genre.id}`,
        label: `Filter by genre: ${genre.description}`,
        description: `Show only ${genre.description} games in the library`,
        keywords: ["genre", "filter", genre.description.toLowerCase()],
        icon: "genre",
        category: "action",
        execute: executor ?? ((ctx) => ctx.closeCommandCenter()),
      } as PaletteAction);
    }
    if (dynamicFilters.length >= MAX_FILTER_RESULTS) break;
  }

  // Steam tag filter suggestions
  const allTags = extractAllSteamTags(metadataCache);
  const tagActions: PaletteAction[] = allTags
    .filter((t) => t.name.toLowerCase().includes(query))
    .slice(0, MAX_FILTER_RESULTS)
    .map((t) => {
      const executor = resolveExecutor(`tag-filter:${t.name}`);
      return {
        id: `tag-filter:${t.name}`,
        label: `Filter by tag: ${t.name}`,
        description: `Show only games tagged "${t.name}" in the library`,
        keywords: ["tag", "filter", t.name.toLowerCase()],
        icon: "tag",
        category: "action",
        execute: executor ?? ((ctx) => ctx.closeCommandCenter()),
      } as PaletteAction;
    });
  dynamicFilters.push(...tagActions);

  // Category/feature filter suggestions
  const allCategories = extractAllCategories(metadataCache);
  const catActions: PaletteAction[] = allCategories
    .filter((c) => c.description.toLowerCase().includes(query))
    .slice(0, MAX_FILTER_RESULTS)
    .map((c) => {
      const executor = resolveExecutor(`category-filter:${c.id}`);
      return {
        id: `category-filter:${c.id}`,
        label: `Filter by feature: ${c.description}`,
        description: `Show only games with "${c.description}" feature`,
        keywords: ["feature", "category", "filter", c.description.toLowerCase()],
        icon: "filter",
        category: "action",
        execute: executor ?? ((ctx) => ctx.closeCommandCenter()),
      } as PaletteAction;
    });
  dynamicFilters.push(...catActions);

  // Launcher/source filter suggestions (from library games, not metadata)
  const allSources = extractAllSources(games);
  const sourceActions: PaletteAction[] = allSources
    .filter(
      ({ source }) =>
        GAME_SOURCE_LABELS[source].toLowerCase().includes(query) ||
        source.toLowerCase().includes(query),
    )
    .slice(0, MAX_FILTER_RESULTS)
    .map(({ source }) => {
      const executor = resolveExecutor(`source-filter:${source}`);
      return {
        id: `source-filter:${source}`,
        label: `Filter by launcher: ${GAME_SOURCE_LABELS[source]}`,
        description: `Show only ${GAME_SOURCE_LABELS[source]} games in the library`,
        keywords: [
          "launcher",
          "source",
          "filter",
          GAME_SOURCE_LABELS[source].toLowerCase(),
        ],
        icon: "filter",
        category: "action",
        execute: executor ?? ((ctx) => ctx.closeCommandCenter()),
      } as PaletteAction;
    });
  dynamicFilters.push(...sourceActions);

  return dynamicFilters;
}

// ── Category Prefix Matching ─────────────────────────────────────

interface CategoryPrefixDef {
  /** Trigger words that activate this category (e.g., ["theme"]) */
  prefixes: string[];
  /** Predicate selecting which registered actions belong to this category */
  matchAction: (action: PaletteAction) => boolean;
  /** Whether to include dynamic metadata-based filters in results */
  includeDynamic?: boolean;
}

const CATEGORY_PREFIX_DEFS: CategoryPrefixDef[] = [
  {
    prefixes: ["theme"],
    matchAction: (a) =>
      a.id.startsWith("theme:") ||
      a.id.startsWith("font:") ||
      a.id.startsWith("icons:") ||
      a.id.startsWith("scale:"),
  },
  {
    prefixes: ["sort"],
    matchAction: (a) => a.id.startsWith("sort:"),
  },
  {
    prefixes: ["filter"],
    matchAction: (a) =>
      a.id.startsWith("filter:") ||
      a.id === "action:hidden-games" ||
      a.id === "action:reset-filters",
    includeDynamic: true,
  },
  {
    prefixes: ["go to", "navigate"],
    matchAction: (a) => a.id.startsWith("nav:"),
  },
];

/**
 * Check if query matches a category prefix (theme, sort, filter, navigate).
 * Returns exclusive results scoped to that category, or null to fall through.
 */
function matchCategoryPrefix(
  query: string,
  actions: PaletteAction[],
  metadataCache: Map<string, StoreMetadata>,
  games: Game[],
): PaletteResults | null {
  for (const def of CATEGORY_PREFIX_DEFS) {
    for (const prefix of def.prefixes) {
      let rest: string;
      if (query === prefix) {
        rest = "";
      } else if (query.startsWith(prefix + " ")) {
        rest = query.slice(prefix.length + 1).trim();
      } else {
        continue;
      }

      // Filter registered actions to this category
      let matched = actions.filter(def.matchAction);

      // Further filter by rest term if provided
      if (rest) {
        matched = matched.filter(
          (a) =>
            a.label.toLowerCase().includes(rest) ||
            a.keywords.some((k) => k.includes(rest)),
        );
      }

      // Include dynamic metadata filters for "filter" category
      let dynamicFilters: PaletteAction[] = [];
      if (def.includeDynamic && rest) {
        dynamicFilters = buildDynamicFilterActions(rest, metadataCache, games);
      }

      return { actions: [...matched, ...dynamicFilters], games: [] };
    }
  }
  return null;
}

// ── Search ──────────────────────────────────────────────────────

/**
 * Search the palette: filter actions, games, and dynamic metadata filters by query.
 * Now accepts metadataCache as an explicit parameter for proper reactivity.
 */
export function searchPalette(
  query: string,
  actions: PaletteAction[],
  games: Game[],
  metadataCache: Map<string, StoreMetadata>,
): PaletteResults {
  if (!query.trim()) {
    return { actions: [], games: [] };
  }

  const q = query.toLowerCase().trim();

  // Check for prefix-triggered game actions (exclusive mode)
  const prefixResults = matchGameActionPrefix(q, games);
  if (prefixResults) {
    return { actions: prefixResults, games: [] };
  }

  // Check for category prefix matching (exclusive mode)
  const categoryResults = matchCategoryPrefix(q, actions, metadataCache, games);
  if (categoryResults) {
    return categoryResults;
  }

  // Standard action matching
  const matchedActions = actions.filter(
    (a) => a.label.toLowerCase().includes(q) || a.keywords.some((k) => k.includes(q)),
  );

  // Dynamic metadata-based filters
  const dynamicFilters = buildDynamicFilterActions(q, metadataCache, games);

  // Game name matching
  const matchedGames = games.filter((g) => g.name.toLowerCase().includes(q));

  return {
    actions: [...matchedActions.slice(0, MAX_ACTION_RESULTS), ...dynamicFilters],
    games: matchedGames.slice(0, MAX_GAME_RESULTS),
  };
}

/** Total result count for keyboard navigation */
export function totalResultCount(results: PaletteResults): number {
  return results.actions.length + results.games.length;
}

// ── AI Heuristic ────────────────────────────────────────────────

const AI_TRIGGER_WORDS = [
  "show me",
  "find",
  "launch",
  "play",
  "sort by",
  "filter by",
  "change",
  "switch to",
  "clear",
  "reset",
  "go to",
  "open",
  "set",
  "favorite",
  "installed",
  "hidden",
  "recommend",
  "suggest",
  "what should",
  "help me",
];

/** All category prefixes that the palette already handles natively. */
const CATEGORY_PREFIX_STRINGS = CATEGORY_PREFIX_DEFS.flatMap((d) => d.prefixes);

/**
 * Determine whether to show the "Ask Assistant" button in the command palette.
 * Does NOT auto-fire — the user must click the button to send the query.
 *
 * Returns true when:
 *   - Query has 3+ words OR contains a known trigger phrase
 *   - AND query is NOT a recognized category prefix (theme, sort, filter, go to, navigate)
 *   - AND regular results have fewer than 3 action matches
 *
 * Note: This intentionally does NOT check the pattern matcher result — cloud AI
 * should always be available as a fallback below the pattern matcher suggestion.
 */
export function shouldShowAskAssistant(query: string, results: PaletteResults): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return false;

  // Don't show if this is a category prefix query — the palette handles those natively
  for (const prefix of CATEGORY_PREFIX_STRINGS) {
    if (trimmed === prefix || trimmed.startsWith(prefix + " ")) {
      return false;
    }
  }

  // Also skip parameterized game-action prefixes ("favorite X", "notes X")
  for (const desc of GAME_ACTION_DESCRIPTORS) {
    for (const p of desc.prefixes) {
      if (trimmed === p || trimmed.startsWith(p + " ")) {
        return false;
      }
    }
  }

  const wordCount = trimmed.split(/\s+/).length;
  const hasTrigger = AI_TRIGGER_WORDS.some((t) => trimmed.includes(t));

  // Must be multi-word OR contain a trigger word
  if (wordCount < 3 && !hasTrigger) return false;

  // Only show when regular results are sparse
  return results.actions.length < 3;
}

/**
 * Extract game mentions from an AI summary by matching against the user's library.
 * Returns games whose names appear in the summary text.
 */
export function extractGameMentions(summary: string, games: Game[]): Game[] {
  if (!summary) return [];
  const lowerSummary = summary.toLowerCase();
  // Only match games with names of 3+ chars to avoid false positives
  return games.filter(
    (g) => g.name.length >= 3 && lowerSummary.includes(g.name.toLowerCase()),
  );
}

// ── AI Integration ──────────────────────────────────────────────

/**
 * Get a serializable manifest of all available actions for AI introspection.
 * Returns action definitions without execute closures.
 */
export function getActionManifest(settings: AppSettings | null): ActionManifestEntry[] {
  const allDescriptors: ActionDescriptor[] = [
    ...STATIC_DESCRIPTORS.filter((d) => !d.devOnly || settings?.devSettingsEnabled),
    ...buildOptionDescriptors(),
    ...SORT_DESCRIPTORS,
    ...buildSourceFilterDescriptors(),
  ];

  const entries: ActionManifestEntry[] = allDescriptors.map((d) => ({
    id: d.id,
    label: d.label,
    description: d.description,
    category: d.category as ActionManifestEntry["category"],
    parameterized: false,
  }));

  // Add parameterized game actions
  for (const gd of GAME_ACTION_DESCRIPTORS) {
    entries.push({
      id: gd.id,
      label: gd.label,
      description: gd.description,
      category: gd.category,
      parameterized: true,
      parameterHint: gd.parameterHint,
    });
  }

  return entries;
}

/**
 * Execute an action by ID, with optional parameters. For AI / programmatic use.
 * Returns true if the action was found and executed, false otherwise.
 */
export function executeActionById(
  actionId: string,
  ctx: PaletteContext,
  params?: { gameId?: string; games?: Game[] },
): boolean {
  // For parameterized game actions, resolve the target game.
  // Supports both explicit gameId param and compound IDs like "game:favorite:uuid".
  let resolvedActionId = actionId;

  if (params?.games) {
    if (params.gameId) {
      const targetGame = params.games.find((g) => g.gameId === params.gameId);
      if (targetGame) {
        ctx = { ...ctx, targetGame };
      }
    }

    // Handle compound parameterized IDs: "game:favorite:uuid" → base "game:favorite" + gameId
    for (const gd of GAME_ACTION_DESCRIPTORS) {
      if (actionId.startsWith(gd.id + ":")) {
        const gameId = actionId.slice(gd.id.length + 1);
        const targetGame = params.games.find((g) => g.gameId === gameId);
        if (targetGame) {
          ctx = { ...ctx, targetGame };
        }
        resolvedActionId = gd.id;
        break;
      }
    }
  }

  const executor = resolveExecutor(resolvedActionId);
  if (!executor) return false;

  executor(ctx);
  return true;
}
