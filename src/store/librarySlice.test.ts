import { describe, it, expect, vi, beforeEach } from "vitest";
import { mergeGames, useLibraryStore } from "./librarySlice";
import { makeGame } from "../test/factories";

const mockGetFullLibrary = vi.fn();
const mockScanLocalLibrary = vi.fn();
const mockScanExternalGames = vi.fn();

vi.mock("../services/tauri", () => ({
  steamApi: {
    getFullLibrary: (...args: unknown[]) => mockGetFullLibrary(...args),
    scanLocalLibrary: (...args: unknown[]) => mockScanLocalLibrary(...args),
  },
  externalApi: {
    scanExternalGames: (...args: unknown[]) => mockScanExternalGames(...args),
  },
}));

describe("mergeGames", () => {
  it("returns empty array for two empty arrays", () => {
    expect(mergeGames([], [])).toEqual([]);
  });

  it("returns primary games when secondary is empty", () => {
    const primary = [
      makeGame({ gameId: "g1", name: "Alpha", source: "steam", sourceId: "100" }),
    ];
    const result = mergeGames(primary, []);
    expect(result).toHaveLength(1);
    expect(result[0].gameId).toBe("g1");
  });

  it("returns secondary games when primary is empty", () => {
    const secondary = [
      makeGame({ gameId: "g2", name: "Beta", source: "epic", sourceId: "200" }),
    ];
    const result = mergeGames([], secondary);
    expect(result).toHaveLength(1);
    expect(result[0].gameId).toBe("g2");
  });

  it("merges non-overlapping games", () => {
    const primary = [
      makeGame({ gameId: "g1", name: "Alpha", source: "steam", sourceId: "100" }),
    ];
    const secondary = [
      makeGame({ gameId: "g2", name: "Beta", source: "epic", sourceId: "200" }),
    ];
    const result = mergeGames(primary, secondary);
    expect(result).toHaveLength(2);
  });

  it("deduplicates by source:sourceId — primary wins", () => {
    const primary = [
      makeGame({
        gameId: "g1",
        name: "Portal (Steam)",
        source: "steam",
        sourceId: "400",
      }),
    ];
    const secondary = [
      makeGame({ gameId: "g2", name: "Portal (Dupe)", source: "steam", sourceId: "400" }),
    ];
    const result = mergeGames(primary, secondary);
    expect(result).toHaveLength(1);
    expect(result[0].gameId).toBe("g1"); // primary kept
    expect(result[0].name).toBe("Portal (Steam)");
  });

  it("allows same sourceId from different sources", () => {
    const primary = [
      makeGame({ gameId: "g1", name: "Game A", source: "steam", sourceId: "100" }),
    ];
    const secondary = [
      makeGame({ gameId: "g2", name: "Game B", source: "epic", sourceId: "100" }),
    ];
    const result = mergeGames(primary, secondary);
    expect(result).toHaveLength(2); // different source, so not duplicates
  });

  it("sorts result alphabetically by name (case-insensitive)", () => {
    const primary = [
      makeGame({ gameId: "g1", name: "Zelda", source: "steam", sourceId: "1" }),
      makeGame({ gameId: "g2", name: "alpha", source: "steam", sourceId: "2" }),
    ];
    const secondary = [
      makeGame({ gameId: "g3", name: "Mario", source: "epic", sourceId: "3" }),
    ];
    const result = mergeGames(primary, secondary);
    expect(result.map((g) => g.name)).toEqual(["alpha", "Mario", "Zelda"]);
  });

  it("does not mutate input arrays", () => {
    const primary = [
      makeGame({ gameId: "g1", name: "A", source: "steam", sourceId: "1" }),
    ];
    const secondary = [
      makeGame({ gameId: "g2", name: "B", source: "epic", sourceId: "2" }),
    ];
    const origPrimaryLen = primary.length;
    const origSecondaryLen = secondary.length;
    mergeGames(primary, secondary);
    expect(primary).toHaveLength(origPrimaryLen);
    expect(secondary).toHaveLength(origSecondaryLen);
  });
});

// ── useLibraryStore ────────────────────────────────────────────

