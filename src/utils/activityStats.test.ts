import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { StoreMetadata } from "../types";
import {
  computeDailyPlaytime,
  computeMostPlayed,
  computeSessionLengthDistribution,
  computePlaytimeByDayOfWeek,
  computeActivityQuickStats,
  filterSessionsByDate,
  filterSessionsByGame,
  filterSessionsByDurationRange,
  filterSessionsByDayOfWeek,
  filterSessionsByTags,
  filterSessionsBySource,
  filterSessionsByGenre,
  filterSessionsBySteamTag,
  filterSessionsByCategory,
  computeMemories,
} from "./activityStats";
import { makeSession, ts } from "../test/factories";

// ── computeDailyPlaytime ──────────────────────────────────────

describe("computeDailyPlaytime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-20T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty points for each day with no sessions", () => {
    const result = computeDailyPlaytime([], 7);
    expect(result).toHaveLength(7);
    expect(result.every((d) => d.minutes === 0)).toBe(true);
    expect(result.every((d) => d.sessionCount === 0)).toBe(true);
  });

  it("fills in playtime for days with sessions", () => {
    const sessions = [
      makeSession({ gameId: "a", startTime: ts("2026-02-18"), durationMinutes: 45 }),
      makeSession({ gameId: "b", startTime: ts("2026-02-18"), durationMinutes: 30 }),
      makeSession({ gameId: "a", startTime: ts("2026-02-20"), durationMinutes: 120 }),
    ];
    const result = computeDailyPlaytime(sessions, 7);

    // Feb 18 should have 75 minutes (45 + 30)
    const feb18 = result.find((d) => d.dateKey === "2026-02-18");
    expect(feb18).toBeDefined();
    expect(feb18!.minutes).toBe(75);
    expect(feb18!.sessionCount).toBe(2);

    // Feb 20 should have 120 minutes
    const feb20 = result.find((d) => d.dateKey === "2026-02-20");
    expect(feb20).toBeDefined();
    expect(feb20!.minutes).toBe(120);
    expect(feb20!.sessionCount).toBe(1);

    // Feb 19 should be zero
    const feb19 = result.find((d) => d.dateKey === "2026-02-19");
    expect(feb19).toBeDefined();
    expect(feb19!.minutes).toBe(0);
  });

  it("excludes active sessions (null durationMinutes)", () => {
    const sessions = [
      makeSession({ gameId: "a", startTime: ts("2026-02-20"), durationMinutes: null }),
    ];
    const result = computeDailyPlaytime(sessions, 3);
    expect(result.every((d) => d.minutes === 0)).toBe(true);
  });

  it("returns sorted oldest to newest", () => {
    const result = computeDailyPlaytime([], 5);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].dateKey > result[i - 1].dateKey).toBe(true);
    }
  });

  it("computes hours as rounded minutes / 60", () => {
    const sessions = [
      makeSession({ gameId: "a", startTime: ts("2026-02-20"), durationMinutes: 90 }),
    ];
    const result = computeDailyPlaytime(sessions, 1);
    expect(result[0].hours).toBe(1.5);
  });
});

// ── computeMostPlayed ─────────────────────────────────────────

