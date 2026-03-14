import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildActionRegistry,
  searchPalette,
  totalResultCount,
  getActionManifest,
  executeActionById,
  PALETTE_HINTS,
} from "./commandPalette";
import { useUIStore } from "../store/uiSlice";
import type { AppSettings, PaletteAction, PaletteContext, StoreMetadata } from "../types";
import { THEMES } from "../hooks/useTheme";
import { FONT_OPTIONS, ICON_SET_OPTIONS, UI_SCALE_OPTIONS } from "../types/theme";
import { makeGame } from "../test/factories";

// Mock Zustand stores used by searchPalette and action execute handlers
vi.mock("../store/uiSlice", () => ({
  useUIStore: {
    getState: () => ({
      filters: {
        showInstalledOnly: false,
        showFavoritesOnly: false,
        showHiddenOnly: false,
        filterByGenreIds: [],
        filterBySteamTagNames: [],
        filterByCategoryIds: [],
        filterBySource: [],
      },
      setViewMode: vi.fn(),
      setSearchQuery: vi.fn(),
      setShowInstalledOnly: vi.fn(),
      setShowFavoritesOnly: vi.fn(),
      setShowHiddenOnly: vi.fn(),
      setFilterByGenreIds: vi.fn(),
      setFilterBySteamTagNames: vi.fn(),
      setFilterByCategoryIds: vi.fn(),
      setFilterBySource: vi.fn(),
      setFilterByTagIds: vi.fn(),
      setSorting: vi.fn(),
      openCustomGameDialog: vi.fn(),
    }),
  },
}));

vi.mock("../store/librarySlice", () => ({
  useLibraryStore: {
    getState: () => ({
      library: { games: [] },
      refreshLibrary: vi.fn(),
      scanLocalOnly: vi.fn(),
    }),
  },
}));

vi.mock("../store/metadataSlice", () => ({
  useMetadataStore: {
    getState: () => ({
      cache: new Map(),
      refreshAllMetadata: vi.fn(),
    }),
  },
}));

vi.mock("../store/notesSlice", () => ({
  useNotesStore: {
    getState: () => ({
      notes: [],
      setScrollTarget: vi.fn(),
    }),
    setState: vi.fn(),
  },
}));

vi.mock("../store/favoritesSlice", () => ({
  useFavoritesStore: {
    getState: () => ({
      toggleFavorite: vi.fn(),
    }),
  },
}));

vi.mock("../services/tauri", () => ({
  externalApi: {
    scanExternalGames: vi.fn(),
  },
  steamInstallApi: {
    installGame: vi.fn(),
    uninstallGame: vi.fn(),
    updateGame: vi.fn(),
  },
}));

const emptyCache = new Map<string, StoreMetadata>();

const defaultSettings: AppSettings = {
  steamApiKey: "test-key",
  steamId: "76561198012345678",
  isFirstRun: false,
  theme: "dark-gaming",
  iconSet: "classic",
  fontFamily: "system",
  uiScale: "comfortable",
  cardDisplay: {
    showGenreTags: true,
    showPlaytime: true,
    showInstalledBadge: true,
    showTags: true,
    showRatingBadge: false,
    gridSize: "medium",
    listDensity: "default",
    listColumns: [],
  },
  profileChartOptions: {
    genreRadarCount: 8,
    playtimeBuckets: "default",
    leaderboardTopN: 10,
  },
  commandCenterSlots: [],
  commandCenterShortcut: "`+Space",
  railMode: "dynamic",
  minimizeToTray: true,
  devSettingsEnabled: false,
  shelves: [],
};

function makeCtx(overrides?: Partial<PaletteContext>): PaletteContext {
  return {
    navigate: vi.fn(),
    closeCommandCenter: vi.fn(),
    settings: defaultSettings,
    saveSettings: vi.fn(),
    ...overrides,
  };
}

// ── buildActionRegistry ────────────────────────────────────────

