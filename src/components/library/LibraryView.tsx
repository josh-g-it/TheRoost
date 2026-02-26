import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Header } from "../layout/Header";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { LibraryControls } from "./LibraryControls";
import { GameDetail } from "./GameDetail";
import { ArtManagementMenu } from "./ArtManagementMenu";
import { Shelf } from "./Shelf";
import { ShelfEditorDialog } from "./ShelfEditorDialog";
import { AddCustomGameDialog } from "./AddCustomGameDialog";
import { WelcomeDialog } from "./WelcomeDialog";
import { GameList } from "./GameList";
import { useSteamLibrary } from "../../hooks/useSteamLibrary";
import { useUIStore } from "../../store/uiSlice";
import { useMetadataStore } from "../../store/metadataSlice";
import { useTagsStore } from "../../store/tagsSlice";
import { useFavoritesStore } from "../../store/favoritesSlice";
import { useHiddenGamesStore } from "../../store/hiddenGamesSlice";
import { useSavedFiltersStore } from "../../store/savedFiltersSlice";
import { useSettingsStore } from "../../store/settingsSlice";
import { useShelvesStore, getShelvesForPersistence } from "../../store/shelvesSlice";
import { useAchievementsStore } from "../../store/achievementsSlice";
import { useBackgroundTasksStore } from "../../store/backgroundTasksSlice";
import { useRatingsStore } from "../../store/ratingsSlice";
import { useInstallStore } from "../../store/installSlice";
import { processShelfGames } from "../../utils/shelfFiltering";
import { filterGames } from "../../utils/filtering";
import { sortGames } from "../../utils/sorting";
import { metadataApi } from "../../services/tauri";
import { logger } from "../../utils/logger";
import type { Game } from "../../types";
import "./LibraryView.css";

/**
 * Prioritize games for metadata fetching:
 * 1. Top 50 by most recently played (lastPlayed desc)
 * 2. Next 100 by playtime (playtimeForever desc), skipping already-selected
 * 3. Everything else
 */
function prioritizeGameIds(games: Game[]): string[] {
  const selected = new Set<string>();
  const result: string[] = [];

  // Phase 1: Top 50 most recently played
  const byRecent = games
    .filter((g) => g.lastPlayed != null && g.lastPlayed > 0)
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
  for (const g of byRecent.slice(0, 50)) {
    if (!selected.has(g.gameId)) {
      selected.add(g.gameId);
      result.push(g.gameId);
    }
  }

  // Phase 2: Top 100 by playtime (skip already selected)
  const byPlaytime = [...games].sort((a, b) => b.playtimeForever - a.playtimeForever);
  let added = 0;
  for (const g of byPlaytime) {
    if (added >= 100) break;
    if (!selected.has(g.gameId)) {
      selected.add(g.gameId);
      result.push(g.gameId);
      added++;
    }
  }

  // Phase 3: Everything else
  for (const g of games) {
    if (!selected.has(g.gameId)) {
      result.push(g.gameId);
    }
  }

  return result;
}

// Module-level flag: persists across component mount/unmount cycles (e.g. navigation).
// Prevents restarting metadata+achievement fetch when returning to Library page.
let batchFetchStarted = false;