describe("computeMostPlayed", () => {
  const gameNames = new Map([
    ["game-1", "Elden Ring"],
    ["game-2", "Hades"],
    ["game-3", "Celeste"],
  ]);

  it("returns empty array for no sessions", () => {
    expect(computeMostPlayed([], gameNames, 0, 5)).toEqual([]);
  });

  it("aggregates and sorts by total minutes descending", () => {
    const sessions = [
      makeSession({ gameId: "game-1", startTime: 1000, durationMinutes: 60 }),
      makeSession({ gameId: "game-1", startTime: 2000, durationMinutes: 90 }),
      makeSession({ gameId: "game-2", startTime: 1500, durationMinutes: 200 }),
      makeSession({ gameId: "game-3", startTime: 3000, durationMinutes: 30 }),
    ];
    const result = computeMostPlayed(sessions, gameNames, 0, 5);

    expect(result[0].name).toBe("Hades");
    expect(result[0].totalMinutes).toBe(200);
    expect(result[0].sessionCount).toBe(1);

    expect(result[1].name).toBe("Elden Ring");
    expect(result[1].totalMinutes).toBe(150);
    expect(result[1].sessionCount).toBe(2);

    expect(result[2].name).toBe("Celeste");
    expect(result[2].totalMinutes).toBe(30);
  });

  it("filters by sinceTimestamp", () => {
    const sessions = [
      makeSession({ gameId: "game-1", startTime: 100, durationMinutes: 500 }),
      makeSession({ gameId: "game-2", startTime: 1000, durationMinutes: 50 }),
    ];
    const result = computeMostPlayed(sessions, gameNames, 500, 5);
    expect(result).toHaveLength(1);
    expect(result[0].gameId).toBe("game-2");
  });

  it("respects topN limit", () => {
    const sessions = [
      makeSession({ gameId: "game-1", startTime: 1000, durationMinutes: 100 }),
      makeSession({ gameId: "game-2", startTime: 1000, durationMinutes: 200 }),
      makeSession({ gameId: "game-3", startTime: 1000, durationMinutes: 50 }),
    ];
    const result = computeMostPlayed(sessions, gameNames, 0, 2);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Hades");
    expect(result[1].name).toBe("Elden Ring");
  });

  it("handles unknown game names gracefully", () => {
    const sessions = [
      makeSession({ gameId: "unknown-id", startTime: 1000, durationMinutes: 60 }),
    ];
    const result = computeMostPlayed(sessions, gameNames, 0, 5);
    expect(result[0].name).toContain("Game");
  });

  it("skips sessions with null duration", () => {
    const sessions = [
      makeSession({ gameId: "game-1", startTime: 1000, durationMinutes: null }),
    ];
    const result = computeMostPlayed(sessions, gameNames, 0, 5);
    expect(result).toHaveLength(0);
  });
});

// ── computeSessionLengthDistribution ──────────────────────────

describe("computeSessionLengthDistribution", () => {
  it("returns 6 buckets for empty sessions", () => {
    const result = computeSessionLengthDistribution([]);
    expect(result).toHaveLength(6);
    expect(result.every((b) => b.count === 0)).toBe(true);
  });

  it("places sessions in correct buckets", () => {
    const sessions = [
      makeSession({ gameId: "a", durationMinutes: 10 }), // < 15m
      makeSession({ gameId: "a", durationMinutes: 14 }), // < 15m
      makeSession({ gameId: "a", durationMinutes: 20 }), // 15-30m
      makeSession({ gameId: "a", durationMinutes: 45 }), // 30m-1h
      makeSession({ gameId: "a", durationMinutes: 90 }), // 1-2h
      makeSession({ gameId: "a", durationMinutes: 180 }), // 2-4h
      makeSession({ gameId: "a", durationMinutes: 300 }), // 4h+
    ];
    const result = computeSessionLengthDistribution(sessions);

    expect(result[0].label).toBe("< 15m");
    expect(result[0].count).toBe(2);
    expect(result[1].label).toBe("15-30m");
    expect(result[1].count).toBe(1);
    expect(result[2].label).toBe("30m-1h");
    expect(result[2].count).toBe(1);
    expect(result[3].label).toBe("1-2h");
    expect(result[3].count).toBe(1);
    expect(result[4].label).toBe("2-4h");
    expect(result[4].count).toBe(1);
    expect(result[5].label).toBe("4h+");
    expect(result[5].count).toBe(1);
  });

  it("skips sessions with null or zero duration", () => {
    const sessions = [
      makeSession({ gameId: "a", durationMinutes: null }),
      makeSession({ gameId: "a", durationMinutes: 0 }),
    ];
    const result = computeSessionLengthDistribution(sessions);
    expect(result.every((b) => b.count === 0)).toBe(true);
  });

  it("boundary: 15 minutes goes in 15-30m bucket", () => {
    const sessions = [makeSession({ gameId: "a", durationMinutes: 15 })];
    const result = computeSessionLengthDistribution(sessions);
    expect(result[1].count).toBe(1); // 15-30m
  });

  it("boundary: 60 minutes goes in 1-2h bucket", () => {
    const sessions = [makeSession({ gameId: "a", durationMinutes: 60 })];
    const result = computeSessionLengthDistribution(sessions);
    expect(result[3].count).toBe(1); // 1-2h
  });
});

