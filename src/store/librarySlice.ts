import { create } from "zustand";
import type { Game, GameLibrary } from "../types";
import { steamApi, externalApi } from "../services/tauri";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

/** Merge two game arrays, deduplicating by source+sourceId. */
export function mergeGames(primary: Game[], secondary: Game[]): Game[] {
  const seen = new Set(primary.map((g) => `${g.source}:${g.sourceId}`));
  const merged = [...primary];
  for (const game of secondary) {
    const key = `${game.source}:${game.sourceId}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(game);
    }
  }
  return merged.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

interface LibraryState {
  library: GameLibrary | null;
  isLoading: boolean;
  error: string | null;
  refreshLibrary: (apiKey: string, steamId: string) => Promise<void>;
  scanLocalOnly: () => Promise<void>;
  addGame: (game: Game) => void;
  removeGame: (gameId: string) => void;
  clearError: () => void;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  library: null,
  isLoading: false,
  error: null,

  refreshLibrary: async (apiKey: string, steamId: string) => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      // Scan Steam and external launchers in parallel
      const [steamResult, externalResult] = await Promise.allSettled([
        steamApi.getFullLibrary(apiKey, steamId),
        externalApi.scanExternalGames(),
      ]);

      let games: Game[] = [];
      const warnings: string[] = [];

      if (steamResult.status === "fulfilled") {
        games = steamResult.value.games;
        warnings.push(...steamResult.value.warnings);
      } else {
        const msg = getErrorMessage(steamResult.reason);
        logger.warn("librarySlice", "library", "Steam scan failed", { error: msg });
        warnings.push(`Steam scan failed: ${msg}`);
      }

      if (externalResult.status === "fulfilled") {
        games = mergeGames(games, externalResult.value.games);
        warnings.push(...externalResult.value.warnings);
        if (externalResult.value.games.length > 0) {
          logger.info("librarySlice", "library", "External games merged", {
            count: externalResult.value.games.length,
          });
        }
      } else {
        const msg = getErrorMessage(externalResult.reason);
        logger.warn("librarySlice", "library", "External scan failed", { error: msg });
        warnings.push(`External launcher scan failed: ${msg}`);
      }

      const installed = games.filter((g) => g.isInstalled).length;
      logger.info("librarySlice", "library", "Library loaded", {
        totalGames: games.length,
        installedGames: installed,
      });

      for (const w of warnings) {
        logger.warn("librarySlice", "library", w);
      }

      set({
        library: { games, totalCount: games.length, warnings },
        isLoading: false,
      });
    } catch (e) {
      const msg = getErrorMessage(e);
      logger.error("librarySlice", "library", "Library refresh failed", { error: msg });
      set({ error: msg, isLoading: false });
    }
  },

  scanLocalOnly: async () => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      // Scan Steam local files and external launchers in parallel
      const [steamResult, externalResult] = await Promise.allSettled([
        steamApi.scanLocalLibrary(),
        externalApi.scanExternalGames(),
      ]);

      let games: Game[] = [];
      const warnings: string[] = [];

      if (steamResult.status === "fulfilled") {
        games = steamResult.value;
      } else {
        const msg = getErrorMessage(steamResult.reason);
        logger.warn("librarySlice", "scan", "Steam local scan failed", { error: msg });
        warnings.push(`Steam local scan failed: ${msg}`);
      }

      if (externalResult.status === "fulfilled") {
        games = mergeGames(games, externalResult.value.games);
        warnings.push(...externalResult.value.warnings);
      } else {
        const msg = getErrorMessage(externalResult.reason);
        logger.warn("librarySlice", "scan", "External scan failed", { error: msg });
      }

      logger.info("librarySlice", "scan", "Local + external scan complete", {
        gameCount: games.length,
      });
      set({
        library: { games, totalCount: games.length, warnings },
        isLoading: false,
      });
    } catch (e) {
      const msg = getErrorMessage(e);
      logger.error("librarySlice", "scan", "Local scan failed", { error: msg });
      set({ error: msg, isLoading: false });
    }
  },

  addGame: (game: Game) => {
    const lib = get().library;
    if (!lib) return;
    const games = mergeGames(lib.games, [game]);
    set({ library: { ...lib, games, totalCount: games.length } });
  },

  removeGame: (gameId: string) => {
    const lib = get().library;
    if (!lib) return;
    const games = lib.games.filter((g) => g.gameId !== gameId);
    set({ library: { ...lib, games, totalCount: games.length } });
  },

  clearError: () => set({ error: null }),
}));
