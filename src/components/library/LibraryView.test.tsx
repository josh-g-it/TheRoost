import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LibraryView } from "./LibraryView";
import { makeGame, makeFilters } from "../../test/factories";
import { clearInvokeMocks } from "../../test/setup";
import type { Game, GameLibrary } from "../../types";
import { DEFAULT_SHELF_FILTERS } from "../../types/shelf";

// Stub ResizeObserver for jsdom (used by SessionHeatmap in GameDetail)
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// Mock Tauri event API
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

// ── Mock useSteamLibrary hook ──────────────────────────────────────
let mockLibraryData: GameLibrary | null = null;
let mockIsLoading = false;
let mockError: string | null = null;
const mockRefresh = vi.fn();

vi.mock("../../hooks/useSteamLibrary", () => ({
  useSteamLibrary: () => ({
    library: mockLibraryData,
    isLoading: mockIsLoading,
    error: mockError,
    refresh: mockRefresh,
  }),
}));

// ── Mock services ──────────────────────────────────────────────────
vi.mock("../../services/tauri", () => ({
  metadataApi: {
    fetchBatch: vi.fn().mockResolvedValue([]),
    backfillStoreDetails: vi.fn().mockResolvedValue(0),
  },
  settingsApi: {
    load: vi.fn(),
    save: vi.fn(),
  },
  coverArtApi: {
    getCoverArtUrl: vi.fn().mockResolvedValue(null),
  },
  notesApi: {
    getGameNote: vi.fn().mockResolvedValue(null),
    saveGameNote: vi.fn().mockResolvedValue(undefined),
  },
  gameApi: {
    launch: vi.fn(),
    getLaunchMode: vi.fn().mockResolvedValue("launcher"),
    setLaunchMode: vi.fn(),
  },
  sessionApi: {
    setManualPlaytime: vi.fn(),
    addManualPlaytime: vi.fn(),
  },
  steamInstallApi: {
    installGame: vi.fn(),
    uninstallGame: vi.fn(),
    updateGame: vi.fn(),
  },
  customGameApi: {
    remove: vi.fn(),
  },
  ratingsApi: {
    saveGameRating: vi.fn(),
  },
}));

// ── Mock react-router-dom ──────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

// ── Mock logger ────────────────────────────────────────────────────
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Mock useGameLaunch ─────────────────────────────────────────────
vi.mock("../../hooks/useGameLaunch", () => ({
  useGameLaunch: () => ({
    launch: vi.fn(),
    launching: null,
    error: null,
  }),
}));

// ── Store imports (for direct state manipulation) ──────────────────
import { useUIStore } from "../../store/uiSlice";
import { useMetadataStore } from "../../store/metadataSlice";
import { useTagsStore } from "../../store/tagsSlice";
import { useFavoritesStore } from "../../store/favoritesSlice";
import { useHiddenGamesStore } from "../../store/hiddenGamesSlice";
import { useSettingsStore } from "../../store/settingsSlice";
import { useShelvesStore } from "../../store/shelvesSlice";
import { useRatingsStore } from "../../store/ratingsSlice";
import { useInstallStore } from "../../store/installSlice";
import { useSessionStore } from "../../store/sessionSlice";

function makeLibrary(games: Game[], warnings: string[] = []): GameLibrary {
  return { games, totalCount: games.length, warnings };
}

