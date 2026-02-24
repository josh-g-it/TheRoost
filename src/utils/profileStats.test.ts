import { describe, it, expect } from "vitest";
import type { StoreMetadata } from "../types";
import {
  computeGenreDNA,
  computePlaytimeDistribution,
  computeMetacriticScatter,
  computeDevPubLeaderboard,
  computeQuickStats,
  countryCodeToFlag,
  filterGamesBySource,
  filterGamesByGenre,
  filterGamesBySteamTag,
  filterGamesByCategory,
  filterGamesByTags,
  applyProfileChartFilters,
  getGamesForGenre,
  getGamesForDevPub,
} from "./profileStats";
import { EMPTY_PROFILE_CHART_FILTERS } from "../types/ui";
import { makeGame, makeMeta } from "../test/factories";

const games = [
  makeGame({ gameId: "g1", name: "Game A", playtimeForever: 600 }), // 10h
  makeGame({ gameId: "g2", name: "Game B", playtimeForever: 120 }), // 2h
  makeGame({ gameId: "g3", name: "Game C", playtimeForever: 0 }), // 0h
];

const cache = new Map<string, StoreMetadata>([
  [
    "g1",
    makeMeta("g1", {
      genres: [
        { id: "1", description: "Action" },
        { id: "2", description: "RPG" },
      ],
      metacriticScore: 90,
      developers: ["Dev A"],
      publishers: ["Pub X"],
    }),
  ],
  [
    "g2",
    makeMeta("g2", {
      genres: [{ id: "1", description: "Action" }],
      metacriticScore: 75,
      developers: ["Dev A", "Dev B"],
      publishers: ["Pub X"],
    }),
  ],
  [
    "g3",
    makeMeta("g3", {
      genres: [{ id: "3", description: "Indie" }],
      developers: ["Dev B"],
      publishers: ["Pub Y"],
    }),
  ],
]);

describe("computeGenreDNA", () => {
  it("returns empty array for no games", () => {
    expect(computeGenreDNA([], new Map())).toEqual([]);
  });

  it("computes genre playtime and normalizes to 100", () => {
    const result = computeGenreDNA(games, cache);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].normalized).toBe(100); // top genre is max
    expect(result[0].genre).toBe("Action"); // 10h + 2h = 12h
  });

  it("respects topN parameter", () => {
    const result = computeGenreDNA(games, cache, 2);
    expect(result).toHaveLength(2);
  });

  it("returns fewer than topN when not enough genres", () => {
    const result = computeGenreDNA(games, cache, 20);
    expect(result).toHaveLength(3); // Action, RPG, Indie
  });
});

describe("computePlaytimeDistribution", () => {
  it("places zero-playtime games in 'Never Played'", () => {
    const result = computePlaytimeDistribution(games);
    const neverPlayed = result.find((b) => b.label === "Never Played");
    expect(neverPlayed?.count).toBe(1);
    expect(neverPlayed?.games[0].gameId).toBe("g3");
  });

  it("uses default preset (6 buckets)", () => {
    const result = computePlaytimeDistribution(games, "default");
    expect(result).toHaveLength(6);
  });

  it("uses simple preset (4 buckets)", () => {
    const result = computePlaytimeDistribution(games, "simple");
    expect(result).toHaveLength(4);
  });

  it("uses detailed preset (8 buckets)", () => {
    const result = computePlaytimeDistribution(games, "detailed");
    expect(result).toHaveLength(8);
  });

  it("total game count matches input", () => {
    const result = computePlaytimeDistribution(games);
    const total = result.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(games.length);
  });

  it("sorts games within buckets by playtime descending", () => {
    const manyGames = [
      makeGame({ gameId: "g10", name: "X", playtimeForever: 180 }), // 3h
      makeGame({ gameId: "g11", name: "Y", playtimeForever: 300 }), // 5h
      makeGame({ gameId: "g12", name: "Z", playtimeForever: 120 }), // 2h
    ];
    const result = computePlaytimeDistribution(manyGames);
    const bucket = result.find(
      (b) => b.count >= 2 && b.games.some((g) => g.gameId === "g10"),
    );
    if (bucket && bucket.games.length >= 2) {
      expect(bucket.games[0].playtime).toBeGreaterThanOrEqual(bucket.games[1].playtime);
    }
  });
});

describe("computeMetacriticScatter", () => {
  it("only includes games with metacritic scores", () => {
    const result = computeMetacriticScatter(games, cache);
    expect(result).toHaveLength(2); // games 1 and 2 have scores
  });

  it("returns correct score and playtime", () => {
    const result = computeMetacriticScatter(games, cache);
    const gameA = result.find((p) => p.gameId === "g1");
    expect(gameA?.metacritic).toBe(90);
    expect(gameA?.playtimeHours).toBe(10);
  });

  it("returns empty for no metadata", () => {
    expect(computeMetacriticScatter(games, new Map())).toEqual([]);
  });
});

