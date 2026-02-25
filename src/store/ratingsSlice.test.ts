import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRatingsStore } from "./ratingsSlice";

vi.mock("../services/tauri", () => ({
  ratingsApi: {
    getAllRatings: vi.fn().mockResolvedValue([
      { gameId: "game-1", rating: 8, review: "Great game", updatedAt: 1000 },
      { gameId: "game-2", rating: 5, review: null, updatedAt: 999 },
    ]),
    saveGameRating: vi
      .fn()
      .mockImplementation((gameId: string, rating: number, review: string | null) =>
        Promise.resolve({ gameId, rating, review, updatedAt: 2000 }),
      ),
    deleteGameRating: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("ratingsSlice", () => {
  beforeEach(() => {
    useRatingsStore.setState({ ratings: new Map(), isLoading: false, error: null });
  });

  it("loads all ratings into a Map", async () => {
    await useRatingsStore.getState().loadAllRatings();
    const { ratings } = useRatingsStore.getState();
    expect(ratings.size).toBe(2);
    expect(ratings.get("game-1")?.rating).toBe(8);
    expect(ratings.get("game-2")?.review).toBeNull();
  });

  it("saves a rating and updates the Map", async () => {
    await useRatingsStore.getState().saveRating("game-3", 10, "Perfect");
    const { ratings } = useRatingsStore.getState();
    expect(ratings.get("game-3")?.rating).toBe(10);
    expect(ratings.get("game-3")?.review).toBe("Perfect");
  });

  it("deletes a rating from the Map", async () => {
    useRatingsStore.setState({
      ratings: new Map([
        ["game-1", { gameId: "game-1", rating: 8, review: null, updatedAt: 1 }],
      ]),
    });
    await useRatingsStore.getState().deleteRating("game-1");
    expect(useRatingsStore.getState().ratings.size).toBe(0);
  });

  it("returns undefined for unrated game", async () => {
    await useRatingsStore.getState().loadAllRatings();
    expect(useRatingsStore.getState().ratings.get("nonexistent")).toBeUndefined();
  });
});
