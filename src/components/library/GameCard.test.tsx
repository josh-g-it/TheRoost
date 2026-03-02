import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameCard } from "./GameCard";
import { makeGame } from "../../test/factories";
import { clearInvokeMocks } from "../../test/setup";
import { useSettingsStore } from "../../store/settingsSlice";
import { useTagsStore } from "../../store/tagsSlice";
import { useRatingsStore } from "../../store/ratingsSlice";
import { useUIStore } from "../../store/uiSlice";
import { useShelvesStore } from "../../store/shelvesSlice";
import { useInstallStore } from "../../store/installSlice";
import type { CardDisplayOptions, Tag } from "../../types";

// Mock services
vi.mock("../../services/tauri", () => ({
  coverArtApi: {
    getCoverArtUrl: vi.fn().mockResolvedValue(null),
  },
  steamInstallApi: {
    installGame: vi.fn(),
    uninstallGame: vi.fn(),
    updateGame: vi.fn(),
  },
}));

// Mock logger
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("GameCard", () => {
  const mockOnClick = vi.fn();
  const mockOnToggleFavorite = vi.fn();
  const mockOnToggleHidden = vi.fn();
  const mockOnPersistShelves = vi.fn();

  const defaultGame = makeGame({
    gameId: "game-1",
    name: "Elden Ring",
    source: "steam",
    sourceId: "1245620",
    playtimeForever: 120,
    isInstalled: true,
  });

  const defaultCardDisplay: CardDisplayOptions = {
    showPlaytime: true,
    showInstalledBadge: true,
    showRatingBadge: true,
    showGenreTags: true,
    showTags: true,
    gridSize: "medium",
    listDensity: "default",
    listColumns: [],
  };

  const defaultProps = {
    game: defaultGame,
    onClick: mockOnClick,
    cardDisplay: defaultCardDisplay,
    isFavorite: false,
    onToggleFavorite: mockOnToggleFavorite,
    isHidden: false,
    onToggleHidden: mockOnToggleHidden,
    onPersistShelves: mockOnPersistShelves,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearInvokeMocks();

    useSettingsStore.setState({
      settings: { iconSet: "classic" } as never,
    });
    useTagsStore.setState({
      tags: [],
      gameTagMap: new Map(),
    });
    useRatingsStore.setState({
      ratings: new Map(),
    });
    useUIStore.setState({
      artVersion: {},
    });
    useShelvesStore.setState({
      shelves: [],
    });
    useInstallStore.setState({
      activeInstalls: new Map(),
    });
  });

  // ── Basic Rendering ──────────────────────────────────────────────

  it("renders the game name", () => {
    render(<GameCard {...defaultProps} />);
    expect(screen.getByText("Elden Ring")).toBeInTheDocument();
  });

  it("renders as a button role", () => {
    render(<GameCard {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Elden Ring/i })).toBeInTheDocument();
  });

  it("calls onClick when card is clicked", async () => {
    const user = userEvent.setup();
    render(<GameCard {...defaultProps} />);

    await user.click(screen.getByText("Elden Ring"));
    expect(mockOnClick).toHaveBeenCalledOnce();
  });

  it("calls onClick on Enter key", () => {
    render(<GameCard {...defaultProps} />);

    const card = screen.getByRole("button", { name: /Elden Ring/i });
    fireEvent.keyDown(card, { key: "Enter" });
    expect(mockOnClick).toHaveBeenCalledOnce();
  });

  it("calls onClick on Space key", () => {
    render(<GameCard {...defaultProps} />);

    const card = screen.getByRole("button", { name: /Elden Ring/i });
    fireEvent.keyDown(card, { key: " " });
    expect(mockOnClick).toHaveBeenCalledOnce();
  });

  // ── Playtime Display ─────────────────────────────────────────────

  it("shows playtime when showPlaytime is true", () => {
    render(<GameCard {...defaultProps} />);
    // 120 minutes = 2h
    expect(screen.getByText("2h")).toBeInTheDocument();
  });

  it("hides playtime when showPlaytime is false", () => {
    render(
      <GameCard
        {...defaultProps}
        cardDisplay={{ ...defaultCardDisplay, showPlaytime: false }}
      />,
    );
    expect(screen.queryByText("2h")).not.toBeInTheDocument();
  });

  // ── Installed Badge ──────────────────────────────────────────────

  it("shows Installed badge when game is installed and badge is enabled", () => {
    render(<GameCard {...defaultProps} />);
    expect(screen.getByText("Installed")).toBeInTheDocument();
  });

  it("hides Installed badge when game is not installed", () => {
    const uninstalled = makeGame({
      gameId: "game-2",
      name: "Dark Souls",
      isInstalled: false,
    });
    render(<GameCard {...defaultProps} game={uninstalled} />);
    expect(screen.queryByText("Installed")).not.toBeInTheDocument();
  });

  it("hides Installed badge when showInstalledBadge is false", () => {
    render(
      <GameCard
        {...defaultProps}
        cardDisplay={{ ...defaultCardDisplay, showInstalledBadge: false }}
      />,
    );
    expect(screen.queryByText("Installed")).not.toBeInTheDocument();
  });

  // ── Favorite Button ──────────────────────────────────────────────

  it("shows favorite button with correct aria label when not favorited", () => {
    render(<GameCard {...defaultProps} />);
    expect(screen.getByLabelText("Add to favorites")).toBeInTheDocument();
  });

  it("shows favorite button with correct aria label when favorited", () => {
    render(<GameCard {...defaultProps} isFavorite={true} />);
    expect(screen.getByLabelText("Remove from favorites")).toBeInTheDocument();
  });

  it("calls onToggleFavorite when favorite button is clicked", async () => {
    const user = userEvent.setup();
    render(<GameCard {...defaultProps} />);

    await user.click(screen.getByLabelText("Add to favorites"));
    expect(mockOnToggleFavorite).toHaveBeenCalledOnce();
    // Should NOT also trigger card onClick
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  // ── Art Management Button ────────────────────────────────────────

  it("renders art management button", () => {
    render(<GameCard {...defaultProps} />);
    expect(screen.getByLabelText("Manage game art")).toBeInTheDocument();
  });

  // ── Rating Badge ─────────────────────────────────────────────────

  it("shows rating badge when ratingValue is set and enabled", () => {
    render(<GameCard {...defaultProps} ratingValue={8} />);
    // 8/2 = 4.0
    expect(screen.getByText("4.0")).toBeInTheDocument();
  });

  it("hides rating badge when ratingValue is 0", () => {
    render(<GameCard {...defaultProps} ratingValue={0} />);
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
  });

  it("hides rating badge when showRatingBadge is false", () => {
    render(
      <GameCard
        {...defaultProps}
        ratingValue={8}
        cardDisplay={{ ...defaultCardDisplay, showRatingBadge: false }}
      />,
    );
    expect(screen.queryByText("4.0")).not.toBeInTheDocument();
  });

  // ── Genre Tags ───────────────────────────────────────────────────

  it("shows genre tags when provided and enabled", () => {
    render(
      <GameCard
        {...defaultProps}
        genres={[
          { id: "1", description: "Action" },
          { id: "2", description: "RPG" },
        ]}
      />,
    );
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("RPG")).toBeInTheDocument();
  });

  it("limits genre tags to 2", () => {
    render(
      <GameCard
        {...defaultProps}
        genres={[
          { id: "1", description: "Action" },
          { id: "2", description: "RPG" },
          { id: "3", description: "Adventure" },
        ]}
      />,
    );
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("RPG")).toBeInTheDocument();
    expect(screen.queryByText("Adventure")).not.toBeInTheDocument();
  });

  it("hides genre tags when showGenreTags is false", () => {
    render(
      <GameCard
        {...defaultProps}
        genres={[{ id: "1", description: "Action" }]}
        cardDisplay={{ ...defaultCardDisplay, showGenreTags: false }}
      />,
    );
    expect(screen.queryByText("Action")).not.toBeInTheDocument();
  });

  // ── User Tags ────────────────────────────────────────────────────

  it("shows user tags when provided and enabled", () => {
    const tags: Tag[] = [
      { id: 1, name: "Backlog", colorIndex: 0, sortOrder: 0 },
      { id: 2, name: "Completed", colorIndex: 1, sortOrder: 1 },
    ];
    render(<GameCard {...defaultProps} userTags={tags} />);
    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("limits user tags to 3", () => {
    const tags: Tag[] = [
      { id: 1, name: "Tag1", colorIndex: 0, sortOrder: 0 },
      { id: 2, name: "Tag2", colorIndex: 1, sortOrder: 1 },
      { id: 3, name: "Tag3", colorIndex: 2, sortOrder: 2 },
      { id: 4, name: "Tag4", colorIndex: 3, sortOrder: 3 },
    ];
    render(<GameCard {...defaultProps} userTags={tags} />);
    expect(screen.getByText("Tag1")).toBeInTheDocument();
    expect(screen.getByText("Tag2")).toBeInTheDocument();
    expect(screen.getByText("Tag3")).toBeInTheDocument();
    expect(screen.queryByText("Tag4")).not.toBeInTheDocument();
  });

  it("hides user tags when showTags is false", () => {
    const tags: Tag[] = [{ id: 1, name: "Backlog", colorIndex: 0, sortOrder: 0 }];
    render(
      <GameCard
        {...defaultProps}
        userTags={tags}
        cardDisplay={{ ...defaultCardDisplay, showTags: false }}
      />,
    );
    expect(screen.queryByText("Backlog")).not.toBeInTheDocument();
  });

  // ── Context Menu ─────────────────────────────────────────────────

  it("opens context menu on right-click", () => {
    render(<GameCard {...defaultProps} />);

    const card = screen.getByRole("button", { name: /Elden Ring/i });
    fireEvent.contextMenu(card);

    // Context menu should contain "Hide game" option
    expect(screen.getByText("Hide game")).toBeInTheDocument();
  });

  it("shows Unhide option when game is hidden", () => {
    render(<GameCard {...defaultProps} isHidden={true} />);

    const card = screen.getByRole("button", { name: /Elden Ring/i });
    fireEvent.contextMenu(card);

    expect(screen.getByText("Unhide game")).toBeInTheDocument();
  });

  it("calls onToggleHidden when Hide is clicked from context menu", async () => {
    const user = userEvent.setup();
    render(<GameCard {...defaultProps} />);

    const card = screen.getByRole("button", { name: /Elden Ring/i });
    fireEvent.contextMenu(card);

    await user.click(screen.getByText("Hide game"));
    expect(mockOnToggleHidden).toHaveBeenCalledOnce();
  });

  it("shows Uninstall Game option for installed Steam games", () => {
    render(<GameCard {...defaultProps} />);

    const card = screen.getByRole("button", { name: /Elden Ring/i });
    fireEvent.contextMenu(card);

    expect(screen.getByText("Uninstall Game")).toBeInTheDocument();
  });

  it("shows Install Game option for uninstalled Steam games", () => {
    const uninstalled = makeGame({
      gameId: "game-2",
      name: "Dark Souls",
      source: "steam",
      sourceId: "570940",
      isInstalled: false,
    });
    render(<GameCard {...defaultProps} game={uninstalled} />);

    const card = screen.getByRole("button", { name: /Dark Souls/i });
    fireEvent.contextMenu(card);

    expect(screen.getByText("Install Game")).toBeInTheDocument();
  });

  it("does NOT show install/uninstall for non-Steam games", () => {
    const epicGame = makeGame({
      gameId: "game-3",
      name: "Hades",
      source: "epic",
      sourceId: "epic-1",
    });
    render(<GameCard {...defaultProps} game={epicGame} />);

    const card = screen.getByRole("button", { name: /Hades/i });
    fireEvent.contextMenu(card);

    expect(screen.queryByText("Install Game")).not.toBeInTheDocument();
    expect(screen.queryByText("Uninstall Game")).not.toBeInTheDocument();
  });

  it("shows rating section in context menu", () => {
    render(<GameCard {...defaultProps} />);

    const card = screen.getByRole("button", { name: /Elden Ring/i });
    fireEvent.contextMenu(card);

    expect(screen.getByText("Rate")).toBeInTheDocument();
  });

  it("shows clear rating in context menu when game has rating", () => {
    render(<GameCard {...defaultProps} ratingValue={8} />);

    const card = screen.getByRole("button", { name: /Elden Ring/i });
    fireEvent.contextMenu(card);

    expect(screen.getByText("Clear rating")).toBeInTheDocument();
  });

  it("shows Custom Tags section in context menu when tags exist", () => {
    useTagsStore.setState({
      tags: [
        { id: 1, name: "Backlog", colorIndex: 0, sortOrder: 0 },
        { id: 2, name: "Favorite", colorIndex: 1, sortOrder: 1 },
      ],
      gameTagMap: new Map(),
    });

    render(<GameCard {...defaultProps} />);

    const card = screen.getByRole("button", { name: /Elden Ring/i });
    fireEvent.contextMenu(card);

    expect(screen.getByText("Custom Tags")).toBeInTheDocument();
    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("Favorite")).toBeInTheDocument();
  });

  it("shows Shelves section in context menu when shelves exist", () => {
    useShelvesStore.setState({
      shelves: [
        {
          id: "s1",
          name: "Now Playing",
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

    render(<GameCard {...defaultProps} />);

    const card = screen.getByRole("button", { name: /Elden Ring/i });
    fireEvent.contextMenu(card);

    expect(screen.getByText("Shelves")).toBeInTheDocument();
    expect(screen.getByText("Now Playing")).toBeInTheDocument();
  });

  it("closes context menu on outside click", async () => {
    render(<GameCard {...defaultProps} />);

    const card = screen.getByRole("button", { name: /Elden Ring/i });
    fireEvent.contextMenu(card);

    expect(screen.getByText("Hide game")).toBeInTheDocument();

    // Click outside the menu (on body)
    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("Hide game")).not.toBeInTheDocument();
  });

  // ── Zero playtime ────────────────────────────────────────────────

  it("shows 'Never played' when playtime is zero", () => {
    const neverPlayed = makeGame({
      gameId: "game-0",
      name: "New Game",
      playtimeForever: 0,
    });
    render(<GameCard {...defaultProps} game={neverPlayed} />);
    expect(screen.getByText("Never played")).toBeInTheDocument();
  });
});