// ── computePlaytimeByDayOfWeek ────────────────────────────────

describe("computePlaytimeByDayOfWeek", () => {
  it("returns 7 entries for empty sessions", () => {
    const result = computePlaytimeByDayOfWeek([]);
    expect(result).toHaveLength(7);
    expect(result[0].day).toBe("Mon");
    expect(result[6].day).toBe("Sun");
    expect(result.every((d) => d.totalHours === 0)).toBe(true);
  });

  it("aggregates playtime by day of week", () => {
    // 2026-02-16 is a Monday, 2026-02-17 is a Tuesday
    const sessions = [
      makeSession({ gameId: "a", startTime: ts("2026-02-16"), durationMinutes: 120 }),
      makeSession({ gameId: "b", startTime: ts("2026-02-16"), durationMinutes: 60 }),
      makeSession({ gameId: "a", startTime: ts("2026-02-17"), durationMinutes: 90 }),
    ];
    const result = computePlaytimeByDayOfWeek(sessions);

    expect(result[0].day).toBe("Mon");
    expect(result[0].totalHours).toBe(3); // 180m = 3h
    expect(result[0].sessionCount).toBe(2);

    expect(result[1].day).toBe("Tue");
    expect(result[1].totalHours).toBe(1.5); // 90m = 1.5h
    expect(result[1].sessionCount).toBe(1);
  });

  it("skips sessions with null duration", () => {
    const sessions = [
      makeSession({ gameId: "a", startTime: ts("2026-02-16"), durationMinutes: null }),
    ];
    const result = computePlaytimeByDayOfWeek(sessions);
    expect(result.every((d) => d.totalHours === 0)).toBe(true);
  });
});

// ── computeActivityQuickStats ─────────────────────────────────

describe("computeActivityQuickStats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-20T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns zeros for empty sessions", () => {
    const result = computeActivityQuickStats([]);
    expect(result.weeklyMinutes).toBe(0);
    expect(result.monthlyMinutes).toBe(0);
    expect(result.previousWeekMinutes).toBe(0);
    expect(result.previousMonthMinutes).toBe(0);
    expect(result.totalSessions).toBe(0);
    expect(result.averageSessionMinutes).toBe(0);
  });

  it("computes weekly and monthly totals", () => {
    const sessions = [
      // This week (within 7 days of Feb 20)
      makeSession({ gameId: "a", startTime: ts("2026-02-18"), durationMinutes: 60 }),
      makeSession({ gameId: "a", startTime: ts("2026-02-19"), durationMinutes: 120 }),
      // This month but not this week
      makeSession({ gameId: "a", startTime: ts("2026-02-01"), durationMinutes: 90 }),
    ];
    const result = computeActivityQuickStats(sessions);
    expect(result.weeklyMinutes).toBe(180);
    expect(result.monthlyMinutes).toBe(270); // 180 + 90
  });

  it("computes previous week for trend comparison", () => {
    const sessions = [
      // Last week (8-14 days ago from Feb 20 = Feb 6-12)
      makeSession({ gameId: "a", startTime: ts("2026-02-10"), durationMinutes: 45 }),
      makeSession({ gameId: "a", startTime: ts("2026-02-11"), durationMinutes: 30 }),
    ];
    const result = computeActivityQuickStats(sessions);
    expect(result.previousWeekMinutes).toBe(75);
    expect(result.weeklyMinutes).toBe(0);
  });

  it("computes average session duration", () => {
    const sessions = [
      makeSession({ gameId: "a", startTime: ts("2026-02-18"), durationMinutes: 60 }),
      makeSession({ gameId: "b", startTime: ts("2026-02-19"), durationMinutes: 120 }),
      makeSession({ gameId: "c", startTime: ts("2026-02-20"), durationMinutes: 30 }),
    ];
    const result = computeActivityQuickStats(sessions);
    expect(result.totalSessions).toBe(3);
    expect(result.averageSessionMinutes).toBe(70); // (60+120+30)/3 = 70
  });

  it("skips null duration sessions from averages", () => {
    const sessions = [
      makeSession({ gameId: "a", startTime: ts("2026-02-18"), durationMinutes: 60 }),
      makeSession({ gameId: "b", startTime: ts("2026-02-19"), durationMinutes: null }),
    ];
    const result = computeActivityQuickStats(sessions);
    expect(result.totalSessions).toBe(1);
    expect(result.averageSessionMinutes).toBe(60);
  });
});

