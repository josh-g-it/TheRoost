import { describe, it, expect, vi, beforeEach } from "vitest";
import { useNotesStore } from "./notesSlice";

vi.mock("../services/tauri", () => ({
  notesApi: {
    getAllNotesWithContent: vi.fn().mockResolvedValue([
      {
        gameId: "__general__",
        content: "General note",
        updatedAt: 1000000,
        gameName: null,
      },
      {
        gameId: "game-1",
        content: "Game note",
        updatedAt: 999999,
        gameName: "Test Game",
      },
    ]),
    saveGameNote: vi.fn().mockResolvedValue({
      gameId: "game-1",
      content: "Updated",
      updatedAt: 1000001,
    }),
    deleteGameNote: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("notesSlice", () => {
  beforeEach(() => {
    useNotesStore.setState({ notes: [], isLoading: false, error: null });
  });

  it("loads notes", async () => {
    await useNotesStore.getState().loadNotes();
    const { notes } = useNotesStore.getState();
    expect(notes).toHaveLength(2);
    expect(notes[0].gameId).toBe("__general__");
    expect(notes[1].gameId).toBe("game-1");
  });

  it("deletes a note optimistically", async () => {
    useNotesStore.setState({
      notes: [{ gameId: "game-1", content: "Test", updatedAt: 1, gameName: "G" }],
    });
    await useNotesStore.getState().deleteNote("game-1");
    expect(useNotesStore.getState().notes).toHaveLength(0);
  });
});
