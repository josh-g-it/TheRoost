import { describe, it, expect, vi, afterEach } from "vitest";
import { calculatePlayStreak, computePlaytimeInRange } from "./streaks";
import { makeSession, ts } from "../test/factories";

describe("calculatePlayStreak", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns { current: 0, longest: 0 } for empty sessions", () => {
    expect(calculatePlayStreak([])).toEqual({ current: 0, longest: 0 });
  });

  it("returns { current: 0, longest: 0 } for sessions with zero duration", () => {
    const sessions = [
      makeSession({ gameId: "g1", durationMinutes: 0 }),
      makeSession({ gameId: "g1", durationMinutes: null }),
    ];
    expect(calculatePlayStreak(sessions)).toEqual({ current: 0, longest: 0 });
  });

  it("returns { current: 1, longest: 1 } for a single session today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-22T18:00:00"));
    const sessions = [
      makeSession({ gameId: "g1", startTime: ts("2026-02-22"), durationMinutes: 30 }),
    ];
    expect(calculatePlayStreak(sessions)).toEqual({ current: 1, longest: 1 });
  });

  it("counts consecutive days as a streak", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-22T18:00:00"));
    const sessions = [
      makeSession({ gameId: "g1", startTime: ts("2026-02-20"), durationMinutes: 30 }),
      makeSession({ gameId: "g1", startTime: ts("2026-02-21"), durationMinutes: 45 }),
      makeSession({ gameId: "g1", startTime: ts("2026-02-22"), durationMinutes: 60 }),
    ];
    expect(calculatePlayStreak(sessions)).toEqual({ current: 3, longest: 3 });
  });

  it("streak includes yesterday even if not played today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-22T18:00:00"));
    const sessions = [
      makeSession({ gameId: "g1", startTime: ts("2026-02-19"), durationMinutes: 30 }),
      makeSession({ gameId: "g1", startTime: ts("2026-02-20"), durationMinutes: 45 }),
      makeSession({ gameId: "g1", startTime: ts("2026-02-21"), durationMinutes: 60 }),
    ];
    expect(calculatePlayStreak(sessions)).toEqual({ current: 3, longest: 3 });
  });

  it("gap breaks current streak but preserves longest", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-22T18:00:00"));
    const sessions = [
      // Old 3-day streak
      makeSession({ gameId: "g1", startTime: ts("2026-02-10"), durationMinutes: 30 }),
      makeSession({ gameId: "g1", startTime: ts("2026-02-11"), durationMinutes: 30 }),
      makeSession({ gameId: "g1", startTime: ts("2026-02-12"), durationMinutes: 30 }),
      // Gap
      // Recent 1-day streak
      makeSession({ gameId: "g1", startTime: ts("2026-02-22"), durationMinutes: 30 }),
    ];
    expect(calculatePlayStreak(sessions)).toEqual({ current: 1, longest: 3 });
  });

  it("no current streak if most recent session was more than 1 day ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-22T18:00:00"));
    const sessions = [
      makeSession({ gameId: "g1", startTime: ts("2026-02-18"), durationMinutes: 30 }),
      makeSession({ gameId: "g1", startTime: ts("2026-02-19"), durationMinutes: 45 }),
    ];
    const result = calculatePlayStreak(sessions);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(2);
  });

  it("deduplicates multiple sessions on the same day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-22T18:00:00"));
    const sessions = [
      makeSession({ gameId: "g1", startTime: ts("2026-02-22"), durationMinutes: 30 }),
      makeSession({ gameId: "g2", startTime: ts("2026-02-22"), durationMinutes: 60 }),
    ];
    expect(calculatePlayStreak(sessions)).toEqual({ current: 1, longest: 1 });
  });
});

describe("computePlaytimeInRange", () => {
  it("sums duration for sessions after start timestamp", () => {
    const sessions = [
      makeSession({ gameId: "g1", startTime: ts("2026-02-10"), durationMinutes: 30 }),
      makeSession({ gameId: "g1", startTime: ts("2026-02-15"), durationMinutes: 60 }),
      makeSession({ gameId: "g1", startTime: ts("2026-02-20"), durationMinutes: 90 }),
    ];
    // Only sessions after Feb 12 should count
    const result = computePlaytimeInRange(sessions, ts("2026-02-12"));
    expect(result).toBe(150); // 60 + 90
  });

  it("returns 0 for empty sessions", () => {
    expect(computePlaytimeInRange([], 0)).toBe(0);
  });

  it("excludes sessions with null duration", () => {
    const sessions = [
      makeSession({ gameId: "g1", startTime: ts("2026-02-15"), durationMinutes: null }),
      makeSession({ gameId: "g1", startTime: ts("2026-02-16"), durationMinutes: 45 }),
    ];
    expect(computePlaytimeInRange(sessions, ts("2026-02-01"))).toBe(45);
  });
});