describe("computeDevPubLeaderboard", () => {
  it("computes developer leaderboard", () => {
    const result = computeDevPubLeaderboard(games, cache, "developer");
    expect(result[0].name).toBe("Dev A"); // 10h + 2h = 12h
    expect(result[0].gameCount).toBe(2);
  });

  it("computes publisher leaderboard", () => {
    const result = computeDevPubLeaderboard(games, cache, "publisher");
    expect(result[0].name).toBe("Pub X"); // 10h + 2h = 12h
    expect(result[0].gameCount).toBe(2);
  });

  it("respects topN parameter", () => {
    const result = computeDevPubLeaderboard(games, cache, "developer", 1);
    expect(result).toHaveLength(1);
  });

  it("sorts by total hours descending", () => {
    const result = computeDevPubLeaderboard(games, cache, "developer");
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].totalHours).toBeGreaterThanOrEqual(result[i].totalHours);
    }
  });
});

describe("computeQuickStats", () => {
  it("returns zeros for empty games array", () => {
    const result = computeQuickStats([], new Map(), new Set());
    expect(result.totalGames).toBe(0);
    expect(result.mostPlayedGame).toBeNull();
    expect(result.averagePlaytime).toBe(0);
  });

  it("computes most played game", () => {
    const result = computeQuickStats(games, cache, new Set());
    expect(result.mostPlayedGame?.name).toBe("Game A");
  });

  it("computes average and median playtime", () => {
    const result = computeQuickStats(games, cache, new Set());
    expect(result.totalGames).toBe(3);
    expect(result.averagePlaytime).toBeGreaterThan(0);
    expect(result.medianPlaytime).toBe(2); // median of [0, 2, 10] = 2
  });

  it("counts favorites", () => {
    const favs = new Set(["g1", "g3"]);
    const result = computeQuickStats(games, cache, favs);
    expect(result.favoritesCount).toBe(2);
  });

  it("counts metadata coverage", () => {
    const result = computeQuickStats(games, cache, new Set());
    expect(result.gamesWithMetadata).toBe(3);
  });
});

describe("countryCodeToFlag", () => {
  it("converts 'US' to flag emoji", () => {
    const flag = countryCodeToFlag("US");
    expect(flag).toBe("\u{1F1FA}\u{1F1F8}");
  });

  it("handles lowercase input", () => {
    const flag = countryCodeToFlag("gb");
    expect(flag).toBe("\u{1F1EC}\u{1F1E7}");
  });

  it("returns empty string for invalid length", () => {
    expect(countryCodeToFlag("USA")).toBe("");
    expect(countryCodeToFlag("A")).toBe("");
  });
});

// ── Game Filter Tests ─────────────────────────────────────────

const filterGames = [
  makeGame({ gameId: "f1", name: "Alpha", source: "steam", playtimeForever: 600 }),
  makeGame({ gameId: "f2", name: "Beta", source: "epic", playtimeForever: 120 }),
  makeGame({ gameId: "f3", name: "Gamma", source: "steam", playtimeForever: 0 }),
  makeGame({ gameId: "f4", name: "Delta", source: "gog", playtimeForever: 300 }),
];

const filterCache = new Map<string, StoreMetadata>([
  [
    "f1",
    makeMeta("f1", {
      genres: [{ id: "1", description: "Action" }],
      steamTags: [{ name: "FPS", votes: 100 }],
      categories: [{ id: 1, description: "Single-player" }],
      developers: ["Dev A"],
      publishers: ["Pub X"],
    }),
  ],
  [
    "f2",
    makeMeta("f2", {
      genres: [
        { id: "1", description: "Action" },
        { id: "2", description: "RPG" },
      ],
      steamTags: [
        { name: "FPS", votes: 80 },
        { name: "Roguelike", votes: 50 },
      ],
      categories: [
        { id: 1, description: "Single-player" },
        { id: 2, description: "Multi-player" },
      ],
      developers: ["Dev B"],
      publishers: ["Pub X"],
    }),
  ],
  [
    "f3",
    makeMeta("f3", {
      genres: [{ id: "3", description: "Indie" }],
      steamTags: [{ name: "Puzzle", votes: 60 }],
      categories: [{ id: 1, description: "Single-player" }],
      developers: ["Dev A"],
      publishers: ["Pub Y"],
    }),
  ],
  [
    "f4",
    makeMeta("f4", {
      genres: [{ id: "2", description: "RPG" }],
      steamTags: [{ name: "Open World", votes: 90 }],
      categories: [{ id: 2, description: "Multi-player" }],
      developers: ["Dev C"],
      publishers: ["Pub Y"],
    }),
  ],
]);