describe("buildActionRegistry", () => {
  let actions: PaletteAction[];

  beforeEach(() => {
    actions = buildActionRegistry(defaultSettings);
  });

  it("returns an array of actions", () => {
    expect(Array.isArray(actions)).toBe(true);
    expect(actions.length).toBeGreaterThan(0);
  });

  it("all actions have required fields including description", () => {
    for (const action of actions) {
      expect(action).toHaveProperty("id");
      expect(action).toHaveProperty("label");
      expect(action).toHaveProperty("description");
      expect(typeof action.description).toBe("string");
      expect(action.description.length).toBeGreaterThan(0);
      expect(action).toHaveProperty("icon");
      expect(action).toHaveProperty("category");
      expect(action).toHaveProperty("execute");
      expect(typeof action.execute).toBe("function");
      expect(Array.isArray(action.keywords)).toBe(true);
    }
  });

  it("contains navigation actions", () => {
    const navIds = actions.filter((a) => a.id.startsWith("nav:")).map((a) => a.id);
    expect(navIds).toContain("nav:library");
    expect(navIds).toContain("nav:activity");
    expect(navIds).toContain("nav:profile");
    expect(navIds).toContain("nav:notes");
    expect(navIds).toContain("nav:settings");
  });

  it("contains a theme action for each palette", () => {
    for (const theme of THEMES) {
      expect(actions.some((a) => a.id === `theme:${theme.id}`)).toBe(true);
    }
  });

  it("contains a font action for each font", () => {
    for (const font of FONT_OPTIONS) {
      expect(actions.some((a) => a.id === `font:${font.id}`)).toBe(true);
    }
  });

  it("contains an icon set action for each icon set", () => {
    for (const iconSet of ICON_SET_OPTIONS) {
      expect(actions.some((a) => a.id === `icons:${iconSet.id}`)).toBe(true);
    }
  });

  it("contains a UI scale action for each scale", () => {
    for (const scale of UI_SCALE_OPTIONS) {
      expect(actions.some((a) => a.id === `scale:${scale.id}`)).toBe(true);
    }
  });

  it("contains sort actions", () => {
    const sortIds = actions.filter((a) => a.id.startsWith("sort:")).map((a) => a.id);
    expect(sortIds).toContain("sort:name");
    expect(sortIds).toContain("sort:playtime");
    expect(sortIds).toContain("sort:metacritic");
    expect(sortIds).toContain("sort:source");
  });

  it("contains per-launcher filter actions", () => {
    expect(actions.some((a) => a.id === "filter:source:steam")).toBe(true);
    expect(actions.some((a) => a.id === "filter:source:epic")).toBe(true);
    expect(actions.some((a) => a.id === "filter:source:gog")).toBe(true);
  });

  it("works with null settings", () => {
    const result = buildActionRegistry(null);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("hides dev actions when devSettingsEnabled is false", () => {
    const result = buildActionRegistry({ ...defaultSettings, devSettingsEnabled: false });
    const ids = result.map((a) => a.id);
    expect(ids).not.toContain("nav:debug");
    expect(ids).not.toContain("dev:onboarding");
    expect(ids).not.toContain("dev:clear-data");
  });

  it("shows dev actions when devSettingsEnabled is true", () => {
    const result = buildActionRegistry({ ...defaultSettings, devSettingsEnabled: true });
    const ids = result.map((a) => a.id);
    expect(ids).toContain("nav:debug");
    expect(ids).toContain("dev:onboarding");
    expect(ids).toContain("dev:clear-data");
  });

  it("contains add custom game action", () => {
    const action = actions.find((a) => a.id === "action:add-custom-game");
    expect(action).toBeDefined();
    expect(action!.label).toBe("Add Custom Game");
    expect(action!.icon).toBe("plus");
    expect(action!.category).toBe("action");
  });

  it("contains scan external games action", () => {
    const action = actions.find((a) => a.id === "action:scan-external");
    expect(action).toBeDefined();
    expect(action!.label).toBe("Scan External Games");
  });

  it("contains toggle dev mode action (always present, not gated)", () => {
    const action = actions.find((a) => a.id === "action:toggle-dev-mode");
    expect(action).toBeDefined();
    expect(action!.label).toBe("Toggle Developer Mode");
    expect(action!.category).toBe("settings");
  });
});

// ── searchPalette ──────────────────────────────────────────────

describe("searchPalette", () => {
  let actions: PaletteAction[];
  const testGames = [
    makeGame({ gameId: "g1", name: "Portal 2" }),
    makeGame({ gameId: "g2", name: "Dota 2" }),
    makeGame({ gameId: "g3", name: "Half-Life" }),
  ];

  beforeEach(() => {
    actions = buildActionRegistry(defaultSettings);
  });

  it("empty query returns empty results", () => {
    const result = searchPalette("", actions, testGames, emptyCache);
    expect(result.actions).toHaveLength(0);
    expect(result.games).toHaveLength(0);
  });

  it("whitespace query returns empty results", () => {
    const result = searchPalette("   ", actions, testGames, emptyCache);
    expect(result.actions).toHaveLength(0);
    expect(result.games).toHaveLength(0);
  });

  it("matches action by label", () => {
    const result = searchPalette("Library", actions, testGames, emptyCache);
    expect(result.actions.some((a) => a.id === "nav:library")).toBe(true);
  });

  it("matches action by keyword", () => {
    const result = searchPalette("heatmap", actions, testGames, emptyCache);
    expect(result.actions.some((a) => a.id === "nav:activity")).toBe(true);
  });

  it("is case-insensitive", () => {
    const result = searchPalette("LIBRARY", actions, testGames, emptyCache);
    expect(result.actions.some((a) => a.id === "nav:library")).toBe(true);
  });

  it("matches games by name", () => {
    const result = searchPalette("portal", actions, testGames, emptyCache);
    expect(result.games.some((g) => g.name === "Portal 2")).toBe(true);
  });

  it("caps generic action results at limit", () => {
    // "appearance" keyword matches theme actions but is not a category prefix
    const result = searchPalette("appearance", actions, testGames, emptyCache);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.actions.length).toBeLessThanOrEqual(12);
  });

  it("caps game results at 8", () => {
    const manyGames = Array.from({ length: 20 }, (_, i) =>
      makeGame({ gameId: `g${i}`, name: `TestGame ${i}` }),
    );
    const result = searchPalette("testgame", actions, manyGames, emptyCache);
    expect(result.games.length).toBeLessThanOrEqual(8);
  });

  // Prefix-triggered game action tests
  it("prefix 'favorite portal' returns toggle favorite action", () => {
    const result = searchPalette("favorite portal", actions, testGames, emptyCache);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].id).toContain("game:favorite:");
    expect(result.actions[0].label).toContain("Portal 2");
    expect(result.games).toHaveLength(0); // exclusive mode
  });

  it("prefix 'fav portal' also works", () => {
    const result = searchPalette("fav portal", actions, testGames, emptyCache);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].label).toContain("Portal 2");
  });

  it("prefix 'notes dota' returns open notes action", () => {
    const result = searchPalette("notes dota", actions, testGames, emptyCache);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].id).toContain("game:notes:");
    expect(result.actions[0].label).toContain("Dota 2");
    expect(result.games).toHaveLength(0);
  });

  it("prefix 'note half' also works", () => {
    const result = searchPalette("note half", actions, testGames, emptyCache);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].label).toContain("Half-Life");
  });

  it("prefix with no matching game falls through to standard search", () => {
    const result = searchPalette("favorite zzz", actions, testGames, emptyCache);
    // No games match "zzz", so prefix matching returns null and falls through
    // Standard search uses full query "favorite zzz" which matches no actions or games
    expect(result.actions).toHaveLength(0);
    expect(result.games).toHaveLength(0);
  });

  it("prefix word alone (no space) returns standard results", () => {
    const result = searchPalette("favorite", actions, testGames, emptyCache);
    // No space = no prefix mode; matches "favorites" action via keyword
    expect(result.actions.some((a) => a.id === "filter:favorites")).toBe(true);
    expect(result.actions.every((a) => !a.id.startsWith("game:"))).toBe(true);
  });

  it("prefix with only space and no game name falls through", () => {
    const result = searchPalette("favorite ", actions, testGames, emptyCache);
    // Space but empty rest — falls through to standard search
    expect(result.actions.some((a) => a.id === "filter:favorites")).toBe(true);
  });

  // Dynamic metadata filter tests
  it("shows tag filter suggestions when metadata cache has tags", () => {
    const cache = new Map<string, StoreMetadata>();
    cache.set("g1", {
      gameId: "g1",
      name: "Portal 2",
      shortDescription: null,
      headerImageUrl: null,
      developers: [],
      publishers: [],
      genres: [{ id: "1", description: "Action" }],
      categories: [],
      screenshots: [],
      releaseDate: null,
      metacriticScore: null,
      metacriticUrl: null,
      steamTags: [{ name: "Puzzle", votes: 100 }],
    });
    const result = searchPalette("puzzle", actions, testGames, cache);
    expect(result.actions.some((a) => a.id === "tag-filter:Puzzle")).toBe(true);
  });

  it("shows tag filter suggestions when metadata cache is populated", () => {
    const cache = new Map<string, StoreMetadata>();
    cache.set("g1", {
      gameId: "g1",
      name: "Portal 2",
      shortDescription: null,
      headerImageUrl: null,
      developers: [],
      publishers: [],
      genres: [],
      categories: [],
      screenshots: [],
      releaseDate: null,
      metacriticScore: null,
      metacriticUrl: null,
      steamTags: [{ name: "Puzzle", votes: 100 }],
    });
    const result = searchPalette("puzzle", actions, testGames, cache);
    expect(result.actions.some((a) => a.id === "tag-filter:Puzzle")).toBe(true);
  });
});