export function LibraryView() {
  const { library, isLoading, error, refresh } = useSteamLibrary();
  const { viewMode, sortBy, sortOrder, filters, selectedGameId, selectGame } =
    useUIStore();
  const customGameDialogOpen = useUIStore((s) => s.customGameDialogOpen);
  const editingCustomGameId = useUIStore((s) => s.editingCustomGameId);
  const closeCustomGameDialog = useUIStore((s) => s.closeCustomGameDialog);
  const artMenuGameId = useUIStore((s) => s.artMenuGameId);
  const artMenuStep = useUIStore((s) => s.artMenuStep);
  const favorites = useFavoritesStore((s) => s.favorites);
  const loadFavorites = useFavoritesStore((s) => s.loadFavorites);
  const gameTagMap = useTagsStore((s) => s.gameTagMap);
  const loadTags = useTagsStore((s) => s.loadTags);
  const loadAllGameTags = useTagsStore((s) => s.loadAllGameTags);
  const hiddenGames = useHiddenGamesStore((s) => s.hiddenGames);
  const loadHiddenGames = useHiddenGamesStore((s) => s.loadHiddenGames);
  const loadSavedFilters = useSavedFiltersStore((s) => s.loadSavedFilters);
  const cache = useMetadataStore((s) => s.cache);
  const shelves = useShelvesStore((s) => s.shelves);
  const editingShelfId = useShelvesStore((s) => s.editingShelfId);
  const setEditingShelf = useShelvesStore((s) => s.setEditingShelf);
  const addShelf = useShelvesStore((s) => s.addShelf);
  const updateShelf = useShelvesStore((s) => s.updateShelf);
  const settings = useSettingsStore((s) => s.settings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const ratings = useRatingsStore((s) => s.ratings);
  const loadAllRatings = useRatingsStore((s) => s.loadAllRatings);
  const updateInstallProgress = useInstallStore((s) => s.updateProgress);
  const completeInstall = useInstallStore((s) => s.completeInstall);
  const activeInstalls = useInstallStore((s) => s.activeInstalls);

  // Load tags, favorites, hidden games, saved filters, ratings on mount
  useEffect(() => {
    loadTags();
    loadAllGameTags();
    loadFavorites();
    loadHiddenGames();
    loadSavedFilters();
    loadAllRatings();
  }, [
    loadTags,
    loadAllGameTags,
    loadFavorites,
    loadHiddenGames,
    loadSavedFilters,
    loadAllRatings,
  ]);

  // Listen for install progress and completion events from the backend
  useEffect(() => {
    const listeners: (() => void)[] = [];

    listen<import("../../types/install").InstallProgress[]>("install-progress", (event) =>
      updateInstallProgress(event.payload),
    ).then((unlisten) => listeners.push(unlisten));

    listen<import("../../types/install").InstallProgress>("install-complete", (event) => {
      completeInstall(event.payload.sourceId);
      refresh();
      logger.info("LibraryView", "install", `Install complete: ${event.payload.name}`);
    }).then((unlisten) => listeners.push(unlisten));

    return () => {
      for (const unlisten of listeners) unlisten();
    };
  }, [updateInstallProgress, completeInstall, refresh]);

  const allGames = useMemo(() => library?.games ?? [], [library?.games]);

  // Derive set of game IDs with pending updates from install monitor
  const updatePendingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const progress of activeInstalls.values()) {
      if (progress.status === "update_required" && progress.gameId) {
        ids.add(progress.gameId);
      }
    }
    return ids;
  }, [activeInstalls]);

  // Per-shelf processed games
  const shelfGamesMap = useMemo(() => {
    if (allGames.length === 0) return new Map<string, import("../../types").Game[]>();
    const map = new Map<string, import("../../types").Game[]>();
    for (const shelf of shelves) {
      map.set(
        shelf.id,
        processShelfGames(
          allGames,
          shelf,
          filters.searchQuery,
          favorites,
          gameTagMap,
          hiddenGames,
          cache,
        ),
      );
    }
    return map;
  }, [allGames, shelves, filters.searchQuery, favorites, gameTagMap, hiddenGames, cache]);

  // Flat filtered + sorted game list for list mode (no shelves)
  const globalFilteredGames = useMemo(() => {
    if (viewMode !== "list") return [];
    const filtered = filterGames(
      allGames,
      filters,
      favorites,
      gameTagMap,
      hiddenGames,
      cache,
      ratings,
      updatePendingIds,
    );
    return sortGames(filtered, sortBy, sortOrder, cache, ratings);
  }, [
    viewMode,
    allGames,
    filters,
    favorites,
    gameTagMap,
    hiddenGames,
    cache,
    ratings,
    updatePendingIds,
    sortBy,
    sortOrder,
  ]);

  // Total displayed games — list mode uses global filter count, grid uses unique shelf count
  const totalDisplayedGames = useMemo(() => {
    if (viewMode === "list") return globalFilteredGames.length;
    const seen = new Set<string>();
    for (const games of shelfGamesMap.values()) {
      for (const g of games) seen.add(g.gameId);
    }
    return seen.size;
  }, [viewMode, globalFilteredGames, shelfGamesMap]);

  const selectedGame = useMemo(
    () => allGames.find((g) => g.gameId === selectedGameId) ?? null,
    [allGames, selectedGameId],
  );

  // Batch fetch: Phase 1 (SteamSpy metadata) → Phase 2 (achievements) → Phase 3 (Store API backfill).
  // Metadata uses SteamSpy as primary source (fast, no rate-limiting).
  // Achievements start only after metadata completes.
  // Store API backfill runs silently in the background after achievements.
  const fetchBatch = useMetadataStore((s) => s.fetchBatch);
  const batchFetchAchievements = useAchievementsStore((s) => s.batchFetchAll);

  useEffect(() => {
    if (allGames.length === 0 || batchFetchStarted) return;
    batchFetchStarted = true;

    // Priority ordering: recently played → most played → rest
    const gameIds = prioritizeGameIds(allGames);
    const CHUNK_SIZE = 25;
    let unlistenPromise: Promise<() => void> | null = null;

    (async () => {
      try {
        const { startTask, completeTask, updateProgress } =
          useBackgroundTasksStore.getState();

        // Phase 1: Metadata (SteamSpy) — fetch in small chunks for responsive progress
        startTask("metadata", gameIds.length);
        let loaded = 0;
        try {
          for (let i = 0; i < gameIds.length; i += CHUNK_SIZE) {
            const chunk = gameIds.slice(i, i + CHUNK_SIZE);
            await fetchBatch(chunk);
            loaded += chunk.length;
            updateProgress("metadata", loaded, gameIds.length);
          }
        } finally {
          completeTask("metadata");
        }

        // Phase 2: Achievements (starts after metadata finishes)
        startTask("achievements");

        unlistenPromise = listen<{ current: number; total: number }>(
          "achievement-batch-progress",
          (event) => {
            useBackgroundTasksStore
              .getState()
              .updateProgress("achievements", event.payload.current, event.payload.total);
          },
        );

        try {
          await batchFetchAchievements();
        } finally {
          completeTask("achievements");
          unlistenPromise?.then((fn) => fn());
        }

        // Phase 3: Store API background enrichment (descriptions, screenshots, etc.)
        // Runs silently — slow pace (1 req/1.5s) to avoid rate limiting
        startTask("storeDetails");
        try {
          const enriched = await metadataApi.backfillStoreDetails();
          logger.info("LibraryView", "metadata", "Store API enrichment complete", {
            enriched,
          });
        } catch (e) {
          logger.warn("LibraryView", "metadata", "Store API enrichment failed", {
            error: String(e),
          });
        } finally {
          completeTask("storeDetails");
        }
      } catch (e) {
        // Reset flag so a future navigation or refresh can retry
        batchFetchStarted = false;
        logger.error("LibraryView", "metadata", "Batch pipeline failed unexpectedly", {
          error: String(e),
        });
      }
    })();

    return () => {
      unlistenPromise?.then((fn) => fn());
    };
  }, [allGames, fetchBatch, batchFetchAchievements]);

  // Welcome dialog — shown once after onboarding
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (settings && !settings.hasSeenWelcome && !isLoading && library) {
      setShowWelcome(true);
    }
  }, [settings, isLoading, library]);

  const handleWelcomeClose = useCallback(() => {
    setShowWelcome(false);
    if (settings) {
      saveSettings({ ...settings, hasSeenWelcome: true });
    }
  }, [settings, saveSettings]);

  // Persist shelves to settings.json
  const persistShelves = useCallback(() => {
    if (!settings) return;
    const currentShelves = getShelvesForPersistence();
    saveSettings({ ...settings, shelves: currentShelves });
    logger.debug("LibraryView", "shelf", "Shelves persisted to settings", {
      count: currentShelves.length,
    });
  }, [settings, saveSettings]);

  // Add shelf handler
  const handleAddShelf = useCallback(() => {
    setEditingShelf("__new__");
  }, [setEditingShelf]);

  // Shelf editor save handler
  const handleShelfSave = useCallback(
    (shelf: import("../../types/shelf").ShelfConfig) => {
      if (editingShelfId === "__new__") {
        addShelf(shelf);
      } else {
        updateShelf(shelf.id, shelf);
      }
      setEditingShelf(null);
      // Persist after state update
      setTimeout(() => {
        if (!settings) return;
        const currentShelves = getShelvesForPersistence();
        saveSettings({ ...settings, shelves: currentShelves });
      }, 0);
    },
    [editingShelfId, addShelf, updateShelf, setEditingShelf, settings, saveSettings],
  );

  return (
    <div className="library-view">
      <Header
        title="Library"
        subtitle={library ? `${library.totalCount} games` : undefined}
      />

      <LibraryControls
        totalGames={totalDisplayedGames}
        onRefresh={refresh}
        isLoading={isLoading}
        hiddenCount={hiddenGames.size}
        shelvesEnabled={viewMode === "grid" && shelves.length > 0}
        updatePendingCount={updatePendingIds.size}
      />

      {library?.warnings && library.warnings.length > 0 && (
        <div className="library-view__warnings" role="alert">
          {library.warnings.map((w, i) => (
            <p key={i} className="library-view__warning">
              {w}
            </p>
          ))}
        </div>
      )}

      <div className="library-view__content">
        {isLoading && !library ? (
          <LoadingSpinner size="lg" message="Scanning your library..." />
        ) : error ? (
          <div className="library-view__error">
            <p>Failed to load library</p>
            <p className="library-view__error-detail">{error}</p>
            <button className="library-view__retry" onClick={refresh}>
              Try Again
            </button>
          </div>
        ) : (
          <>
            {viewMode === "list" ? (
              <GameList games={globalFilteredGames} onSelectGame={selectGame} />
            ) : (
              <>
                {shelves.map((shelf, index) => (
                  <Shelf
                    key={shelf.id}
                    shelf={shelf}
                    games={shelfGamesMap.get(shelf.id) ?? []}
                    shelfIndex={index}
                    shelfCount={shelves.length}
                    onSelectGame={selectGame}
                    onPersist={persistShelves}
                  />
                ))}

                <button
                  className="library-view__add-shelf"
                  onClick={handleAddShelf}
                  aria-label="Add a new shelf"
                >
                  + Add Shelf
                </button>
              </>
            )}
          </>
        )}
      </div>

      {selectedGame && (
        <GameDetail
          game={selectedGame}
          onClose={() => selectGame(null)}
          onPersistShelves={persistShelves}
        />
      )}

      {artMenuGameId &&
        artMenuStep &&
        (() => {
          const artGame = allGames.find((g) => g.gameId === artMenuGameId);
          if (!artGame) return null;
          return (
            <ArtManagementMenu
              gameId={artMenuGameId}
              gameName={artGame.name}
              gameSource={artGame.source}
              gameSourceId={artGame.sourceId}
              onClose={() => {}}
            />
          );
        })()}

      {editingShelfId && (
        <ShelfEditorDialog
          editingShelfId={editingShelfId}
          onClose={() => setEditingShelf(null)}
          onSave={handleShelfSave}
        />
      )}

      {customGameDialogOpen && (
        <AddCustomGameDialog
          editGame={
            editingCustomGameId
              ? (allGames.find((g) => g.gameId === editingCustomGameId) ?? null)
              : null
          }
          onClose={closeCustomGameDialog}
        />
      )}

      {showWelcome && <WelcomeDialog onClose={handleWelcomeClose} />}
    </div>
  );
}
