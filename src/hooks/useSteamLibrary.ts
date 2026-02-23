import { useEffect } from "react";
import { useLibraryStore } from "../store/librarySlice";
import { useSettingsStore } from "../store/settingsSlice";
import { logger } from "../utils/logger";

export function useSteamLibrary() {
  const library = useLibraryStore();
  const settings = useSettingsStore((s) => s.settings);
  const { library: libraryData, isLoading, refreshLibrary, scanLocalOnly } = library;

  useEffect(() => {
    if (!libraryData && !isLoading && settings) {
      const mode = settings.steamApiKey && settings.steamId ? "full" : "local-only";
      logger.info("useSteamLibrary", "library", "Auto-loading library", { mode });
      if (mode === "full") {
        refreshLibrary(settings.steamApiKey!, settings.steamId!);
      } else {
        scanLocalOnly();
      }
    }
  }, [settings, libraryData, isLoading, refreshLibrary, scanLocalOnly]);

  const refresh = () => {
    if (settings?.steamApiKey && settings?.steamId) {
      library.refreshLibrary(settings.steamApiKey, settings.steamId);
    } else {
      library.scanLocalOnly();
    }
  };

  return { ...library, refresh };
}