// ── filterSessionsByDate ──────────────────────────────────────

describe("filterSessionsByDate", () => {
  it("returns sessions matching the given date key", () => {
    const sessions = [
      makeSession({ gameId: "a", startTime: ts("2026-02-18"), durationMinutes: 60 }),
      makeSession({ gameId: "b", startTime: ts("2026-02-18"), durationMinutes: 30 }),
      makeSession({ gameId: "c", startTime: ts("2026-02-19"), durationMinutes: 45 }),
    ];
    const result = filterSessionsByDate(sessions, "2026-02-18");
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.gameId !== "c")).toBe(true);
  });

  it("returns empty array for no matches", () => {
    const sessions = [
      makeSession({ gameId: "a", startTime: ts("2026-02-18"), durationMinutes: 60 }),
    ];
    expect(filterSessionsByDate(sessions, "2026-01-01")).toHaveLength(0);
  });
});

// ── filterSessionsByGame ──────────────────────────────────────

describe("filterSessionsByGame", () => {
  it("returns sessions for the given game ID", () => {
    const sessions = [
      makeSession({ gameId: "game-1", startTime: 1000, durationMinutes: 60 }),
      makeSession({ gameId: "game-2", startTime: 2000, durationMinutes: 30 }),
      makeSession({ gameId: "game-1", startTime: 3000, durationMinutes: 90 }),
    ];
    const result = filterSessionsByGame(sessions, "game-1");
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.gameId === "game-1")).toBe(true);
  });

  it("returns empty array for unknown game", () => {
    const sessions = [
      makeSession({ gameId: "game-1", startTime: 1000, durationMinutes: 60 }),
    ];
    expect(filterSessionsByGame(sessions, "unknown")).toHaveLength(0);
  });
});

// ── filterSessionsByDurationRange ─────────────────────────────

describe("filterSessionsByDurationRange", () => {
  it("returns sessions within the min-max range", () => {
    const sessions = [
      makeSession({ gameId: "a", durationMinutes: 10 }),
      makeSession({ gameId: "a", durationMinutes: 30 }),
      makeSession({ gameId: "a", durationMinutes: 60 }),
      makeSession({ gameId: "a", durationMinutes: 120 }),
    ];
    const result = filterSessionsByDurationRange(sessions, 15, 120);
    expect(result).toHaveLength(2);
    expect(result[0].durationMinutes).toBe(30);
    expect(result[1].durationMinutes).toBe(60);
  });

  it("handles Infinity max (4h+ bucket)", () => {
    const sessions = [
      makeSession({ gameId: "a", durationMinutes: 300 }),
      makeSession({ gameId: "a", durationMinutes: 600 }),
      makeSession({ gameId: "a", durationMinutes: 100 }),
    ];
    const result = filterSessionsByDurationRange(sessions, 240, Infinity);
    expect(result).toHaveLength(2);
  });

  it("excludes null duration sessions", () => {
    const sessions = [
      makeSession({ gameId: "a", durationMinutes: null }),
      makeSession({ gameId: "a", durationMinutes: 60 }),
    ];
    const result = filterSessionsByDurationRange(sessions, 0, Infinity);
    expect(result).toHaveLength(1);
  });
});

// ── filterSessionsByDayOfWeek ─────────────────────────────────