// ── totalResultCount ───────────────────────────────────────────

describe("totalResultCount", () => {
  it("sums actions and games", () => {
    const result = totalResultCount({
      actions: [
        {
          id: "a",
          label: "A",
          description: "Test action",
          keywords: [],
          icon: "library",
          category: "action",
          execute: () => {},
        },
      ],
      games: [
        makeGame({ gameId: "g1", name: "Game" }),
        makeGame({ gameId: "g2", name: "Game 2" }),
      ],
    });
    expect(result).toBe(3);
  });

  it("returns 0 for empty results", () => {
    expect(totalResultCount({ actions: [], games: [] })).toBe(0);
  });
});

// ── getActionManifest ──────────────────────────────────────────

describe("getActionManifest", () => {
  it("returns serializable entries with descriptions", () => {
    const manifest = getActionManifest(defaultSettings);
    expect(manifest.length).toBeGreaterThan(0);
    for (const entry of manifest) {
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.label).toBe("string");
      expect(typeof entry.description).toBe("string");
      expect(entry.description.length).toBeGreaterThan(0);
      expect(typeof entry.category).toBe("string");
      expect(typeof entry.parameterized).toBe("boolean");
      // No execute function — must be serializable
      expect(entry).not.toHaveProperty("execute");
    }
  });

  it("includes parameterized game actions", () => {
    const manifest = getActionManifest(defaultSettings);
    const favAction = manifest.find((e) => e.id === "game:favorite");
    expect(favAction).toBeDefined();
    expect(favAction!.parameterized).toBe(true);
    expect(favAction!.parameterHint).toBe("favorite {game name}");

    const notesAction = manifest.find((e) => e.id === "game:notes");
    expect(notesAction).toBeDefined();
    expect(notesAction!.parameterized).toBe(true);
    expect(notesAction!.parameterHint).toBe("notes {game name}");
  });

  it("contains all static and option-based actions", () => {
    const manifest = getActionManifest(defaultSettings);
    const ids = manifest.map((e) => e.id);
    expect(ids).toContain("nav:library");
    expect(ids).toContain("action:scan-external");
    expect(ids).toContain("action:toggle-dev-mode");
    expect(ids).toContain("sort:name");
    expect(ids).toContain("filter:source:steam");
    // Theme/font/icon/scale are also present
    expect(ids.some((id) => id.startsWith("theme:"))).toBe(true);
    expect(ids.some((id) => id.startsWith("font:"))).toBe(true);
  });

  it("respects devSettingsEnabled", () => {
    const withDev = getActionManifest({ ...defaultSettings, devSettingsEnabled: true });
    const withoutDev = getActionManifest({
      ...defaultSettings,
      devSettingsEnabled: false,
    });
    expect(withDev.some((e) => e.id === "nav:debug")).toBe(true);
    expect(withoutDev.some((e) => e.id === "nav:debug")).toBe(false);
  });
});

