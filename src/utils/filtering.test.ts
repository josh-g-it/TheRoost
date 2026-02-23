import { describe, it, expect } from "vitest";
import { filterGames, extractAllGenres, extractAllSources } from "./filtering";
import type { StoreMetadata } from "../types";
import { makeGame, makeFilters, makeMeta } from "../test/factories";

const games = [
  makeGame({ gameId: "g1", name: "Portal 2", isInstalled: true }),
  makeGame({ gameId: "g2", name: "Dota 2", isInstalled: false }),
  makeGame({ gameId: "g3", name: "Half-Life", isInstalled: true }),
];

describe("filterGames", () => {
  it("returns all games with no filters", () => {
    const result = filterGames(games, makeFilters());
    expect(result).toHaveLength(3);
  });

  it("filters by search query (case-insensitive)", () => {
    const result = filterGames(games, makeFilters({ searchQuery: "portal" }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Portal 2");
  });

  it("filters installed only", () => {
    const result = filterGames(games, makeFilters({ showInstalledOnly: true }));
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.name)).toEqual(["Portal 2", "Half-Life"]);
  });

  it("filters favorites only", () => {
    const favorites = new Set(["g2"]);
    const result = filterGames(
      games,
      makeFilters({ showFavoritesOnly: true }),
      favorites,
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Dota 2");
  });

  it("excludes hidden games by default", () => {
    const hidden = new Set(["g1", "g3"]);
    const result = filterGames(games, makeFilters(), undefined, undefined, hidden);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Dota 2");
  });

  it("shows only hidden games when showHiddenOnly is true", () => {
    const hidden = new Set(["g1"]);
    const result = filterGames(
      games,
      makeFilters({ showHiddenOnly: true }),
      undefined,
      undefined,
      hidden,
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Portal 2");
  });

  it("filters by tag IDs (OR logic)", () => {
    const gameTagMap = new Map<string, number[]>([
      ["g1", [10, 20]],
      ["g2", [30]],
      ["g3", [10]],
    ]);
    const result = filterGames(
      games,
      makeFilters({ filterByTagIds: [20, 30] }),
      undefined,
      gameTagMap,
    );
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.gameId)).toEqual(["g1", "g2"]);
  });

  it("filters by genre IDs (OR logic)", () => {
    const cache = new Map<string, StoreMetadata>([
      ["g1", makeMeta("g1", { genres: [{ id: "1", description: "Action" }] })],
      ["g2", makeMeta("g2", { genres: [{ id: "2", description: "Strategy" }] })],
      [
        "g3",
        makeMeta("g3", {
          genres: [
            { id: "1", description: "Action" },
            { id: "3", description: "RPG" },
          ],
        }),
      ],
    ]);
    const result = filterGames(
      games,
      makeFilters({ filterByGenreIds: ["2", "3"] }),
      undefined,
      undefined,
      undefined,
      cache,
    );
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.gameId)).toEqual(["g2", "g3"]);
  });

  it("excludes games with no metadata when genre filter is active", () => {
    const cache = new Map<string, StoreMetadata>([
      ["g1", makeMeta("g1", { genres: [{ id: "1", description: "Action" }] })],
    ]);
    const result = filterGames(
      games,
      makeFilters({ filterByGenreIds: ["1"] }),
      undefined,
      undefined,
      undefined,
      cache,
    );
    expect(result).toHaveLength(1);
    expect(result[0].gameId).toBe("g1");
  });

  it("combines multiple filters", () => {
    const result = filterGames(
      games,
      makeFilters({ searchQuery: "half", showInstalledOnly: true }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Half-Life");
  });

  it("filters by source (OR logic)", () => {
    const mixed = [
      makeGame({ gameId: "g1", name: "A Game", source: "steam" }),
      makeGame({ gameId: "g2", name: "B Game", source: "epic" }),
      makeGame({ gameId: "g3", name: "C Game", source: "gog" }),
    ];
    const result = filterGames(mixed, makeFilters({ filterBySource: ["steam", "epic"] }));
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.source).sort()).toEqual(["epic", "steam"]);
  });

  it("empty filterBySource returns all games", () => {
    const result = filterGames(games, makeFilters({ filterBySource: [] }));
    expect(result).toHaveLength(3);
  });
});

describe("extractAllGenres", () => {
  it("returns empty array for empty cache", () => {
    expect(extractAllGenres(new Map())).toEqual([]);
  });

  it("extracts and deduplicates genres, sorted by frequency", () => {
    const cache = new Map<string, StoreMetadata>([
      [
        "g1",
        makeMeta("g1", {
          genres: [
            { id: "1", description: "Action" },
            { id: "2", description: "RPG" },
          ],
        }),
      ],
      [
        "g2",
        makeMeta("g2", {
          genres: [
            { id: "2", description: "RPG" },
            { id: "3", description: "Indie" },
          ],
        }),
      ],
    ]);
    const genres = extractAllGenres(cache);
    expect(genres).toEqual([
      { id: "2", description: "RPG", count: 2 },
      { id: "1", description: "Action", count: 1 },
      { id: "3", description: "Indie", count: 1 },
    ]);
  });
});

describe("extractAllSources", () => {
  it("counts games per source, sorted by frequency", () => {
    const mixed = [
      makeGame({ gameId: "g1", name: "A", source: "steam" }),
      makeGame({ gameId: "g2", name: "B", source: "epic" }),
      makeGame({ gameId: "g3", name: "C", source: "steam" }),
    ];
    const result = extractAllSources(mixed);
    expect(result).toEqual([
      { source: "steam", count: 2 },
      { source: "epic", count: 1 },
    ]);
  });

  it("returns empty array for empty games", () => {
    expect(extractAllSources([])).toEqual([]);
  });
});