describe("filterSessionsByDayOfWeek", () => {
  it("returns sessions for Monday (index 0)", () => {
    // 2026-02-16 is a Monday
    const sessions = [
      makeSession({ gameId: "a", startTime: ts("2026-02-16"), durationMinutes: 60 }),
      makeSession({ gameId: "b", startTime: ts("2026-02-17"), durationMinutes: 30 }), // Tuesday
      makeSession({ gameId: "c", startTime: ts("2026-02-23"), durationMinutes: 45 }), // Monday
    ];
    const result = filterSessionsByDayOfWeek(sessions, 0);
    expect(result).toHaveLength(2);
    expect(result[0].gameId).toBe("a");
    expect(result[1].gameId).toBe("c");
  });

  it("returns sessions for Sunday (index 6)", () => {
    // 2026-02-15 is a Sunday
    const sessions = [
      makeSession({ gameId: "a", startTime: ts("2026-02-15"), durationMinutes: 60 }),
      makeSession({ gameId: "b", startTime: ts("2026-02-16"), durationMinutes: 30 }), // Monday
    ];
    const result = filterSessionsByDayOfWeek(sessions, 6);
    expect(result).toHaveLength(1);
    expect(result[0].gameId).toBe("a");
  });
});

// ── filterSessionsByTags ──────────────────────────────────────

describe("filterSessionsByTags", () => {
  const gameTagMap = new Map<string, number[]>([
    ["game-1", [1, 2]],
    ["game-2", [2, 3]],
    ["game-3", [4]],
  ]);

  const sessions = [
    makeSession({ gameId: "game-1", startTime: 1000, durationMinutes: 60 }),
    makeSession({ gameId: "game-2", startTime: 2000, durationMinutes: 30 }),
    makeSession({ gameId: "game-3", startTime: 3000, durationMinutes: 90 }),
    makeSession({ gameId: "game-4", startTime: 4000, durationMinutes: 45 }), // no tags
  ];

  it("returns all sessions when tagIds is empty", () => {
    const result = filterSessionsByTags(sessions, [], gameTagMap);
    expect(result).toHaveLength(4);
  });

  it("filters sessions by tag ID", () => {
    const result = filterSessionsByTags(sessions, [1], gameTagMap);
    expect(result).toHaveLength(1);
    expect(result[0].gameId).toBe("game-1");
  });

  it("matches any tag (OR logic)", () => {
    const result = filterSessionsByTags(sessions, [2], gameTagMap);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.gameId)).toEqual(["game-1", "game-2"]);
  });

  it("excludes games with no tags in map", () => {
    const result = filterSessionsByTags(sessions, [1, 4], gameTagMap);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.gameId)).toEqual(["game-1", "game-3"]);
  });
});

// ── filterSessionsBySource ───────────────────────────────────

describe("filterSessionsBySource", () => {
  const gameSourceMap = new Map<string, string>([
    ["game-1", "Steam"],
    ["game-2", "Epic"],
    ["game-3", "Gog"],
    ["game-4", "Steam"],
  ]);

  const sessions = [
    makeSession({ gameId: "game-1", startTime: 1000, durationMinutes: 60 }),
    makeSession({ gameId: "game-2", startTime: 2000, durationMinutes: 30 }),
    makeSession({ gameId: "game-3", startTime: 3000, durationMinutes: 90 }),
    makeSession({ gameId: "game-4", startTime: 4000, durationMinutes: 45 }),
  ];

  it("returns all sessions when sources is empty", () => {
    const result = filterSessionsBySource(sessions, [], gameSourceMap);
    expect(result).toHaveLength(4);
  });

  it("filters sessions by single source", () => {
    const result = filterSessionsBySource(sessions, ["Steam"], gameSourceMap);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.gameId)).toEqual(["game-1", "game-4"]);
  });

  it("filters sessions by multiple sources (OR logic)", () => {
    const result = filterSessionsBySource(sessions, ["Epic", "Gog"], gameSourceMap);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.gameId)).toEqual(["game-2", "game-3"]);
  });

  it("excludes sessions with unknown game source", () => {
    const sessionsWithUnknown = [
      ...sessions,
      makeSession({ gameId: "game-unknown", startTime: 5000, durationMinutes: 20 }),
    ];
    const result = filterSessionsBySource(sessionsWithUnknown, ["Steam"], gameSourceMap);
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.gameId === "game-1" || s.gameId === "game-4")).toBe(
      true,
    );
  });
});

// ── filterSessionsByGenre ───────────────────────────────────