describe("filterGamesBySource", () => {
  it("returns all games when sources is empty", () => {
    expect(filterGamesBySource(filterGames, [])).toHaveLength(4);
  });

  it("filters to matching source", () => {
    const result = filterGamesBySource(filterGames, ["steam"]);
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.gameId)).toEqual(["f1", "f3"]);
  });

  it("supports multiple sources (OR)", () => {
    const result = filterGamesBySource(filterGames, ["epic", "gog"]);
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.gameId)).toEqual(["f2", "f4"]);
  });
});

describe("filterGamesByGenre", () => {
  it("returns all games when genreIds is empty", () => {
    expect(filterGamesByGenre(filterGames, [], filterCache)).toHaveLength(4);
  });

  it("filters to games with matching genre", () => {
    const result = filterGamesByGenre(filterGames, ["1"], filterCache);
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.gameId)).toEqual(["f1", "f2"]);
  });

  it("returns empty when no games match", () => {
    const result = filterGamesByGenre(filterGames, ["99"], filterCache);
    expect(result).toHaveLength(0);
  });
});

describe("filterGamesBySteamTag", () => {
  it("returns all games when tagNames is empty", () => {
    expect(filterGamesBySteamTag(filterGames, [], filterCache)).toHaveLength(4);
  });

  it("filters to games with matching Steam tag", () => {
    const result = filterGamesBySteamTag(filterGames, ["FPS"], filterCache);
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.gameId)).toEqual(["f1", "f2"]);
  });

  it("supports multiple tags (OR)", () => {
    const result = filterGamesBySteamTag(
      filterGames,
      ["Puzzle", "Open World"],
      filterCache,
    );
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.gameId)).toEqual(["f3", "f4"]);
  });
});

describe("filterGamesByCategory", () => {
  it("returns all games when categoryIds is empty", () => {
    expect(filterGamesByCategory(filterGames, [], filterCache)).toHaveLength(4);
  });

  it("filters to games with matching category", () => {
    const result = filterGamesByCategory(filterGames, [2], filterCache);
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.gameId)).toEqual(["f2", "f4"]);
  });
});

describe("filterGamesByTags", () => {
  const gameTagMap = new Map<string, number[]>([
    ["f1", [10, 20]],
    ["f2", [20, 30]],
    ["f3", []],
    ["f4", [10]],
  ]);

  it("returns all games when tagIds is empty", () => {
    expect(filterGamesByTags(filterGames, [], gameTagMap)).toHaveLength(4);
  });

  it("filters to games with matching custom tag", () => {
    const result = filterGamesByTags(filterGames, [10], gameTagMap);
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.gameId)).toEqual(["f1", "f4"]);
  });

  it("excludes games with no tags", () => {
    const result = filterGamesByTags(filterGames, [30], gameTagMap);
    expect(result).toHaveLength(1);
    expect(result[0].gameId).toBe("f2");
  });
});

describe("applyProfileChartFilters", () => {
  const gameTagMap = new Map<string, number[]>([
    ["f1", [10]],
    ["f2", [10]],
    ["f3", []],
    ["f4", []],
  ]);

  it("returns all games when all filters empty", () => {
    const result = applyProfileChartFilters(
      filterGames,
      EMPTY_PROFILE_CHART_FILTERS,
      gameTagMap,
      filterCache,
    );
    expect(result).toHaveLength(4);
  });

  it("chains filters together (AND between types)", () => {
    const result = applyProfileChartFilters(
      filterGames,
      {
        ...EMPTY_PROFILE_CHART_FILTERS,
        filterBySource: ["steam"],
        filterByGenreIds: ["1"],
      },
      gameTagMap,
      filterCache,
    );
    // steam games: f1, f3; of those, Action genre: f1 only
    expect(result).toHaveLength(1);
    expect(result[0].gameId).toBe("f1");
  });
});

describe("getGamesForGenre", () => {
  it("returns games matching genre with playtime", () => {
    const result = getGamesForGenre(filterGames, "Action", filterCache);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Alpha"); // 600 min > 120 min (sorted desc)
    expect(result[0].playtimeMinutes).toBe(600);
    expect(result[1].name).toBe("Beta");
  });

  it("returns empty for unknown genre", () => {
    expect(getGamesForGenre(filterGames, "Unknown", filterCache)).toHaveLength(0);
  });
});

describe("getGamesForDevPub", () => {
  it("returns games by developer", () => {
    const result = getGamesForDevPub(filterGames, "Dev A", "developer", filterCache);
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.name)).toEqual(["Alpha", "Gamma"]);
  });

  it("returns games by publisher", () => {
    const result = getGamesForDevPub(filterGames, "Pub X", "publisher", filterCache);
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.name)).toEqual(["Alpha", "Beta"]);
  });

  it("returns empty for unknown entity", () => {
    expect(
      getGamesForDevPub(filterGames, "Nobody", "developer", filterCache),
    ).toHaveLength(0);
  });
});
