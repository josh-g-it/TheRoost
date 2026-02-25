import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSettings } from "./useSettings";
import { useSettingsStore } from "../store/settingsSlice";
import { useUIStore } from "../store/uiSlice";
import { useShelvesStore } from "../store/shelvesSlice";

import type { AppSettings } from "../types";

const mockLoad = vi.fn();
const mockSave = vi.fn();

vi.mock("../services/tauri", () => ({
  settingsApi: {
    load: (...args: unknown[]) => mockLoad(...args),
    save: (...args: unknown[]) => mockSave(...args),
  },
}));

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    steamApiKey: null,
    steamId: null,
    isFirstRun: false,
    theme: "dark-gaming",
    iconSet: "classic",
    fontFamily: "system",
    uiScale: "normal",
    cardDisplay: {
      showGenreTags: true,
      showPlaytime: true,
      showInstalledBadge: true,
      showTags: true,
      gridSize: "medium" as const,
      listDensity: "default" as const,
      listColumns: [],
    },
    profileChartOptions: { bucketPreset: "default", genreTopN: 8, devPubTopN: 10 },
    commandCenterSlots: [],
    commandCenterShortcut: { key: "Space", modifiers: ["Control"] },
    railMode: "icons-and-labels",
    minimizeToTray: false,
    devSettingsEnabled: false,
    ...overrides,
  } as AppSettings;
}

describe("useSettings", () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null, isLoading: false, error: null });
    useUIStore.setState({
      cardDisplay: {
        showGenreTags: true,
        showPlaytime: true,
        showInstalledBadge: true,
        showTags: true,
        showRatingBadge: false,
        gridSize: "medium",
        listDensity: "default",
        listColumns: [],
      },
    });
    useShelvesStore.setState({ shelves: [] });
    vi.clearAllMocks();
  });

  it("auto-loads settings on mount when not loaded", async () => {
    const settings = makeSettings({ theme: "arctic-frost" });
    mockLoad.mockResolvedValue(settings);

    renderHook(() => useSettings());

    await waitFor(() => {
      expect(mockLoad).toHaveBeenCalled();
      expect(useSettingsStore.getState().settings?.theme).toBe("arctic-frost");
    });
  });

  it("does not re-load if settings already exist", () => {
    useSettingsStore.setState({ settings: makeSettings() });

    renderHook(() => useSettings());

    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("syncs cardDisplay to UI store", async () => {
    const cardDisplay = {
      showGenreTags: false,
      showPlaytime: false,
      showInstalledBadge: true,
      showTags: true,
      showRatingBadge: false,
      gridSize: "medium" as const,
      listDensity: "default" as const,
      listColumns: [],
    };
    const settings = makeSettings({ cardDisplay });
    mockLoad.mockResolvedValue(settings);

    renderHook(() => useSettings());

    await waitFor(() => {
      expect(useUIStore.getState().cardDisplay.showPlaytime).toBe(false);
    });
  });

  it("initializes shelves from settings", async () => {
    const settings = makeSettings({ shelves: [] });
    mockLoad.mockResolvedValue(settings);

    renderHook(() => useSettings());

    await waitFor(() => {
      // initShelves was called — shelves should be DEFAULT_SHELVES (since empty triggers defaults)
      expect(useShelvesStore.getState().shelves.length).toBeGreaterThan(0);
    });
  });
});
