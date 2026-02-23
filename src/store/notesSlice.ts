import { create } from "zustand";
import type { GameNoteWithName } from "../types";
import { notesApi } from "../services/tauri";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

interface NotesState {
  notes: GameNoteWithName[];
  isLoading: boolean;
  error: string | null;
  /** Set by command palette "Open Game Notes" action to auto-expand a specific note */
  scrollTarget: string | null;

  loadNotes: () => Promise<void>;
  saveNote: (gameId: string, content: string) => Promise<void>;
  deleteNote: (gameId: string) => Promise<void>;
  setScrollTarget: (gameId: string | null) => void;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  isLoading: false,
  error: null,
  scrollTarget: null,

  loadNotes: async () => {
    set({ isLoading: true, error: null });
    try {
      const notes = await notesApi.getAllNotesWithContent();
      logger.info("notesSlice", "notes", "Notes loaded", { count: notes.length });
      set({ notes, isLoading: false });
    } catch (e) {
      const msg = getErrorMessage(e);
      logger.error("notesSlice", "notes", "Failed to load notes", { error: msg });
      set({ error: msg, isLoading: false });
    }
  },

  saveNote: async (gameId, content) => {
    try {
      await notesApi.saveGameNote(gameId, content);
      // Refresh the list to update timestamps and content
      await get().loadNotes();
    } catch (e) {
      logger.error("notesSlice", "notes", "Failed to save note", {
        error: getErrorMessage(e),
      });
    }
  },

  deleteNote: async (gameId) => {
    try {
      await notesApi.deleteGameNote(gameId);
      set((s) => ({ notes: s.notes.filter((n) => n.gameId !== gameId) }));
    } catch (e) {
      logger.error("notesSlice", "notes", "Failed to delete note", {
        error: getErrorMessage(e),
      });
    }
  },

  setScrollTarget: (gameId) => set({ scrollTarget: gameId }),
}));