// ── executeActionById ──────────────────────────────────────────

describe("executeActionById", () => {
  it("executes a known action and returns true", () => {
    const ctx = makeCtx();
    const result = executeActionById("nav:library", ctx);
    expect(result).toBe(true);
    expect(ctx.navigate).toHaveBeenCalledWith("/library");
    expect(ctx.closeCommandCenter).toHaveBeenCalled();
  });

  it("returns false for unknown action ID", () => {
    const ctx = makeCtx();
    const result = executeActionById("nonexistent:action", ctx);
    expect(result).toBe(false);
  });

  it("handles theme prefix actions", () => {
    const ctx = makeCtx();
    const result = executeActionById("theme:dark-gaming", ctx);
    expect(result).toBe(true);
    expect(ctx.saveSettings).toHaveBeenCalled();
  });

  it("handles sort prefix actions", () => {
    const ctx = makeCtx();
    const result = executeActionById("sort:playtime", ctx);
    expect(result).toBe(true);
    expect(ctx.navigate).toHaveBeenCalledWith("/library");
  });

  it("handles parameterized game actions with target game", () => {
    const game = makeGame({ gameId: "g1", name: "Portal 2" });
    const ctx = makeCtx();
    const result = executeActionById("game:favorite", ctx, {
      gameId: "g1",
      games: [game],
    });
    expect(result).toBe(true);
    expect(ctx.closeCommandCenter).toHaveBeenCalled();
  });

  it("handles compound parameterized IDs like game:favorite:uuid", () => {
    const game = makeGame({ gameId: "abc-123", name: "Half-Life 2" });
    const ctx = makeCtx();
    const result = executeActionById("game:favorite:abc-123", ctx, {
      games: [game],
    });
    expect(result).toBe(true);
    expect(ctx.closeCommandCenter).toHaveBeenCalled();
  });
});

