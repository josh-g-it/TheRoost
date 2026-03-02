import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameDetail } from "./GameDetail";
import { makeGame, makeMeta } from "../../test/factories";
import { mockInvokeCommand, mockInvokeError, clearInvokeMocks } from "../../test/setup";

// Stub ResizeObserver for jsdom (used by SessionHeatmap)
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
import { useSettingsStore } from "../../store/settingsSlice";
import { useMetadataStore } from "../../store/metadataSlice";
import { useSessionStore } from "../../store/sessionSlice";
import { useTagsStore } from "../../store/tagsSlice";
import { useFavoritesStore } from "../../store/favoritesSlice";
import { useHiddenGamesStore } from "../../store/hiddenGamesSlice";
import { useUIStore } from "../../store/uiSlice";
import { useRatingsStore } from "../../store/ratingsSlice";
import { useShelvesStore } from "../../store/shelvesSlice";
import { useInstallStore } from "../../store/installSlice";

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

// Mock services
const mockGetGameNote = vi.fn();
const mockSaveGameNote = vi.fn();
const mockLaunch = vi.fn();
const mockGetLaunchMode = vi.fn();
const mockSetLaunchMode = vi.fn();
const mockSetManualPlaytime = vi.fn();
const mockAddManualPlaytime = vi.fn();
const mockInstallGame = vi.fn();
const mockUninstallGame = vi.fn();
const mockUpdateGame = vi.fn();
const mockRemoveCustomGame = vi.fn();
const mockSaveGameRating = vi.fn();

vi.mock("../../services/tauri", () => ({
  notesApi: {
    getGameNote: (...args: unknown[]) => mockGetGameNote(...args),
    saveGameNote: (...args: unknown[]) => mockSaveGameNote(...args),
  },
  gameApi: {
    launch: (...args: unknown[]) => mockLaunch(...args),
    getLaunchMode: (...args: unknown[]) => mockGetLaunchMode(...args),
    setLaunchMode: (...args: unknown[]) => mockSetLaunchMode(...args),
  },
  sessionApi: {
    setManualPlaytime: (...args: unknown[]) => mockSetManualPlaytime(...args),
    addManualPlaytime: (...args: unknown[]) => mockAddManualPlaytime(...args),
  },
  steamInstallApi: {
    installGame: (...args: unknown[]) => mockInstallGame(...args),
    uninstallGame: (...args: unknown[]) => mockUninstallGame(...args),
    updateGame: (...args: unknown[]) => mockUpdateGame(...args),
  },
  customGameApi: {
    remove: (...args: unknown[]) => mockRemoveCustomGame(...args),
  },
  coverArtApi: {
    getCoverArtUrl: vi.fn().mockResolvedValue(null),
  },
  ratingsApi: {
    saveGameRating: (...args: unknown[]) => mockSaveGameRating(...args),
  },
}));

// Mock the useGameLaunch hook
vi.mock("../../hooks/useGameLaunch", () => ({
  useGameLaunch: () => ({
    launch: mockLaunch,
    launching: null,
    error: null,
  }),
}));

