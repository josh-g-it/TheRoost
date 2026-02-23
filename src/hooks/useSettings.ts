import { useEffect } from "react";
import { useSettingsStore } from "../store/settingsSlice";
import { useUIStore } from "../store/uiSlice";
import { useShelvesStore } from "../store/shelvesSlice";
import { useActivityLayoutStore } from "../store/activityLayoutSlice";
import { logger } from "../utils/logger";
import { DEFAULT_CARD_DISPLAY } from "../types";

export function useSettings() {
  const store = useSettingsStore();
  const { settings, isLoading, loadSettings } = store;
  const setCardDisplay = useUIStore((s) => s.setCardDisplay);
  const initShelves = useShelvesStore((s) => s.initShelves);
  const initActivityLayout = useActivityLayoutStore((s) => s.initLayout);

  useEffect(() => {
    if (!settings && !isLoading) {
      logger.debug("useSettings", "settings", "Auto-loading settings on mount");
      loadSettings();
    }
  }, [settings, isLoading, loadSettings]);

  // Sync cardDisplay from loaded settings to UI store
  useEffect(() => {
    if (settings?.cardDisplay) {
      setCardDisplay(settings.cardDisplay);
    } else if (settings) {
      setCardDisplay({ ...DEFAULT_CARD_DISPLAY });
    }
  }, [settings, setCardDisplay]);

  // Sync shelves from loaded settings to shelves store
  useEffect(() => {
    if (settings) {
      initShelves(settings.shelves);
    }
  }, [settings, initShelves]);

  // Sync activity layout from loaded settings to activity layout store
  useEffect(() => {
    if (settings) {
      initActivityLayout(settings.activityLayout);
    }
  }, [settings, initActivityLayout]);

  return store;
}
