import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSettingsStore } from "./settingsSlice";
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
    theme: "dark",
    iconSet: "classic",
    fontFamily: "system",
    uiScale: "normal",
    cardDisplay: { showPlaytime: true, showLastPlayed: true, showPlatformBadge: true },
    profileChartOptions: { bucketPreset: "default", genreTopN: 8, devPubTopN: 10 },
    commandCenterSlots: [],
    commandCenterShortcut: { key: "Space", modifiers: ["Control"] },
    railMode: "icons-and-labels",
    minimizeToTray: false,
    devSettingsEnabled: false,
    ...overrides,
  } as AppSettings;
}

describe("settingsSlice", () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null, isLoading: false, error: null });
    vi.clearAllMocks();
  });

  // ── loadSettings ─────────────────────────────────────────────

  describe("loadSettings", () => {
    it("loads settings from API and stores them", async () => {
      const settings = makeSettings({ theme: "light" });
      mockLoad.mockResolvedValue(settings);

      await useSettingsStore.getState().loadSettings();

      const state = useSettingsStore.getState();
      expect(state.settings?.theme).toBe("light");
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("sets error on load failure", async () => {
      mockLoad.mockRejectedValue(new Error("disk read failed"));

      await useSettingsStore.getState().loadSettings();

      const state = useSettingsStore.getState();
      expect(state.settings).toBeNull();
      expect(state.error).toBe("disk read failed");
      expect(state.isLoading).toBe(false);
    });

    it("migrates removed icon set to 'classic'", async () => {
      const settings = makeSettings({ iconSet: "retro" as never });
      mockLoad.mockResolvedValue(settings);

      await useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().settings?.iconSet).toBe("classic");
    });

    it("keeps valid icon set unchanged", async () => {
      const settings = makeSettings({ iconSet: "minimal" });
      mockLoad.mockResolvedValue(settings);

      await useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().settings?.iconSet).toBe("minimal");
    });
  });

  // ── saveSettings ─────────────────────────────────────────────

  describe("saveSettings", () => {
    it("saves settings to API and updates state", async () => {
      mockSave.mockResolvedValue(undefined);
      const settings = makeSettings({ theme: "midnight" });

      await useSettingsStore.getState().saveSettings(settings);

      expect(mockSave).toHaveBeenCalledWith(settings);
      expect(useSettingsStore.getState().settings?.theme).toBe("midnight");
      expect(useSettingsStore.getState().error).toBeNull();
    });

    it("sets error on save failure", async () => {
      mockSave.mockRejectedValue(new Error("write failed"));
      const settings = makeSettings();

      await useSettingsStore.getState().saveSettings(settings);

      expect(useSettingsStore.getState().error).toBe("write failed");
    });
  });

  // ── clearError ───────────────────────────────────────────────

  describe("clearError", () => {
    it("clears error state", () => {
      useSettingsStore.setState({ error: "some error" });
      useSettingsStore.getState().clearError();
      expect(useSettingsStore.getState().error).toBeNull();
    });
  });
});
