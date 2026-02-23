import { describe, it, expect } from "vitest";
import { processShelfGames, groupGamesByGenre } from "./shelfFiltering";
import type { ShelfFilters } from "../types/shelf";
import { DEFAULT_SHELF_FILTERS } from "../types/shelf";
import { makeGame, makeMeta, makeShelf } from "../test/factories";

const games = [
  makeGame({ gameId: "g1", name: "Portal 2", isInstalled: true, lastPlayed: 1000 }),
  makeGame({ gameId: "g2", name: "Dota 2", isInstalled: false, lastPlayed: null }),
  makeGame({ gameId: "g3", name: "Half-Life", isInstalled: true, lastPlayed: 500 }),
  makeGame({ gameId: "g4", name: "Elden Ring", isInstalled: false, lastPlayed: 2000 }),
];

const favorites = new Set(["g1", "g4"]);
const hiddenGames = new Set<string>();
const emptyTagMap = new Map<string, number[]>();
const emptyMetadata = new Map<string, StoreMetadata>();

// ── processShelfGames (full pipeline) ──────────────────────────

describe("processShelfGames", () => {
  describe("preset filters", () => {
    it("'all' preset returns all games", () => {
      const shelf = makeShelf({ preset: "all" });
      const result = processShelfGames(
        games,
        shelf,
        "",
        favorites,
        emptyTagMap,
        hiddenGames,
        emptyMetadata,
      );
      expect(result).toHaveLength(4);
    });

    it("'installed' preset returns only installed games", () => {
      const shelf = makeShelf({ preset: "installed" });
      const result = processShelfGames(
        games,
        shelf,
        "",
        favorites,
        emptyTagMap,
        hiddenGames,
        emptyMetadata,
      );
      expect(result.every((g) => g.isInstalled)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it("'favorites' preset returns only favorite games", () => {
      const shelf = makeShelf({ preset: "favorites" });
      const result = processShelfGames(
        games,
        shelf,
        "",
        favorites,
        emptyTagMap,
        hiddenGames,
        emptyMetadata,
      );
      expect(result.map((g) => g.gameId).sort()).toEqual(["g1", "g4"]);
    });

    it("'recently-played' preset returns only games with lastPlayed > 0", () => {
      const shelf = makeShelf({ preset: "recently-played" });
      const result = processShelfGames(
        games,
        shelf,
        "",
        favorites,
        emptyTagMap,
        hiddenGames,
        emptyMetadata,
      );
      expect(result.every((g) => g.lastPlayed != null && g.lastPlayed > 0)).toBe(true);
      expect(result).toHaveLength(3);
    });
  });

  describe("shelf filters", () => {
    it("installedOnly filter works", () => {
      const filters: ShelfFilters = { ...DEFAULT_SHELF_FILTERS, showInstalledOnly: true };
      const shelf = makeShelf({ filters });
      const result = processShelfGames(
        games,
        shelf,
        "",
        favorites,
        emptyTagMap,
        hiddenGames,
        emptyMetadata,
      );
      expect(result.every((g) => g.isInstalled)).toBe(true);
    });

    it("favoritesOnly filter works", () => {
      const filters: ShelfFilters = { ...DEFAULT_SHELF_FILTERS, showFavoritesOnly: true };
      const shelf = makeShelf({ filters });
      const result = processShelfGames(
        games,
        shelf,
        "",
        favorites,
        emptyTagMap,
        hiddenGames,
        emptyMetadata,
      );
      expect(result.map((g) => g.gameId).sort()).toEqual(["g1", "g4"]);
    });

    it("tag filter works", () => {
      const tagMap = new Map<string, number[]>();
      tagMap.set("g1", [10, 20]);
      tagMap.set("g2", [20]);
      tagMap.set("g3", [30]);
      tagMap.set("g4", [10]);

      const filters: ShelfFilters = { ...DEFAULT_SHELF_FILTERS, filterByTagIds: [10] };
      const shelf = makeShelf({ filters });
      const result = processShelfGames(
        games,
        shelf,
        "",
        favorites,
        tagMap,
        hiddenGames,
        emptyMetadata,
      );
      expect(result.map((g) => g.gameId).sort()).toEqual(["g1", "g4"]);
    });

    it("genre filter works", () => {
      const cache = new Map<string, StoreMetadata>();
      cache.set("g1", makeMeta("g1", { genres: [{ id: "1", description: "Action" }] }));
      cache.set("g2", makeMeta("g2", { genres: [{ id: "2", description: "RPG" }] }));
      cache.set("g3", makeMeta("g3", { genres: [{ id: "1", description: "Action" }] }));

      const filters: ShelfFilters = { ...DEFAULT_SHELF_FILTERS, filterByGenreIds: ["1"] };
      const shelf = makeShelf({ filters });
      const result = processShelfGames(
        games,
        shelf,
        "",
        favorites,
        emptyTagMap,
        hiddenGames,
        cache,
      );
      expect(result.map((g) => g.gameId).sort()).toEqual(["g1", "g3"]);
    });

    it("steam tag filter works", () => {
      const cache = new Map<string, StoreMetadata>();
      cache.set("g1", makeMeta("g1", { steamTags: [{ name: "Roguelike", votes: 50 }] }));
      cache.set("g2", makeMeta("g2", { steamTags: [{ name: "MOBA", votes: 100 }] }));
      cache.set("g3", makeMeta("g3", { steamTags: [{ name: "Roguelike", votes: 30 }] }));

      const filters: ShelfFilters = {
        ...DEFAULT_SHELF_FILTERS,
        filterBySteamTagNames: ["Roguelike"],
      };
      const shelf = makeShelf({ filters });
      const result = processShelfGames(
        games,
        shelf,
        "",
        favorites,
        emptyTagMap,
        hiddenGames,
        cache,
      );
      expect(result.map((g) => g.gameId).sort()).toEqual(["g1", "g3"]);
    });

    it("category filter works", () => {
      const cache = new Map<string, StoreMetadata>();
      cache.set(
        "g1",
        makeMeta("g1", { categories: [{ id: 2, description: "Single-player" }] }),
      );
      cache.set(
        "g2",
        makeMeta("g2", { categories: [{ id: 1, description: "Multi-player" }] }),
      );

      const filters: ShelfFilters = {
        ...DEFAULT_SHELF_FILTERS,
        filterByCategoryIds: [2],
      };
      const shelf = makeShelf({ filters });
      const result = processShelfGames(
        games,
        shelf,
        "",
        favorites,
        emptyTagMap,
        hiddenGames,
        cache,
      );
      expect(result.map((g) => g.gameId)).toEqual(["g1"]);
    });

    it("source filter works", () => {
      const mixed = [
        makeGame({
          gameId: "g1",
          name: "Portal 2",
          isInstalled: true,
          lastPlayed: 1000,
          source: "steam",
        }),
        makeGame({
          gameId: "g2",
          name: "Fortnite",
          isInstalled: false,
          lastPlayed: null,
          source: "epic",
        }),
        makeGame({
          gameId: "g3",
          name: "Witcher",
          isInstalled: true,
          lastPlayed: 500,
          source: "gog",
        }),
        makeGame({
          gameId: "g4",
          name: "Elden Ring",
          isInstalled: false,
          lastPlayed: 2000,
          source: "steam",
        }),
      ];
      const filters: ShelfFilters = {
        ...DEFAULT_SHELF_FILTERS,
        filterBySource: ["steam"],
      };
      const shelf = makeShelf({ filters });
      const result = processShelfGames(
        mixed,
        shelf,
        "",
        favorites,
        emptyTagMap,
        hiddenGames,
        emptyMetadata,
      );
      expect(result.every((g) => g.source === "steam")).toBe(true);
      expect(result).toHaveLength(2);
    });

    it("multiple filters use AND logic", () => {
      const cache = new Map<string, StoreMetadata>();
      cache.set("g1", makeMeta("g1", { genres: [{ id: "1", description: "Action" }] }));
      cache.set("g3", makeMeta("g3", { genres: [{ id: "1", description: "Action" }] }));

      // installedOnly AND genre=Action → only g1 and g3 match both, but g2 is not installed
      const filters: ShelfFilters = {
        ...DEFAULT_SHELF_FILTERS,
        showInstalledOnly: true,
        filterByGenreIds: ["1"],
      };
      const shelf = makeShelf({ filters });
      const result = processShelfGames(
        games,
        shelf,
        "",
        favorites,
        emptyTagMap,
        hiddenGames,
        cache,
      );
      expect(result.map((g) => g.gameId).sort()).toEqual(["g1", "g3"]);
    });
  });

  describe("global search", () => {
    it("filters by name substring", () => {
      const shelf = makeShelf();
      const result = processShelfGames(
        games,
        shelf,
        "half",
        favorites,
        emptyTagMap,
        hiddenGames,
        emptyMetadata,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Half-Life");
    });

    it("is case-insensitive", () => {
      const shelf = makeShelf();
      const result = processShelfGames(
        games,
        shelf,
        "PORTAL",
        favorites,
        emptyTagMap,
        hiddenGames,
        emptyMetadata,
      );
      expect(result).toHaveLength(1);
    });

    it("empty search returns all", () => {
      const shelf = makeShelf();
      const result = processShelfGames(
        games,
        shelf,
        "",
        favorites,
        emptyTagMap,
        hiddenGames,
        emptyMetadata,
      );
      expect(result).toHaveLength(4);
    });
  });

  describe("hidden games", () => {
    it("excludes hidden games", () => {
      const hidden = new Set(["g2", "g4"]);
      const shelf = makeShelf();
      const result = processShelfGames(
        games,
        shelf,
        "",
        favorites,
        emptyTagMap,
        hidden,
        emptyMetadata,
      );
      expect(result).toHaveLength(2);
      expect(result.every((g) => !hidden.has(g.gameId))).toBe(true);
    });
  });

  describe("sorting", () => {
    it("sorts results by configured sort", () => {
      const shelf = makeShelf({ sortBy: "name", sortOrder: "asc" });
      const result = processShelfGames(
        games,
        shelf,
        "",
        favorites,
        emptyTagMap,
        hiddenGames,
        emptyMetadata,
      );
      expect(result.map((g) => g.name)).toEqual([
        "Dota 2",
        "Elden Ring",
        "Half-Life",
        "Portal 2",
      ]);
    });
  });
});

// ── groupGamesByGenre ──────────────────────────────────────────

describe("groupGamesByGenre", () => {
  it("groups games by primary genre", () => {
    const cache = new Map<string, StoreMetadata>();
    cache.set("g1", makeMeta("g1", { genres: [{ id: "1", description: "Action" }] }));
    cache.set("g2", makeMeta("g2", { genres: [{ id: "2", description: "RPG" }] }));
    cache.set("g3", makeMeta("g3", { genres: [{ id: "1", description: "Action" }] }));

    const result = groupGamesByGenre(games.slice(0, 3), cache);
    expect(result).toHaveLength(2);
    const actionGroup = result.find((g) => g.genreName === "Action");
    expect(actionGroup?.games).toHaveLength(2);
  });

  it("puts games without metadata in 'Other'", () => {
    const cache = new Map<string, StoreMetadata>();
    cache.set("g1", makeMeta("g1", { genres: [{ id: "1", description: "Action" }] }));

    const result = groupGamesByGenre(games.slice(0, 3), cache);
    const otherGroup = result.find((g) => g.genreName === "Other");
    expect(otherGroup).toBeDefined();
    expect(otherGroup!.games).toHaveLength(2);
  });

  it("sorts 'Other' group last", () => {
    const cache = new Map<string, StoreMetadata>();
    cache.set("g1", makeMeta("g1", { genres: [{ id: "1", description: "Zzz" }] }));
    // g2 and g3 have no metadata → "Other"

    const result = groupGamesByGenre(games.slice(0, 3), cache);
    expect(result[result.length - 1].genreName).toBe("Other");
  });

  it("sorts genre groups alphabetically", () => {
    const cache = new Map<string, StoreMetadata>();
    cache.set("g1", makeMeta("g1", { genres: [{ id: "2", description: "RPG" }] }));
    cache.set("g2", makeMeta("g2", { genres: [{ id: "1", description: "Action" }] }));
    cache.set("g3", makeMeta("g3", { genres: [{ id: "3", description: "Indie" }] }));

    const result = groupGamesByGenre(games.slice(0, 3), cache);
    expect(result.map((g) => g.genreName)).toEqual(["Action", "Indie", "RPG"]);
  });
});