describe("filterSessionsByGenre", () => {
  const metadataCache = new Map<string, StoreMetadata>([
    [
      "game-1",
      {
        gameId: "game-1",
        name: "A",
        shortDescription: null,
        headerImageUrl: null,
        developers: [],
        publishers: [],
        genres: [
          { id: "1", description: "Action" },
          { id: "2", description: "RPG" },
        ],
        categories: [],
        screenshots: [],
        releaseDate: null,
        metacriticScore: null,
        metacriticUrl: null,
        steamTags: [],
      },
    ],
    [
      "game-2",
      {
        gameId: "game-2",
        name: "B",
        shortDescription: null,
        headerImageUrl: null,
        developers: [],
        publishers: [],
        genres: [{ id: "3", description: "Strategy" }],
        categories: [],
        screenshots: [],
        releaseDate: null,
        metacriticScore: null,
        metacriticUrl: null,
        steamTags: [],
      },
    ],
    [
      "game-3",
      {
        gameId: "game-3",
        name: "C",
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
        steamTags: [],
      },
    ],
  ]);

  const sessions = [
    makeSession({ gameId: "game-1", startTime: 1000, durationMinutes: 60 }),
    makeSession({ gameId: "game-2", startTime: 2000, durationMinutes: 30 }),
    makeSession({ gameId: "game-3", startTime: 3000, durationMinutes: 90 }),
  ];

  it("returns all sessions when genreIds is empty", () => {
    expect(filterSessionsByGenre(sessions, [], metadataCache)).toHaveLength(3);
  });

  it("filters by genre ID", () => {
    const result = filterSessionsByGenre(sessions, ["1"], metadataCache);
    expect(result).toHaveLength(1);
    expect(result[0].gameId).toBe("game-1");
  });

  it("uses OR logic for multiple genres", () => {
    const result = filterSessionsByGenre(sessions, ["2", "3"], metadataCache);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.gameId)).toEqual(["game-1", "game-2"]);
  });

  it("excludes games with no metadata", () => {
    const sessionsWithUnknown = [
      ...sessions,
      makeSession({ gameId: "game-unknown", startTime: 4000, durationMinutes: 20 }),
    ];
    const result = filterSessionsByGenre(sessionsWithUnknown, ["1"], metadataCache);
    expect(result).toHaveLength(1);
  });
});

// ── filterSessionsBySteamTag ────────────────────────────────

describe("filterSessionsBySteamTag", () => {
  const metadataCache = new Map<string, StoreMetadata>([
    [
      "game-1",
      {
        gameId: "game-1",
        name: "A",
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
        steamTags: [
          { name: "Singleplayer", votes: 100 },
          { name: "Open World", votes: 80 },
        ],
      },
    ],
    [
      "game-2",
      {
        gameId: "game-2",
        name: "B",
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
        steamTags: [{ name: "Multiplayer", votes: 90 }],
      },
    ],
  ]);

  const sessions = [
    makeSession({ gameId: "game-1", startTime: 1000, durationMinutes: 60 }),
    makeSession({ gameId: "game-2", startTime: 2000, durationMinutes: 30 }),
  ];

  it("returns all sessions when tagNames is empty", () => {
    expect(filterSessionsBySteamTag(sessions, [], metadataCache)).toHaveLength(2);
  });

  it("filters by Steam tag name", () => {
    const result = filterSessionsBySteamTag(sessions, ["Singleplayer"], metadataCache);
    expect(result).toHaveLength(1);
    expect(result[0].gameId).toBe("game-1");
  });

  it("uses OR logic for multiple tags", () => {
    const result = filterSessionsBySteamTag(
      sessions,
      ["Open World", "Multiplayer"],
      metadataCache,
    );
    expect(result).toHaveLength(2);
  });
});

// ── filterSessionsByCategory ────────────────────────────────

