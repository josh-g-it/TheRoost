import { describe, it, expect } from "vitest";
import { sortGames } from "./sorting";
import type { StoreMetadata } from "../types";
import { makeGame, makeMeta } from "../test/factories";

const games = [
  makeGame({ gameId: "g1", name: "Zelda", playtimeForever: 100 }),
  makeGame({ gameId: "g2", name: "Alpha", playtimeForever: 50 }),
  makeGame({ gameId: "g3", name: "Mario", playtimeForever: 200 }),
];

describe("sortGames", () => {
  it("sorts by name ascending", () => {
    const result = sortGames(games, "name", "asc");
    expect(result.map((g) => g.name)).toEqual(["Alpha", "Mario", "Zelda"]);
  });

  it("sorts by name descending", () => {
    const result = sortGames(games, "name", "desc");
    expect(result.map((g) => g.name)).toEqual(["Zelda", "Mario", "Alpha"]);
  });

  it("sorts by playtime ascending", () => {
    const result = sortGames(games, "playtime", "asc");
    expect(result.map((g) => g.playtimeForever)).toEqual([50, 100, 200]);
  });

  it("sorts by playtime descending", () => {
    const result = sortGames(games, "playtime", "desc");
    expect(result.map((g) => g.playtimeForever)).toEqual([200, 100, 50]);
  });

  it("sorts by lastPlayed with null values as 0", () => {
    const g = [
      makeGame({ gameId: "g1", name: "A", lastPlayed: 1000 }),
      makeGame({ gameId: "g2", name: "B", lastPlayed: null }),
      makeGame({ gameId: "g3", name: "C", lastPlayed: 500 }),
    ];
    const result = sortGames(g, "lastPlayed", "desc");
    expect(result.map((r) => r.gameId)).toEqual(["g1", "g3", "g2"]);
  });

  it("sorts by recentlyAdded using lastUpdated", () => {
    const g = [
      makeGame({ gameId: "g1", name: "A", lastUpdated: 300 }),
      makeGame({ gameId: "g2", name: "B", lastUpdated: 100 }),
      makeGame({ gameId: "g3", name: "C", lastUpdated: 200 }),
    ];
    const result = sortGames(g, "recentlyAdded", "desc");
    expect(result.map((r) => r.gameId)).toEqual(["g1", "g3", "g2"]);
  });

  it("sorts by size with null values as 0", () => {
    const g = [
      makeGame({ gameId: "g1", name: "A", sizeOnDisk: 5000 }),
      makeGame({ gameId: "g2", name: "B", sizeOnDisk: null }),
      makeGame({ gameId: "g3", name: "C", sizeOnDisk: 3000 }),
    ];
    const result = sortGames(g, "size", "desc");
    expect(result.map((r) => r.gameId)).toEqual(["g1", "g3", "g2"]);
  });

  it("sorts by metacritic using metadataCache", () => {
    const cache = new Map<string, StoreMetadata>();
    cache.set("g1", makeMeta("g1", { metacriticScore: 70 }));
    cache.set("g2", makeMeta("g2", { metacriticScore: 90 }));
    cache.set("g3", makeMeta("g3", { metacriticScore: 80 }));

    const result = sortGames(games, "metacritic", "desc", cache);
    expect(result.map((r) => r.gameId)).toEqual(["g2", "g3", "g1"]);
  });

  it("sorts by metacritic with missing scores as -1", () => {
    const cache = new Map<string, StoreMetadata>();
    cache.set("g1", makeMeta("g1", { metacriticScore: 70 }));
    // game 2 and 3 have no metadata

    const result = sortGames(games, "metacritic", "desc", cache);
    expect(result[0].gameId).toBe("g1");
  });

  it("returns empty array for empty input", () => {
    expect(sortGames([], "name", "asc")).toEqual([]);
  });

  it("returns single game unchanged", () => {
    const single = [makeGame({ gameId: "g1", name: "Only" })];
    const result = sortGames(single, "name", "asc");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Only");
  });

  it("does not mutate original array", () => {
    const original = [...games];
    sortGames(games, "name", "asc");
    expect(games.map((g) => g.name)).toEqual(original.map((g) => g.name));
  });

  it("sorts by source alphabetically ascending", () => {
    const mixed = [
      makeGame({ gameId: "g1", name: "A", source: "steam" }),
      makeGame({ gameId: "g2", name: "B", source: "epic" }),
      makeGame({ gameId: "g3", name: "C", source: "gog" }),
    ];
    const result = sortGames(mixed, "source", "asc");
    expect(result.map((g) => g.source)).toEqual(["epic", "gog", "steam"]);
  });

  it("sorts by source descending", () => {
    const mixed = [
      makeGame({ gameId: "g1", name: "A", source: "steam" }),
      makeGame({ gameId: "g2", name: "B", source: "epic" }),
      makeGame({ gameId: "g3", name: "C", source: "gog" }),
    ];
    const result = sortGames(mixed, "source", "desc");
    expect(result.map((g) => g.source)).toEqual(["steam", "gog", "epic"]);
  });
});