describe("reset filters action", () => {
  it("action:reset-filters exists in registry", () => {
    const actions = buildActionRegistry(defaultSettings);
    const reset = actions.find((a) => a.id === "action:reset-filters");
    expect(reset).toBeDefined();
    expect(reset!.label).toBe("Reset All Filters");
  });

  it("searching 'reset' finds the reset filters action", () => {
    const actions = buildActionRegistry(defaultSettings);
    const result = searchPalette("reset", actions, [], emptyCache);
    const ids = result.actions.map((a) => a.id);
    expect(ids).toContain("action:reset-filters");
  });

  it("searching 'clear' finds the reset filters action", () => {
    const actions = buildActionRegistry(defaultSettings);
    const result = searchPalette("clear", actions, [], emptyCache);
    const ids = result.actions.map((a) => a.id);
    expect(ids).toContain("action:reset-filters");
  });
});

describe("PALETTE_HINTS", () => {
  it("exports hint categories with required fields", () => {
    expect(PALETTE_HINTS.length).toBeGreaterThanOrEqual(5);
    for (const hint of PALETTE_HINTS) {
      expect(hint.label).toBeTruthy();
      expect(hint.description).toBeTruthy();
      expect(hint.icon).toBeTruthy();
      expect(hint.autofill).toBeTruthy();
    }
  });

  it("includes expected categories", () => {
    const labels = PALETTE_HINTS.map((h) => h.label);
    expect(labels).toContain("Navigate");
    expect(labels).toContain("Filter");
    expect(labels).toContain("Sort");
    expect(labels).toContain("Theme");
    expect(labels).toContain("Favorite");
    expect(labels).toContain("Notes");
  });

  it("autofill values end with a space for user to continue typing", () => {
    for (const hint of PALETTE_HINTS) {
      expect(hint.autofill.endsWith(" ")).toBe(true);
    }
  });
});

