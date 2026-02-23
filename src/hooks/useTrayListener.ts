import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useUIStore } from "../store/uiSlice";
import { useSettingsStore } from "../store/settingsSlice";
import { useLibraryStore } from "../store/librarySlice";
import { executeActionById } from "../utils/commandPalette";
import type { PaletteContext } from "../types";
import { logger } from "../utils/logger";

/**
 * Listens for navigation events from the system tray and overlay window.
 * - "navigate-to-game": Opens a specific game in the library (tray menu click)
 * - "navigate-to-route": Navigates to a route (overlay cross-window command)
 * - "settings-changed": Reloads settings from disk (overlay saved settings)
 * - "apply-tag-filter": Sets tag filters on library and navigates (overlay tag filter)
 * - "execute-palette-action": Executes a command palette action (overlay relay)
 */
export function useTrayListener() {
  const navigate = useNavigate();

  useEffect(() => {
    const unlistenGame = listen<string>("navigate-to-game", (event) => {
      const gameId = event.payload;
      logger.info("tray", "ui", `Navigating to game ${gameId} from tray`);
      navigate("/library");
      useUIStore.getState().selectGame(gameId);
    });

    const unlistenRoute = listen<string>("navigate-to-route", (event) => {
      const route = event.payload;
      logger.info("overlay", "ui", `Navigating to ${route} from overlay`);
      navigate(route);
    });

    const unlistenSettings = listen("settings-changed", () => {
      logger.info("overlay", "settings", "Settings changed externally, reloading");
      useSettingsStore.getState().loadSettings();
    });

    const unlistenTagFilter = listen<number[]>("apply-tag-filter", (event) => {
      const tagIds = event.payload;
      logger.info("overlay", "ui", "Applying tag filter from overlay", { tagIds });
      useUIStore.getState().setFilterByTagIds(tagIds);
      navigate("/library");
    });

    const unlistenPaletteAction = listen<{ actionId: string; gameId?: string }>(
      "execute-palette-action",
      (event) => {
        const { actionId, gameId } = event.payload;
        logger.info("overlay", "ui", "Executing palette action from overlay", {
          actionId,
        });

        const settings = useSettingsStore.getState().settings;
        if (!settings) return;

        const games = useLibraryStore.getState().library?.games ?? [];

        const ctx: PaletteContext = {
          navigate,
          closeCommandCenter: () => {},
          settings,
          saveSettings: (s) => {
            invoke("save_settings", { settings: s }).then(() => {
              useSettingsStore.getState().loadSettings();
              // Notify overlay so it picks up the change
              invoke("notify_settings_changed").catch(() => {});
            });
          },
        };

        executeActionById(actionId, ctx, { gameId, games });
      },
    );

    return () => {
      unlistenGame.then((fn) => fn());
      unlistenRoute.then((fn) => fn());
      unlistenSettings.then((fn) => fn());
      unlistenTagFilter.then((fn) => fn());
      unlistenPaletteAction.then((fn) => fn());
    };
  }, [navigate]);
}