describe("LibraryView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearInvokeMocks();

    // Reset mock hook values
    mockLibraryData = null;
    mockIsLoading = false;
    mockError = null;

    // Reset Zustand stores
    useUIStore.setState({
      viewMode: "grid",
      sortBy: "name",
      sortOrder: "asc",
      filters: makeFilters(),
      selectedGameId: null,
      customGameDialogOpen: false,
      editingCustomGameId: null,
      artMenuGameId: null,
      artMenuStep: null,
      artVersion: {},
    });
    useMetadataStore.setState({
      cache: new Map(),
      loading: new Set(),
    });
    useTagsStore.setState({
      tags: [],
      gameTagMap: new Map(),
    });
    useFavoritesStore.setState({
      favorites: new Set<string>(),
    });
    useHiddenGamesStore.setState({
      hiddenGames: new Set<string>(),
    });
    useSettingsStore.setState({
      settings: { iconSet: "classic", hasSeenWelcome: true } as never,
    });
    useShelvesStore.setState({
      shelves: [],
      editingShelfId: null,
    });
    useRatingsStore.setState({
      ratings: new Map(),
    });
    useInstallStore.setState({
      activeInstalls: new Map(),
    });
    useSessionStore.setState({
      gameSessions: [],
    });
  });

  // ── Loading State ────────────────────────────────────────────────

  it("shows loading spinner when library is loading and no data exists", () => {
    mockIsLoading = true;
    mockLibraryData = null;

    render(<LibraryView />);

    expect(screen.getByText("Scanning your library...")).toBeInTheDocument();
  });

  it("does NOT show loading spinner when library data exists even if loading", () => {
    mockIsLoading = true;
    mockLibraryData = makeLibrary([makeGame({ gameId: "g1", name: "Elden Ring" })]);

    render(<LibraryView />);

    expect(screen.queryByText("Scanning your library...")).not.toBeInTheDocument();
  });

  // ── Error State ──────────────────────────────────────────────────

  it("shows error message when library fails to load", () => {
    mockError = "Network connection failed";

    render(<LibraryView />);

    expect(screen.getByText("Failed to load library")).toBeInTheDocument();
    expect(screen.getByText("Network connection failed")).toBeInTheDocument();
    expect(screen.getByText("Try Again")).toBeInTheDocument();
  });

  it("calls refresh when Try Again button is clicked", async () => {
    mockError = "Network error";
    const user = userEvent.setup();

    render(<LibraryView />);

    await user.click(screen.getByText("Try Again"));
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  // ── Header ───────────────────────────────────────────────────────

  it("renders Library header", () => {
    render(<LibraryView />);

    expect(screen.getByText("Library")).toBeInTheDocument();
  });

  it("shows total game count in header subtitle", () => {
    mockLibraryData = makeLibrary([
      makeGame({ gameId: "g1", name: "Game 1" }),
      makeGame({ gameId: "g2", name: "Game 2" }),
      makeGame({ gameId: "g3", name: "Game 3" }),
    ]);

    render(<LibraryView />);

    expect(screen.getByText("3 games")).toBeInTheDocument();
  });

  // ── Warnings ─────────────────────────────────────────────────────

  it("displays warnings from library data", () => {
    mockLibraryData = makeLibrary([], ["Steam API rate limited"]);

    render(<LibraryView />);

    expect(screen.getByText("Steam API rate limited")).toBeInTheDocument();
  });

  it("does NOT show warnings section when no warnings", () => {
    mockLibraryData = makeLibrary([makeGame({ gameId: "g1", name: "Game 1" })]);

    render(<LibraryView />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // ── Grid Mode (Shelves) ──────────────────────────────────────────

  it("shows Add Shelf button in grid mode", () => {
    mockLibraryData = makeLibrary([makeGame({ gameId: "g1", name: "Game 1" })]);

    render(<LibraryView />);

    expect(screen.getByText("+ Add Shelf")).toBeInTheDocument();
  });

  // ── List Mode ────────────────────────────────────────────────────

  it("renders GameList in list view mode", () => {
    mockLibraryData = makeLibrary([
      makeGame({ gameId: "g1", name: "Alpha Game" }),
      makeGame({ gameId: "g2", name: "Beta Game" }),
    ]);
    useUIStore.setState({ viewMode: "list" });

    render(<LibraryView />);

    // In list mode, no "+ Add Shelf" button
    expect(screen.queryByText("+ Add Shelf")).not.toBeInTheDocument();
  });

  // ── Welcome Dialog ───────────────────────────────────────────────

  it("shows Welcome dialog when hasSeenWelcome is false", () => {
    useSettingsStore.setState({
      settings: { iconSet: "classic", hasSeenWelcome: false } as never,
    });
    mockLibraryData = makeLibrary([makeGame({ gameId: "g1", name: "Game 1" })]);

    render(<LibraryView />);

    // WelcomeDialog should render (checking for its content)
    expect(screen.getByText(/Welcome/i)).toBeInTheDocument();
  });

  it("does NOT show Welcome dialog when hasSeenWelcome is true", () => {
    useSettingsStore.setState({
      settings: { iconSet: "classic", hasSeenWelcome: true } as never,
    });
    mockLibraryData = makeLibrary([makeGame({ gameId: "g1", name: "Game 1" })]);

    render(<LibraryView />);

    // No Welcome dialog
    const welcomeElements = screen.queryAllByText(/Welcome to The Roost/i);
    expect(welcomeElements.length).toBe(0);
  });

  // ── Game Detail ──────────────────────────────────────────────────

  it("renders GameDetail when a game is selected", () => {
    mockLibraryData = makeLibrary([
      makeGame({
        gameId: "g1",
        name: "Elden Ring",
        source: "steam",
        sourceId: "1245620",
      }),
    ]);
    useUIStore.setState({ selectedGameId: "g1" });

    render(<LibraryView />);

    // GameDetail should be visible with the game name
    expect(
      screen.getByRole("dialog", { name: "Elden Ring details" }),
    ).toBeInTheDocument();
  });

  it("does NOT render GameDetail when no game is selected", () => {
    mockLibraryData = makeLibrary([makeGame({ gameId: "g1", name: "Elden Ring" })]);
    useUIStore.setState({ selectedGameId: null });

    render(<LibraryView />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // ── Empty Library ────────────────────────────────────────────────

  it("renders without crashing when library has zero games", () => {
    mockLibraryData = makeLibrary([]);

    render(<LibraryView />);

    expect(screen.getByText("Library")).toBeInTheDocument();
    // "0 games" appears in both header subtitle and LibraryControls
    expect(screen.getAllByText("0 games").length).toBeGreaterThanOrEqual(1);
  });

  // ── Shelf Rendering ──────────────────────────────────────────────

  it("renders shelves when they exist in grid mode", () => {
    mockLibraryData = makeLibrary([makeGame({ gameId: "g1", name: "Game A" })]);
    useShelvesStore.setState({
      shelves: [
        {
          id: "shelf-1",
          name: "Now Playing",
          preset: "all",
          filters: { ...DEFAULT_SHELF_FILTERS },
          sortBy: "name",
          sortOrder: "asc",
          displayMode: "expanded",
          groupByGenre: false,
          maxVisibleGames: null,
          pinnedGameIds: [],
        },
      ],
    });

    render(<LibraryView />);

    expect(screen.getByText("Now Playing")).toBeInTheDocument();
  });

  // ── Multiple Libraries (multi-source) ────────────────────────────

  it("renders games from multiple sources", () => {
    mockLibraryData = makeLibrary([
      makeGame({ gameId: "g1", name: "Steam Game", source: "steam", sourceId: "100" }),
      makeGame({ gameId: "g2", name: "Epic Game", source: "epic", sourceId: "epic-1" }),
      makeGame({ gameId: "g3", name: "GOG Game", source: "gog", sourceId: "gog-1" }),
    ]);

    render(<LibraryView />);

    expect(screen.getByText("3 games")).toBeInTheDocument();
  });

  // ── LibraryControls Integration ──────────────────────────────────

  it("does not crash without settings", () => {
    useSettingsStore.setState({ settings: null });
    mockLibraryData = makeLibrary([makeGame({ gameId: "g1", name: "Game" })]);

    // Should not throw
    expect(() => render(<LibraryView />)).not.toThrow();
  });
});