// ── Category Prefix Matching ─────────────────────────────────────

describe("category prefix matching", () => {
  let actions: PaletteAction[];
  const testGames = [
    makeGame({ gameId: "g1", name: "Portal 2" }),
    makeGame({ gameId: "g2", name: "Dota 2" }),
  ];

  beforeEach(() => {
    actions = buildActionRegistry(defaultSettings);
  });

  it("'theme' shows all theme/font/icon/scale actions (exclusive mode)", () => {
    const result = searchPalette("theme", actions, testGames, emptyCache);
    const ids = result.actions.map((a) => a.id);
    expect(ids.some((id) => id.startsWith("theme:"))).toBe(true);
    expect(ids.some((id) => id.startsWith("font:"))).toBe(true);
    expect(ids.some((id) => id.startsWith("icons:"))).toBe(true);
    expect(ids.some((id) => id.startsWith("scale:"))).toBe(true);
    // 9 themes + 5 fonts + 6 icon sets + 4 UI scales = 24
    expect(result.actions).toHaveLength(
      THEMES.length +
        FONT_OPTIONS.length +
        ICON_SET_OPTIONS.length +
        UI_SCALE_OPTIONS.length,
    );
    expect(result.games).toHaveLength(0);
  });

  it("'theme ' (with space) shows same results as 'theme'", () => {
    const result = searchPalette("theme ", actions, testGames, emptyCache);
    expect(result.actions).toHaveLength(
      THEMES.length +
        FONT_OPTIONS.length +
        ICON_SET_OPTIONS.length +
        UI_SCALE_OPTIONS.length,
    );
    expect(result.games).toHaveLength(0);
  });

  it("'theme dark' filters to matching items only", () => {
    const result = searchPalette("theme dark", actions, testGames, emptyCache);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.actions.length).toBeLessThan(24);
    for (const a of result.actions) {
      const matchesLabel = a.label.toLowerCase().includes("dark");
      const matchesKeyword = a.keywords.some((k) => k.includes("dark"));
      expect(matchesLabel || matchesKeyword).toBe(true);
    }
    expect(result.games).toHaveLength(0);
  });

  it("'sort' shows all 8 sort actions", () => {
    const result = searchPalette("sort", actions, testGames, emptyCache);
    expect(result.actions.every((a) => a.id.startsWith("sort:"))).toBe(true);
    expect(result.actions).toHaveLength(8);
    expect(result.games).toHaveLength(0);
  });

  it("'sort play' filters to matching sort actions", () => {
    const result = searchPalette("sort play", actions, testGames, emptyCache);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.actions.some((a) => a.id === "sort:playtime")).toBe(true);
    expect(result.games).toHaveLength(0);
  });

  it("'filter' shows all filter-related static actions", () => {
    const result = searchPalette("filter", actions, testGames, emptyCache);
    const ids = result.actions.map((a) => a.id);
    expect(ids).toContain("filter:installed");
    expect(ids).toContain("filter:favorites");
    expect(ids).toContain("action:hidden-games");
    expect(ids).toContain("action:reset-filters");
    expect(ids.some((id) => id.startsWith("filter:source:"))).toBe(true);
    expect(result.games).toHaveLength(0);
  });

  it("'filter rpg' includes dynamic tag filters with metadata", () => {
    const cache = new Map<string, StoreMetadata>();
    cache.set("g1", {
      gameId: "g1",
      name: "Portal 2",
      shortDescription: null,
      headerImageUrl: null,
      developers: [],
      publishers: [],
      genres: [{ id: "1", description: "RPG" }],
      categories: [],
      screenshots: [],
      releaseDate: null,
      metacriticScore: null,
      metacriticUrl: null,
      steamTags: [{ name: "RPG", votes: 200 }],
    });
    const result = searchPalette("filter rpg", actions, testGames, cache);
    expect(result.actions.some((a) => a.id === "tag-filter:RPG")).toBe(true);
    expect(result.games).toHaveLength(0);
  });

  it("'go to' shows all navigation actions", () => {
    const result = searchPalette("go to", actions, testGames, emptyCache);
    expect(result.actions.every((a) => a.id.startsWith("nav:"))).toBe(true);
    expect(result.actions.length).toBeGreaterThanOrEqual(5);
    expect(result.games).toHaveLength(0);
  });

  it("'navigate' also shows navigation actions", () => {
    const result = searchPalette("navigate", actions, testGames, emptyCache);
    expect(result.actions.every((a) => a.id.startsWith("nav:"))).toBe(true);
    expect(result.games).toHaveLength(0);
  });

  it("'go to library' filters to matching nav actions", () => {
    const result = searchPalette("go to library", actions, testGames, emptyCache);
    expect(result.actions.some((a) => a.id === "nav:library")).toBe(true);
    expect(result.actions.length).toBeLessThan(5);
    expect(result.games).toHaveLength(0);
  });
});

