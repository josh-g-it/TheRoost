import { describe, it, expect, beforeEach } from "vitest";
import { useShelvesStore } from "./shelvesSlice";
import { makeShelf } from "../test/factories";
import { DEFAULT_SHELVES } from "../types/shelf";

describe("shelvesSlice", () => {
  beforeEach(() => {
    useShelvesStore.setState({ shelves: [], editingShelfId: null });
  });

  // ── initShelves ──────────────────────────────────────────────

  describe("initShelves", () => {
    it("uses provided shelves when non-empty", () => {
      const custom = [makeShelf({ id: "s1", name: "My Shelf" })];
      useShelvesStore.getState().initShelves(custom);
      expect(useShelvesStore.getState().shelves).toHaveLength(1);
      expect(useShelvesStore.getState().shelves[0].name).toBe("My Shelf");
    });

    it("falls back to DEFAULT_SHELVES when undefined", () => {
      useShelvesStore.getState().initShelves(undefined);
      expect(useShelvesStore.getState().shelves).toHaveLength(DEFAULT_SHELVES.length);
    });

    it("falls back to DEFAULT_SHELVES when empty array", () => {
      useShelvesStore.getState().initShelves([]);
      expect(useShelvesStore.getState().shelves).toHaveLength(DEFAULT_SHELVES.length);
    });

    it("backfills maxVisibleGames to null when missing", () => {
      const shelf = makeShelf({ id: "s1" });
      // Simulate old shelf without maxVisibleGames
      const oldShelf = { ...shelf } as Record<string, unknown>;
      delete oldShelf.maxVisibleGames;
      useShelvesStore.getState().initShelves([oldShelf as never]);
      expect(useShelvesStore.getState().shelves[0].maxVisibleGames).toBeNull();
    });
  });

  // ── addShelf ─────────────────────────────────────────────────

  describe("addShelf", () => {
    it("appends a new shelf", () => {
      useShelvesStore.getState().initShelves(undefined);
      const initial = useShelvesStore.getState().shelves.length;
      useShelvesStore.getState().addShelf(makeShelf({ id: "new", name: "New Shelf" }));
      expect(useShelvesStore.getState().shelves).toHaveLength(initial + 1);
      expect(useShelvesStore.getState().shelves.at(-1)?.name).toBe("New Shelf");
    });
  });

  // ── updateShelf ──────────────────────────────────────────────

  describe("updateShelf", () => {
    it("updates a shelf by id", () => {
      useShelvesStore.getState().initShelves([makeShelf({ id: "s1", name: "Old Name" })]);
      useShelvesStore.getState().updateShelf("s1", { name: "New Name" });
      expect(useShelvesStore.getState().shelves[0].name).toBe("New Name");
    });

    it("only updates the targeted shelf", () => {
      useShelvesStore
        .getState()
        .initShelves([
          makeShelf({ id: "s1", name: "First" }),
          makeShelf({ id: "s2", name: "Second" }),
        ]);
      useShelvesStore.getState().updateShelf("s1", { name: "Updated" });
      expect(useShelvesStore.getState().shelves[1].name).toBe("Second");
    });
  });

  // ── removeShelf ──────────────────────────────────────────────

  describe("removeShelf", () => {
    it("removes a shelf by id", () => {
      useShelvesStore
        .getState()
        .initShelves([
          makeShelf({ id: "s1", name: "First" }),
          makeShelf({ id: "s2", name: "Second" }),
        ]);
      useShelvesStore.getState().removeShelf("s1");
      expect(useShelvesStore.getState().shelves).toHaveLength(1);
      expect(useShelvesStore.getState().shelves[0].id).toBe("s2");
    });

    it("prevents removing the last shelf", () => {
      useShelvesStore.getState().initShelves([makeShelf({ id: "s1" })]);
      useShelvesStore.getState().removeShelf("s1");
      expect(useShelvesStore.getState().shelves).toHaveLength(1);
    });
  });

  // ── reorderShelves ───────────────────────────────────────────

  describe("reorderShelves", () => {
    it("moves a shelf from one index to another", () => {
      useShelvesStore
        .getState()
        .initShelves([
          makeShelf({ id: "s1" }),
          makeShelf({ id: "s2" }),
          makeShelf({ id: "s3" }),
        ]);
      useShelvesStore.getState().reorderShelves(0, 2);
      expect(useShelvesStore.getState().shelves.map((s) => s.id)).toEqual([
        "s2",
        "s3",
        "s1",
      ]);
    });

    it("ignores invalid from index", () => {
      useShelvesStore
        .getState()
        .initShelves([makeShelf({ id: "s1" }), makeShelf({ id: "s2" })]);
      useShelvesStore.getState().reorderShelves(-1, 0);
      expect(useShelvesStore.getState().shelves.map((s) => s.id)).toEqual(["s1", "s2"]);
    });

    it("ignores invalid to index", () => {
      useShelvesStore
        .getState()
        .initShelves([makeShelf({ id: "s1" }), makeShelf({ id: "s2" })]);
      useShelvesStore.getState().reorderShelves(0, 5);
      expect(useShelvesStore.getState().shelves.map((s) => s.id)).toEqual(["s1", "s2"]);
    });
  });

  // ── setDisplayMode ───────────────────────────────────────────

  describe("setDisplayMode", () => {
    it("sets display mode for a shelf", () => {
      useShelvesStore
        .getState()
        .initShelves([makeShelf({ id: "s1", displayMode: "expanded" })]);
      useShelvesStore.getState().setDisplayMode("s1", "collapsed");
      expect(useShelvesStore.getState().shelves[0].displayMode).toBe("collapsed");
    });
  });

  // ── toggleGroupByGenre ───────────────────────────────────────

  describe("toggleGroupByGenre", () => {
    it("toggles groupByGenre for a shelf", () => {
      useShelvesStore
        .getState()
        .initShelves([makeShelf({ id: "s1", groupByGenre: false })]);
      useShelvesStore.getState().toggleGroupByGenre("s1");
      expect(useShelvesStore.getState().shelves[0].groupByGenre).toBe(true);
      useShelvesStore.getState().toggleGroupByGenre("s1");
      expect(useShelvesStore.getState().shelves[0].groupByGenre).toBe(false);
    });
  });

  // ── setEditingShelf ──────────────────────────────────────────

  describe("setEditingShelf", () => {
    it("sets editing shelf id", () => {
      useShelvesStore.getState().setEditingShelf("s1");
      expect(useShelvesStore.getState().editingShelfId).toBe("s1");
    });

    it("clears editing shelf id with null", () => {
      useShelvesStore.getState().setEditingShelf("s1");
      useShelvesStore.getState().setEditingShelf(null);
      expect(useShelvesStore.getState().editingShelfId).toBeNull();
    });
  });
});
