import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatPlaytime,
  formatBytes,
  getSourceDisplayName,
  formatLastPlayed,
} from "./formatters";
import type { GameSource } from "../types/game";

describe("formatPlaytime", () => {
  it("returns 'Never played' for 0 minutes", () => {
    expect(formatPlaytime(0)).toBe("Never played");
  });

  it("formats minutes under an hour", () => {
    expect(formatPlaytime(45)).toBe("45m");
  });

  it("formats hours and minutes", () => {
    expect(formatPlaytime(125)).toBe("2h 5m");
  });

  it("omits minutes when even hours", () => {
    expect(formatPlaytime(120)).toBe("2h");
  });

  it("formats large hour counts with locale string", () => {
    expect(formatPlaytime(6000)).toBe("100h");
  });
});

describe("formatBytes", () => {
  it("returns '0 B' for zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1.0 GB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(5242880)).toBe("5.0 MB");
  });
});

describe("formatLastPlayed", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'Never' for null", () => {
    expect(formatLastPlayed(null)).toBe("Never");
  });

  it("returns 'Never' for 0", () => {
    expect(formatLastPlayed(0)).toBe("Never");
  });

  it("returns 'Today' for a timestamp from today", () => {
    const now = new Date("2026-02-22T15:00:00");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const todayTimestamp = Math.floor(now.getTime() / 1000) - 3600; // 1 hour ago
    expect(formatLastPlayed(todayTimestamp)).toBe("Today");
  });

  it("returns 'Yesterday' for a timestamp from yesterday", () => {
    const now = new Date("2026-02-22T15:00:00");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const yesterdayTs = Math.floor(now.getTime() / 1000) - 86400; // 24h ago
    expect(formatLastPlayed(yesterdayTs)).toBe("Yesterday");
  });

  it("returns '3 days ago' for 3 days back", () => {
    const now = new Date("2026-02-22T15:00:00");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const ts = Math.floor(now.getTime() / 1000) - 3 * 86400;
    expect(formatLastPlayed(ts)).toBe("3 days ago");
  });

  it("returns '2 weeks ago' for 14 days back", () => {
    const now = new Date("2026-02-22T15:00:00");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const ts = Math.floor(now.getTime() / 1000) - 14 * 86400;
    expect(formatLastPlayed(ts)).toBe("2 weeks ago");
  });

  it("returns '3 months ago' for 90 days back", () => {
    const now = new Date("2026-02-22T15:00:00");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const ts = Math.floor(now.getTime() / 1000) - 90 * 86400;
    expect(formatLastPlayed(ts)).toBe("3 months ago");
  });

  it("returns '2 years ago' for 730 days back", () => {
    const now = new Date("2026-02-22T15:00:00");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const ts = Math.floor(now.getTime() / 1000) - 730 * 86400;
    expect(formatLastPlayed(ts)).toBe("2 years ago");
  });
});

describe("getSourceDisplayName", () => {
  it("returns correct display names for all sources", () => {
    const expected: [GameSource, string][] = [
      ["steam", "Steam"],
      ["manual", "Manual"],
      ["epic", "Epic Games"],
      ["gog", "GOG"],
      ["ea_app", "EA App"],
      ["ubisoft", "Ubisoft Connect"],
      ["battlenet", "Battle.net"],
    ];
    for (const [source, name] of expected) {
      expect(getSourceDisplayName(source)).toBe(name);
    }
  });
});