// ── Install/Uninstall game actions ───────────────────────────────

describe("install/uninstall game actions", () => {
  let actions: PaletteAction[];
  const steamInstalled = makeGame({
    gameId: "g1",
    name: "Portal 2",
    source: "steam",
    sourceId: "620",
    isInstalled: true,
  });
  const steamUninstalled = makeGame({
    gameId: "g2",
    name: "Half-Life 3",
    source: "steam",
    sourceId: "99999",
    isInstalled: false,
  });
  const manualGame = makeGame({
    gameId: "g3",
    name: "My Custom Game",
    source: "manual",
    sourceId: "g3",
    isInstalled: true,
  });
  const testGames = [steamInstalled, steamUninstalled, manualGame];

  beforeEach(() => {
    actions = buildActionRegistry(defaultSettings);
  });

  it("game:install descriptor exists in manifest", () => {
    const manifest = getActionManifest(defaultSettings);
    const installAction = manifest.find((e) => e.id === "game:install");
    expect(installAction).toBeDefined();
    expect(installAction!.parameterized).toBe(true);
    expect(installAction!.parameterHint).toBe("install {game name}");
  });

  it("game:uninstall descriptor exists in manifest", () => {
    const manifest = getActionManifest(defaultSettings);
    const uninstallAction = manifest.find((e) => e.id === "game:uninstall");
    expect(uninstallAction).toBeDefined();
    expect(uninstallAction!.parameterized).toBe(true);
    expect(uninstallAction!.parameterHint).toBe("uninstall {game name}");
  });

  it("'install half' shows only uninstalled Steam games", () => {
    const result = searchPalette("install half", actions, testGames, emptyCache);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].label).toContain("Half-Life 3");
    expect(result.games).toHaveLength(0);
  });

  it("'install portal' returns nothing (Portal 2 is already installed)", () => {
    const result = searchPalette("install portal", actions, testGames, emptyCache);
    expect(result.actions).toHaveLength(0);
  });

  it("'uninstall portal' shows only installed Steam games", () => {
    const result = searchPalette("uninstall portal", actions, testGames, emptyCache);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].label).toContain("Portal 2");
    expect(result.games).toHaveLength(0);
  });

  it("'uninstall half' returns nothing (Half-Life 3 is not installed)", () => {
    const result = searchPalette("uninstall half", actions, testGames, emptyCache);
    expect(result.actions).toHaveLength(0);
  });

  it("install/uninstall excludes non-Steam games", () => {
    const result = searchPalette("install custom", actions, testGames, emptyCache);
    expect(result.actions).toHaveLength(0);

    const result2 = searchPalette("uninstall custom", actions, testGames, emptyCache);
    expect(result2.actions).toHaveLength(0);
  });

  it("PALETTE_HINTS includes Install and Uninstall", () => {
    const labels = PALETTE_HINTS.map((h) => h.label);
    expect(labels).toContain("Install");
    expect(labels).toContain("Uninstall");
  });

  it("game:update descriptor exists in manifest", () => {
    const manifest = getActionManifest(defaultSettings);
    const updateAction = manifest.find((e) => e.id === "game:update");
    expect(updateAction).toBeDefined();
    expect(updateAction!.parameterized).toBe(true);
    expect(updateAction!.parameterHint).toBe("update {game name}");
  });

  it("'update portal' shows installed Steam games", () => {
    const result = searchPalette("update portal", actions, testGames, emptyCache);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].label).toContain("Portal 2");
    expect(result.games).toHaveLength(0);
  });

  it("'update half' returns nothing (Half-Life 3 is not installed)", () => {
    const result = searchPalette("update half", actions, testGames, emptyCache);
    expect(result.actions).toHaveLength(0);
  });

  it("update excludes non-Steam games", () => {
    const result = searchPalette("update custom", actions, testGames, emptyCache);
    expect(result.actions).toHaveLength(0);
  });

  it("filter:update-pending appears in action registry", () => {
    const action = actions.find((a) => a.id === "filter:update-pending");
    expect(action).toBeDefined();
    expect(action!.label).toBe("Show Games Pending Update");
  });

  it("PALETTE_HINTS includes Update", () => {
    const labels = PALETTE_HINTS.map((h) => h.label);
    expect(labels).toContain("Update");
  });
});

