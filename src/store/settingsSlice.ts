import { create } from "zustand";
import type { AppSettings } from "../types";
import type { IconSetId } from "../types/theme";
import { ICON_SET_OPTIONS } from "../types/theme";
import { settingsApi } from "../services/tauri";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

/** Migrate removed icon set IDs ("soft", "sharp", "retro", "bold") → "classic" */
function migrateIconSet(settings: AppSettings): AppSettings {
  const validIds = new Set<string>(ICON_SET_OPTIONS.map((o) => o.id));
  if (settings.iconSet && !validIds.has(settings.iconSet)) {
    logger.warn("settingsSlice", "settings", "Migrating removed icon set", {
      from: settings.iconSet,
      to: "classic",
    });
    return { ...settings, iconSet: "classic" as IconSetId };
  }
  return settings;
}

interface SettingsState {
  settings: AppSettings | null;
  isLoading: boolean;
  error: string | null;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  clearError: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  isLoading: false,
  error: null,

  loadSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const raw = await settingsApi.load();
      const settings = migrateIconSet(raw);
      set({ settings, isLoading: false });
    } catch (e) {
      const msg = getErrorMessage(e);
      logger.error("settingsSlice", "settings", "Failed to load settings", {
        error: msg,
      });
      set({ error: msg, isLoading: false });
    }
  },

  saveSettings: async (settings: AppSettings) => {
    set({ error: null });
    try {
      await settingsApi.save(settings);
      set({ settings });
    } catch (e) {
      const msg = getErrorMessage(e);
      logger.error("settingsSlice", "settings", "Failed to save settings", {
        error: msg,
      });
      set({ error: msg });
    }
  },

  clearError: () => set({ error: null }),
}));