// Mock logger
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("GameDetail", () => {
  const mockOnClose = vi.fn();
  const mockOnPersistShelves = vi.fn();

  const defaultGame = makeGame({
    gameId: "game-1",
    name: "Elden Ring",
    source: "steam",
    sourceId: "1245620",
    playtimeForever: 120,
    isInstalled: true,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clearInvokeMocks();

    // Reset Zustand stores to default state
    useSettingsStore.setState({
      settings: { iconSet: "classic" } as never,
    });
    useMetadataStore.setState({
      cache: new Map(),
      loading: new Set(),
    });
    useSessionStore.setState({
      gameSessions: [],
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
    useUIStore.setState({
      artMenuGameId: null,
      artMenuStep: null,
      artVersion: {},
    });
    useRatingsStore.setState({
      ratings: new Map(),
    });
    useShelvesStore.setState({
      shelves: [],
    });
    useInstallStore.setState({
      activeInstalls: new Map(),
    });

    // Default API mocks
    mockGetGameNote.mockResolvedValue(null);
    mockSaveGameNote.mockResolvedValue(undefined);
    mockLaunch.mockResolvedValue(undefined);
    mockGetLaunchMode.mockResolvedValue("launcher");
    mockSetLaunchMode.mockResolvedValue(undefined);
    mockRemoveCustomGame.mockResolvedValue(undefined);
  });

  // ── Rendering ────────────────────────────────────────────────────

  it("renders the game title", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Elden Ring")).toBeInTheDocument();
  });

  it("renders dialog with correct aria label", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(
      screen.getByRole("dialog", { name: "Elden Ring details" }),
    ).toBeInTheDocument();
  });

  it("renders close button", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByLabelText("Close game details")).toBeInTheDocument();
  });

  // ── Quick Stats ──────────────────────────────────────────────────

  it("displays playtime in quick stats", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Playtime")).toBeInTheDocument();
    // 120 minutes = 2h
    expect(screen.getByText("2h")).toBeInTheDocument();
  });

  it("displays installed status", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Installed")).toBeInTheDocument();
  });

  it("displays not installed status for uninstalled games", () => {
    const uninstalled = makeGame({
      gameId: "game-2",
      name: "Dark Souls",
      isInstalled: false,
    });
    render(
      <GameDetail
        game={uninstalled}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Not Installed")).toBeInTheDocument();
  });

  it("displays last played info", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Last Played")).toBeInTheDocument();
  });

  it("displays size when sizeOnDisk is set", () => {
    const withSize = makeGame({
      gameId: "game-1",
      name: "Elden Ring",
      sizeOnDisk: 50_000_000_000,
    });
    render(
      <GameDetail
        game={withSize}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Size")).toBeInTheDocument();
  });

  // ── Action Buttons ───────────────────────────────────────────────

  it("shows Play button for installed Steam games", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Play")).toBeInTheDocument();
  });

  it("shows Install button for uninstalled Steam games", () => {
    const uninstalled = makeGame({
      gameId: "game-2",
      name: "Dark Souls",
      source: "steam",
      sourceId: "570940",
      isInstalled: false,
    });
    render(
      <GameDetail
        game={uninstalled}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Install")).toBeInTheDocument();
  });

  it("shows Launch button for non-Steam uninstalled games", () => {
    const epicGame = makeGame({
      gameId: "game-3",
      name: "Fortnite",
      source: "epic",
      sourceId: "epic-123",
      isInstalled: false,
    });
    render(
      <GameDetail
        game={epicGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Launch")).toBeInTheDocument();
  });

  it("shows Favorite button", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Favorite")).toBeInTheDocument();
  });

  it("shows Favorited state when game is favorited", () => {
    useFavoritesStore.setState({
      favorites: new Set(["game-1"]),
    });
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Favorited")).toBeInTheDocument();
  });

  it("shows Hide button", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Hide")).toBeInTheDocument();
  });

  it("shows Hidden state when game is hidden", () => {
    useHiddenGamesStore.setState({
      hiddenGames: new Set(["game-1"]),
    });
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Hidden")).toBeInTheDocument();
  });

  it("shows Manage Art button", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Manage Art")).toBeInTheDocument();
  });

  it("shows Uninstall button for installed Steam games", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Uninstall")).toBeInTheDocument();
  });

  // ── Manual Game Features ─────────────────────────────────────────

  it("shows Edit Game and Remove Game buttons for manual games", () => {
    const manualGame = makeGame({
      gameId: "custom-1",
      name: "My Custom Game",
      source: "manual",
      sourceId: "custom-1",
    });
    render(
      <GameDetail
        game={manualGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Edit Game")).toBeInTheDocument();
    expect(screen.getByText("Remove Game")).toBeInTheDocument();
  });

  it("does NOT show Edit/Remove buttons for non-manual games", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.queryByText("Edit Game")).not.toBeInTheDocument();
    expect(screen.queryByText("Remove Game")).not.toBeInTheDocument();
  });

  // ── Ratings ──────────────────────────────────────────────────────

  it("renders My Rating section", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("My Rating")).toBeInTheDocument();
  });

  it("shows clear rating button when game has a rating", () => {
    useRatingsStore.setState({
      ratings: new Map([
        ["game-1", { gameId: "game-1", rating: 8, review: null, updatedAt: Date.now() }],
      ]),
    });
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Clear rating")).toBeInTheDocument();
    // 8/2 = 4.0
    expect(screen.getByText("4.0")).toBeInTheDocument();
  });

  it("does not show clear rating button when no rating", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.queryByText("Clear rating")).not.toBeInTheDocument();
  });

  // ── Notes ────────────────────────────────────────────────────────

  it("renders Notes section toggle", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Notes")).toBeInTheDocument();
  });

  it("auto-opens notes when game has existing note", async () => {
    mockGetGameNote.mockResolvedValue({
      gameId: "game-1",
      content: "Remember to try the DLC",
    });
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Add notes about this game..."),
      ).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("Remember to try the DLC")).toBeInTheDocument();
  });

  it("shows notes textarea when Notes toggle is clicked", async () => {
    const user = userEvent.setup();
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );

    // Wait for note loading to finish
    await waitFor(() => {
      expect(mockGetGameNote).toHaveBeenCalledWith("game-1");
    });

    // Click the Notes section toggle to expand
    await user.click(screen.getByText("Notes"));

    expect(
      screen.getByPlaceholderText("Add notes about this game..."),
    ).toBeInTheDocument();
  });

  // ── Review ───────────────────────────────────────────────────────

  it("renders Review section toggle", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("shows review textarea when Review toggle is clicked", async () => {
    const user = userEvent.setup();
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );

    await user.click(screen.getByText("Review"));

    expect(
      screen.getByPlaceholderText("Write your review of this game..."),
    ).toBeInTheDocument();
  });

  // ── Metadata ─────────────────────────────────────────────────────

  it("displays description from metadata", () => {
    const meta = makeMeta("game-1", {
      developers: ["FromSoftware"],
      publishers: ["Bandai Namco"],
    });
    useMetadataStore.setState({
      cache: new Map([["game-1", { ...meta, shortDescription: "An action RPG." }]]),
    });
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("About")).toBeInTheDocument();
    expect(screen.getByText("An action RPG.")).toBeInTheDocument();
  });

  it("displays developer info from metadata", () => {
    const meta = makeMeta("game-1", {
      developers: ["FromSoftware"],
      publishers: ["Bandai Namco"],
    });
    useMetadataStore.setState({
      cache: new Map([["game-1", meta]]),
    });
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Developer")).toBeInTheDocument();
    expect(screen.getByText("FromSoftware")).toBeInTheDocument();
    expect(screen.getByText("Publisher")).toBeInTheDocument();
    expect(screen.getByText("Bandai Namco")).toBeInTheDocument();
  });

  it("displays genre tags from metadata", () => {
    const meta = makeMeta("game-1", {
      genres: [
        { id: "1", description: "Action" },
        { id: "2", description: "RPG" },
      ],
    });
    useMetadataStore.setState({
      cache: new Map([["game-1", meta]]),
    });
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Genres")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("RPG")).toBeInTheDocument();
  });

  it("displays metacritic score from metadata", () => {
    const meta = makeMeta("game-1", { metacriticScore: 94 });
    useMetadataStore.setState({
      cache: new Map([["game-1", meta]]),
    });
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Metacritic")).toBeInTheDocument();
    expect(screen.getByText("94")).toBeInTheDocument();
  });

  it("displays community tags from metadata", () => {
    const meta = makeMeta("game-1", {
      steamTags: [
        { name: "Souls-like", votes: 1000 },
        { name: "Open World", votes: 900 },
      ],
    });
    useMetadataStore.setState({
      cache: new Map([["game-1", meta]]),
    });
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Community Tags")).toBeInTheDocument();
    expect(screen.getByText("Souls-like")).toBeInTheDocument();
    expect(screen.getByText("Open World")).toBeInTheDocument();
  });

  // ── Close Behavior ───────────────────────────────────────────────

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );

    await user.click(screen.getByLabelText("Close game details"));
    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape is pressed", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when overlay backdrop is clicked", async () => {
    const user = userEvent.setup();
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );

    // Click on the overlay (dialog background)
    const overlay = screen.getByRole("dialog");
    await user.click(overlay);
    expect(mockOnClose).toHaveBeenCalled();
  });

  // ── Custom Tags ──────────────────────────────────────────────────

  it("shows 'Create tags in Settings' when no tags exist", () => {
    useTagsStore.setState({ tags: [], gameTagMap: new Map() });
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Custom Tags")).toBeInTheDocument();
    expect(screen.getByText("Create tags in Settings")).toBeInTheDocument();
  });

  // ── Shelves ──────────────────────────────────────────────────────

  it("renders shelf pin buttons when shelves exist", () => {
    useShelvesStore.setState({
      shelves: [
        {
          id: "shelf-1",
          name: "Playing Now",
          preset: "custom",
          filters: {} as never,
          sortBy: "name",
          sortOrder: "asc",
          displayMode: "expanded",
          groupByGenre: false,
          maxVisibleGames: null,
          pinnedGameIds: [],
        },
      ],
    });
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Shelves")).toBeInTheDocument();
    expect(screen.getByText("Playing Now")).toBeInTheDocument();
  });

  // ── Source info ──────────────────────────────────────────────────

  it("displays source and source ID", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText(/Steam/)).toBeInTheDocument();
    expect(screen.getByText(/1245620/)).toBeInTheDocument();
  });

  // ── Play Activity section ────────────────────────────────────────

  it("renders Play Activity section", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.getByText("Play Activity")).toBeInTheDocument();
  });

  // ── Error states with new invoke mock ────────────────────────────

  it("handles note loading failure gracefully", async () => {
    mockGetGameNote.mockRejectedValue(new Error("DB error"));
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );

    // Should not crash and should render normally
    await waitFor(() => {
      expect(screen.getByText("Elden Ring")).toBeInTheDocument();
    });
  });

  it("handles launch mode API failure gracefully for non-Steam games", async () => {
    mockGetLaunchMode.mockRejectedValue(new Error("Not found"));
    const epicGame = makeGame({
      gameId: "game-3",
      name: "Hades",
      source: "epic",
      sourceId: "epic-hades",
      isInstalled: true,
    });

    render(
      <GameDetail
        game={epicGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );

    // Should not crash and render normally
    await waitFor(() => {
      expect(screen.getByText("Hades")).toBeInTheDocument();
    });
  });

  // ── Using mockInvokeCommand for command-specific responses ───────

  it("uses mockInvokeCommand for cover art resolution", async () => {
    mockInvokeCommand("get_cover_art_url", "http://example.com/hero.jpg");

    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );

    // Component should render without errors
    await waitFor(() => {
      expect(screen.getByText("Elden Ring")).toBeInTheDocument();
    });
  });

  it("uses mockInvokeError to simulate cover art failure", async () => {
    mockInvokeError("get_cover_art_url", "Network timeout");

    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );

    // Component should still render game info even with image error
    await waitFor(() => {
      expect(screen.getByText("Elden Ring")).toBeInTheDocument();
    });
  });

  // ── Launch mode toggle (non-Steam, non-manual) ──────────────────

  it("shows launch mode selector for Epic games", async () => {
    const epicGame = makeGame({
      gameId: "game-epic",
      name: "Hades",
      source: "epic",
      sourceId: "epic-hades",
      isInstalled: true,
    });

    render(
      <GameDetail
        game={epicGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Launch via")).toBeInTheDocument();
    });
  });

  it("does NOT show launch mode selector for Steam games", () => {
    render(
      <GameDetail
        game={defaultGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.queryByText("Launch via")).not.toBeInTheDocument();
  });

  it("does NOT show launch mode selector for manual games", () => {
    const manualGame = makeGame({
      gameId: "custom-1",
      name: "Custom",
      source: "manual",
      sourceId: "custom-1",
    });
    render(
      <GameDetail
        game={manualGame}
        onClose={mockOnClose}
        onPersistShelves={mockOnPersistShelves}
      />,
    );
    expect(screen.queryByText("Launch via")).not.toBeInTheDocument();
  });
});