// ── Sort Direction Support ─────────────────────────────────────

describe("sort direction support", () => {
  const setSortingMock = vi.fn();

  beforeEach(() => {
    setSortingMock.mockClear();
    // Replace getState with a version that returns our stable mock
    vi.spyOn(useUIStore, "getState").mockReturnValue({
      ...useUIStore.getState(),
      setSorting: setSortingMock,
    } as unknown as ReturnType<typeof useUIStore.getState>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sort:playtime without direction uses smart default (desc)", () => {
    const ctx = makeCtx();
    const result = executeActionById("sort:playtime", ctx);
    expect(result).toBe(true);
    expect(setSortingMock).toHaveBeenCalledWith("playtime", "desc");
  });

  it("sort:name without direction uses smart default (asc)", () => {
    const ctx = makeCtx();
    executeActionById("sort:name", ctx);
    expect(setSortingMock).toHaveBeenCalledWith("name", "asc");
  });

  it("sort:playtime:asc uses explicit direction override", () => {
    const ctx = makeCtx();
    const result = executeActionById("sort:playtime:asc", ctx);
    expect(result).toBe(true);
    expect(setSortingMock).toHaveBeenCalledWith("playtime", "asc");
  });

  it("sort:name:desc uses explicit direction override", () => {
    const ctx = makeCtx();
    executeActionById("sort:name:desc", ctx);
    expect(setSortingMock).toHaveBeenCalledWith("name", "desc");
  });

  it("sort:lastPlayed:desc uses explicit direction", () => {
    const ctx = makeCtx();
    executeActionById("sort:lastPlayed:desc", ctx);
    expect(setSortingMock).toHaveBeenCalledWith("lastPlayed", "desc");
  });

  it("sort:source without direction uses smart default (asc)", () => {
    const ctx = makeCtx();
    executeActionById("sort:source", ctx);
    expect(setSortingMock).toHaveBeenCalledWith("source", "asc");
  });

  it("sort:metacritic without direction uses smart default (desc)", () => {
    const ctx = makeCtx();
    executeActionById("sort:metacritic", ctx);
    expect(setSortingMock).toHaveBeenCalledWith("metacritic", "desc");
  });

  it("sort:personalRating without direction uses smart default (desc)", () => {
    const ctx = makeCtx();
    executeActionById("sort:personalRating", ctx);
    expect(setSortingMock).toHaveBeenCalledWith("personalRating", "desc");
  });

  it("sort with direction still navigates to library", () => {
    const ctx = makeCtx();
    executeActionById("sort:playtime:desc", ctx);
    expect(ctx.navigate).toHaveBeenCalledWith("/library");
  });
});