describe("filterSessionsByCategory", () => {
  const metadataCache = new Map<string, StoreMetadata>([
    [
      "game-1",
      {
        gameId: "game-1",
        name: "A",
        shortDescription: null,
        headerImageUrl: null,
        developers: [],
        publishers: [],
        genres: [],
        categories: [
          { id: 1, description: "Single-player" },
          { id: 2, description: "Steam Achievements" },
        ],
        screenshots: [],
        releaseDate: null,
        metacriticScore: null,
        metacriticUrl: null,
        steamTags: [],
      },
    ],
    [
      "game-2",
      {
        gameId: "game-2",
        name: "B",
        shortDescription: null,
        headerImageUrl: null,
        developers: [],
        publishers: [],
        genres: [],
        categories: [{ id: 36, description: "Online Multi-Player" }],
        screenshots: [],
        releaseDate: null,
        metacriticScore: null,
        metacriticUrl: null,
        steamTags: [],
      },
    ],
  ]);

  const sessions = [
    makeSession({ gameId: "game-1", startTime: 1000, durationMinutes: 60 }),
    makeSession({ gameId: "game-2", startTime: 2000, durationMinutes: 30 }),
  ];

  it("returns all sessions when categoryIds is empty", () => {
    expect(filterSessionsByCategory(sessions, [], metadataCache)).toHaveLength(2);
  });

  it("filters by category ID", () => {
    const result = filterSessionsByCategory(sessions, [36], metadataCache);
    expect(result).toHaveLength(1);
    expect(result[0].gameId).toBe("game-2");
  });

  it("uses OR logic for multiple categories", () => {
    const result = filterSessionsByCategory(sessions, [1, 36], metadataCache);
    expect(result).toHaveLength(2);
  });
});

// ── computeMemories ──────────────────────────────────────────

describe("computeMemories", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-20T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const gameNames = new Map([
    ["game-1", "Elden Ring"],
    ["game-2", "Hades"],
  ]);

  it("returns empty array when no sessions match", () => {
    const result = computeMemories([], gameNames);
    expect(result).toHaveLength(0);
  });

  it("finds sessions from same week last month", () => {
    // Feb 20, 2026 is a Friday. One month ago = Jan 20, 2026 (Tuesday).
    // Week of Jan 20: Mon Jan 19 - Sun Jan 25
    const sessions = [
      makeSession({ gameId: "game-1", startTime: ts("2026-01-20"), durationMinutes: 60 }),
      makeSession({ gameId: "game-2", startTime: ts("2026-01-21"), durationMinutes: 30 }),
    ];
    const result = computeMemories(sessions, gameNames);
    const lastMonth = result.find((e) => e.period === "last-month");
    expect(lastMonth).toBeDefined();
    expect(lastMonth!.games).toHaveLength(2);
    expect(lastMonth!.totalMinutes).toBe(90);
  });

  it("finds sessions from same week last year", () => {
    // Feb 20, 2026. One year ago = Feb 20, 2025 (Thursday).
    // Week of Feb 20, 2025: Mon Feb 17 - Sun Feb 23
    const sessions = [
      makeSession({
        gameId: "game-1",
        startTime: ts("2025-02-18"),
        durationMinutes: 120,
      }),
    ];
    const result = computeMemories(sessions, gameNames);
    const lastYear = result.find((e) => e.period === "last-year");
    expect(lastYear).toBeDefined();
    expect(lastYear!.games).toHaveLength(1);
    expect(lastYear!.games[0].name).toBe("Elden Ring");
  });

  it("groups and sorts games by total time", () => {
    const sessions = [
      makeSession({ gameId: "game-1", startTime: ts("2026-01-20"), durationMinutes: 30 }),
      makeSession({ gameId: "game-2", startTime: ts("2026-01-20"), durationMinutes: 90 }),
      makeSession({ gameId: "game-1", startTime: ts("2026-01-21"), durationMinutes: 40 }),
    ];
    const result = computeMemories(sessions, gameNames);
    const lastMonth = result.find((e) => e.period === "last-month");
    expect(lastMonth).toBeDefined();
    // Hades (90) > Elden Ring (70)
    expect(lastMonth!.games[0].name).toBe("Hades");
    expect(lastMonth!.games[0].totalMinutes).toBe(90);
    expect(lastMonth!.games[1].name).toBe("Elden Ring");
    expect(lastMonth!.games[1].totalMinutes).toBe(70);
  });

  it("excludes sessions with null duration", () => {
    const sessions = [
      makeSession({
        gameId: "game-1",
        startTime: ts("2026-01-20"),
        durationMinutes: null,
      }),
    ];
    const result = computeMemories(sessions, gameNames);
    expect(result).toHaveLength(0);
  });
});