describe("useLibraryStore", () => {
  beforeEach(() => {
    useLibraryStore.setState({ library: null, isLoading: false, error: null });
    vi.clearAllMocks();
  });

  describe("refreshLibrary", () => {
    it("merges Steam + external games on success", async () => {
      const steamGames = [
        makeGame({ gameId: "g1", name: "Steam Game", source: "steam", sourceId: "1" }),
      ];
      const externalGames = [
        makeGame({ gameId: "g2", name: "Epic Game", source: "epic", sourceId: "2" }),
      ];

      mockGetFullLibrary.mockResolvedValue({
        games: steamGames,
        totalCount: 1,
        warnings: [],
      });
      mockScanExternalGames.mockResolvedValue({
        games: externalGames,
        totalCount: 1,
        warnings: [],
      });

      await useLibraryStore.getState().refreshLibrary("id");

      const state = useLibraryStore.getState();
      expect(state.library?.games).toHaveLength(2);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("handles Steam failure gracefully (external still loads)", async () => {
      mockGetFullLibrary.mockRejectedValue(new Error("Steam down"));
      const externalGames = [
        makeGame({ gameId: "g2", name: "Epic Game", source: "epic", sourceId: "2" }),
      ];
      mockScanExternalGames.mockResolvedValue({
        games: externalGames,
        totalCount: 1,
        warnings: [],
      });

      await useLibraryStore.getState().refreshLibrary("id");

      const state = useLibraryStore.getState();
      expect(state.library?.games).toHaveLength(1);
      expect(state.library?.warnings.some((w) => w.includes("Steam scan failed"))).toBe(
        true,
      );
    });

    it("handles external failure gracefully (Steam still loads)", async () => {
      const steamGames = [
        makeGame({ gameId: "g1", name: "Steam Game", source: "steam", sourceId: "1" }),
      ];
      mockGetFullLibrary.mockResolvedValue({
        games: steamGames,
        totalCount: 1,
        warnings: [],
      });
      mockScanExternalGames.mockRejectedValue(new Error("external down"));

      await useLibraryStore.getState().refreshLibrary("id");

      const state = useLibraryStore.getState();
      expect(state.library?.games).toHaveLength(1);
      expect(state.library?.games[0].name).toBe("Steam Game");
    });

    it("skips if already loading", async () => {
      useLibraryStore.setState({ isLoading: true });
      await useLibraryStore.getState().refreshLibrary("id");
      expect(mockGetFullLibrary).not.toHaveBeenCalled();
    });
  });

  describe("scanLocalOnly", () => {
    it("merges local Steam + external games", async () => {
      const localGames = [
        makeGame({ gameId: "g1", name: "Local Game", source: "steam", sourceId: "1" }),
      ];
      const externalGames = [
        makeGame({ gameId: "g2", name: "GOG Game", source: "gog", sourceId: "2" }),
      ];

      mockScanLocalLibrary.mockResolvedValue(localGames);
      mockScanExternalGames.mockResolvedValue({
        games: externalGames,
        totalCount: 1,
        warnings: [],
      });

      await useLibraryStore.getState().scanLocalOnly();

      const state = useLibraryStore.getState();
      expect(state.library?.games).toHaveLength(2);
      expect(state.isLoading).toBe(false);
    });

    it("skips if already loading", async () => {
      useLibraryStore.setState({ isLoading: true });
      await useLibraryStore.getState().scanLocalOnly();
      expect(mockScanLocalLibrary).not.toHaveBeenCalled();
    });
  });

  describe("addGame", () => {
    it("adds a game to the library", () => {
      const existing = makeGame({
        gameId: "g1",
        name: "Existing",
        source: "steam",
        sourceId: "1",
      });
      useLibraryStore.setState({
        library: { games: [existing], totalCount: 1, warnings: [] },
      });

      const newGame = makeGame({
        gameId: "g2",
        name: "New",
        source: "epic",
        sourceId: "2",
      });
      useLibraryStore.getState().addGame(newGame);

      expect(useLibraryStore.getState().library?.games).toHaveLength(2);
      expect(useLibraryStore.getState().library?.totalCount).toBe(2);
    });

    it("does nothing when library is null", () => {
      useLibraryStore.getState().addGame(makeGame({ gameId: "g1", name: "Test" }));
      expect(useLibraryStore.getState().library).toBeNull();
    });
  });

  describe("removeGame", () => {
    it("removes a game by gameId", () => {
      const games = [
        makeGame({ gameId: "g1", name: "A" }),
        makeGame({ gameId: "g2", name: "B" }),
      ];
      useLibraryStore.setState({
        library: { games, totalCount: 2, warnings: [] },
      });

      useLibraryStore.getState().removeGame("g1");

      const state = useLibraryStore.getState();
      expect(state.library?.games).toHaveLength(1);
      expect(state.library?.games[0].gameId).toBe("g2");
      expect(state.library?.totalCount).toBe(1);
    });

    it("does nothing when library is null", () => {
      useLibraryStore.getState().removeGame("g1");
      expect(useLibraryStore.getState().library).toBeNull();
    });
  });

  describe("clearError", () => {
    it("clears the error state", () => {
      useLibraryStore.setState({ error: "some error" });
      useLibraryStore.getState().clearError();
      expect(useLibraryStore.getState().error).toBeNull();
    });
  });
});
