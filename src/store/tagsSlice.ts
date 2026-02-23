import { create } from "zustand";
import type { Tag, CreateTagRequest, UpdateTagRequest } from "../types";
import { tagsApi } from "../services/tauri";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

interface TagsState {
  tags: Tag[];
  gameTagMap: Map<string, number[]>;
  isLoading: boolean;
  error: string | null;

  loadTags: () => Promise<void>;
  loadAllGameTags: () => Promise<void>;
  createTag: (req: CreateTagRequest) => Promise<Tag | null>;
  updateTag: (req: UpdateTagRequest) => Promise<void>;
  deleteTag: (id: number) => Promise<void>;
  reorderTags: (tagIds: number[]) => Promise<void>;
  setGameTags: (gameId: string, tagIds: number[]) => Promise<void>;
  bulkAddTag: (gameIds: string[], tagIds: number[]) => Promise<void>;
  getGameTagIds: (gameId: string) => number[];
}

export const useTagsStore = create<TagsState>((set, get) => ({
  tags: [],
  gameTagMap: new Map(),
  isLoading: false,
  error: null,

  loadTags: async () => {
    set({ isLoading: true, error: null });
    try {
      const tags = await tagsApi.getAllTags();
      logger.info("tagsSlice", "tags", "Tags loaded", { count: tags.length });
      set({ tags, isLoading: false });
    } catch (e) {
      const msg = getErrorMessage(e);
      logger.error("tagsSlice", "tags", "Failed to load tags", { error: msg });
      set({ error: msg, isLoading: false });
    }
  },

  loadAllGameTags: async () => {
    try {
      const pairs = await tagsApi.getAllGameTags();
      const map = new Map<string, number[]>();
      for (const [gameId, tagId] of pairs) {
        const existing = map.get(gameId) ?? [];
        existing.push(tagId);
        map.set(gameId, existing);
      }
      set({ gameTagMap: map });
    } catch (e) {
      logger.error("tagsSlice", "tags", "Failed to load game tags", {
        error: getErrorMessage(e),
      });
    }
  },

  createTag: async (req) => {
    try {
      const tag = await tagsApi.createTag(req);
      logger.info("tagsSlice", "tags", "Tag created", {
        id: tag.id,
        name: tag.name,
      });
      set((s) => ({ tags: [...s.tags, tag] }));
      return tag;
    } catch (e) {
      const msg = getErrorMessage(e);
      logger.error("tagsSlice", "tags", "Failed to create tag", {
        error: msg,
      });
      set({ error: msg });
      return null;
    }
  },

  updateTag: async (req) => {
    try {
      await tagsApi.updateTag(req);
      logger.info("tagsSlice", "tags", "Tag updated", {
        id: req.id,
        name: req.name,
      });
      set((s) => ({
        tags: s.tags.map((t) =>
          t.id === req.id ? { ...t, name: req.name, colorIndex: req.colorIndex } : t,
        ),
      }));
    } catch (e) {
      logger.error("tagsSlice", "tags", "Failed to update tag", {
        error: getErrorMessage(e),
      });
    }
  },

  deleteTag: async (id) => {
    try {
      await tagsApi.deleteTag(id);
      logger.info("tagsSlice", "tags", "Tag deleted", { id });
      set((s) => {
        const newMap = new Map(s.gameTagMap);
        for (const [gameId, tagIds] of newMap) {
          const filtered = tagIds.filter((tid) => tid !== id);
          if (filtered.length > 0) {
            newMap.set(gameId, filtered);
          } else {
            newMap.delete(gameId);
          }
        }
        return { tags: s.tags.filter((t) => t.id !== id), gameTagMap: newMap };
      });
    } catch (e) {
      logger.error("tagsSlice", "tags", "Failed to delete tag", {
        error: getErrorMessage(e),
      });
    }
  },

  reorderTags: async (tagIds) => {
    try {
      await tagsApi.reorderTags({ tagIds });
      logger.info("tagsSlice", "tags", "Tags reordered");
      set((s) => ({
        tags: tagIds
          .map((id, i) => {
            const tag = s.tags.find((t) => t.id === id);
            return tag ? { ...tag, sortOrder: i } : null;
          })
          .filter((t): t is Tag => t !== null),
      }));
    } catch (e) {
      logger.error("tagsSlice", "tags", "Failed to reorder tags", {
        error: getErrorMessage(e),
      });
    }
  },

  setGameTags: async (gameId, tagIds) => {
    try {
      await tagsApi.setGameTags({ gameId, tagIds });
      logger.info("tagsSlice", "tags", "Game tags set", {
        gameId,
        count: tagIds.length,
      });
      set((s) => {
        const newMap = new Map(s.gameTagMap);
        if (tagIds.length > 0) {
          newMap.set(gameId, tagIds);
        } else {
          newMap.delete(gameId);
        }
        return { gameTagMap: newMap };
      });
    } catch (e) {
      logger.error("tagsSlice", "tags", "Failed to set game tags", {
        error: getErrorMessage(e),
      });
    }
  },

  bulkAddTag: async (gameIds, tagIds) => {
    try {
      await tagsApi.bulkAddTag(gameIds, tagIds);
      logger.info("tagsSlice", "tags", "Bulk tags added", {
        games: gameIds.length,
        tags: tagIds.length,
      });
      await get().loadAllGameTags();
    } catch (e) {
      logger.error("tagsSlice", "tags", "Failed to bulk add tags", {
        error: getErrorMessage(e),
      });
    }
  },

  getGameTagIds: (gameId) => get().gameTagMap.get(gameId) ?? [],
}));
