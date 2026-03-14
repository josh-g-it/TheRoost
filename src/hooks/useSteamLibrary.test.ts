import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSteamLibrary } from "./useSteamLibrary";
import { useSettingsStore } from "../store/settingsSlice";
import { useLibraryStore } from "../store/librarySlice";
import type { AppSettings } from "../types";

const mockGetFullLibrary = vi.fn();
const mockScanLocalLibrary = vi.fn();
const mockScanExternalGames = vi.fn();

vi.mock("../services/tauri", () => ({
  settingsApi: {
    load: vi.fn(),
    save: vi.fn(),
  },
  steamApi: {
    getFullLibrary: (...args: unknown[]) => mockGetFullLibrary(...args),
    scanLocalLibrary: (...args: unknown[]) => mockScanLocalLibrary(...args),
  },
  externalApi: {
    scanExternalGames: (...args: unknown[]) => mockScanExternalGames(...args),
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
    commandCenterShortcut: "`+Space",
    railMode: "icons-and-labels",
    minimizeToTray: false,
    devSettingsEnabled: false,
    ...overrides,
  } as AppSettings;
}

describe("useSteamLibrary", () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null, isLoading: false, error: null });
    useLibraryStore.setState({ library: null, isLoading: false, error: null });
    vi.clearAllMocks();
  });

  it("calls refreshLibrary in full mode when steamId present", async () => {
    const settings = makeSettings({ steamApiKey: "key123", steamId: "id456" });
    useSettingsStore.setState({ settings });

    mockGetFullLibrary.mockResolvedValue({ games: [], totalCount: 0, warnings: [] });
    mockScanExternalGames.mockResolvedValue({ games: [], totalCount: 0, warnings: [] });

    renderHook(() => useSteamLibrary());

    await waitFor(() => {
      expect(mockGetFullLibrary).toHaveBeenCalledWith("id456");
    });
  });

  it("calls scanLocalOnly when no API key", async () => {
    const settings = makeSettings({ steamApiKey: null, steamId: null });
    useSettingsStore.setState({ settings });

    mockScanLocalLibrary.mockResolvedValue([]);
    mockScanExternalGames.mockResolvedValue({ games: [], totalCount: 0, warnings: [] });

    renderHook(() => useSteamLibrary());

    await waitFor(() => {
      expect(mockScanLocalLibrary).toHaveBeenCalled();
    });
  });

  it("does not auto-load when settings not yet loaded", () => {
    // settings is null — should not trigger any API call
    renderHook(() => useSteamLibrary());

    expect(mockGetFullLibrary).not.toHaveBeenCalled();
    expect(mockScanLocalLibrary).not.toHaveBeenCalled();
  });

  it("does not re-load when library already exists", () => {
    useSettingsStore.setState({
      settings: makeSettings({ steamApiKey: "k", steamId: "s" }),
    });
    useLibraryStore.setState({
      library: { games: [], totalCount: 0, warnings: [] },
    });

    renderHook(() => useSteamLibrary());

    expect(mockGetFullLibrary).not.toHaveBeenCalled();
    expect(mockScanLocalLibrary).not.toHaveBeenCalled();
  });

  it("provides a refresh function that uses full mode when credentials present", async () => {
    const settings = makeSettings({ steamApiKey: "key", steamId: "id" });
    useSettingsStore.setState({ settings });
    useLibraryStore.setState({ library: { games: [], totalCount: 0, warnings: [] } });

    mockGetFullLibrary.mockResolvedValue({ games: [], totalCount: 0, warnings: [] });
    mockScanExternalGames.mockResolvedValue({ games: [], totalCount: 0, warnings: [] });

    const { result } = renderHook(() => useSteamLibrary());

    // Call refresh explicitly
    await result.current.refresh();

    expect(mockGetFullLibrary).toHaveBeenCalledWith("id");
  });

  it("provides a refresh function that uses local-only when no credentials", async () => {
    const settings = makeSettings({ steamApiKey: null, steamId: null });
    useSettingsStore.setState({ settings });
    useLibraryStore.setState({ library: { games: [], totalCount: 0, warnings: [] } });

    mockScanLocalLibrary.mockResolvedValue([]);
    mockScanExternalGames.mockResolvedValue({ games: [], totalCount: 0, warnings: [] });

    const { result } = renderHook(() => useSteamLibrary());

    await result.current.refresh();

    expect(mockScanLocalLibrary).toHaveBeenCalled();
  });
});
