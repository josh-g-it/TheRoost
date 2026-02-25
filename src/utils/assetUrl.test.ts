import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import { resolveArtUrl } from "./assetUrl";

describe("resolveArtUrl", () => {
  it("returns remote URLs unchanged", () => {
    expect(resolveArtUrl("https://cdn.steamgriddb.com/img.png")).toBe(
      "https://cdn.steamgriddb.com/img.png",
    );
  });

  it("returns other remote URLs unchanged", () => {
    expect(resolveArtUrl("https://images.gog.com/logo.jpg")).toBe(
      "https://images.gog.com/logo.jpg",
    );
  });

  it("converts local: prefix to asset protocol URL", () => {
    const result = resolveArtUrl("local:C:\\Users\\test\\art\\game_grid.png");
    expect(result).toContain("asset.localhost");
    expect(result).toContain("game_grid.png");
  });

  it("handles local: with forward slashes", () => {
    const result = resolveArtUrl("local:/home/user/art/game_hero.png");
    expect(result).toContain("asset.localhost");
    expect(result).toContain("game_hero.png");
  });
});
