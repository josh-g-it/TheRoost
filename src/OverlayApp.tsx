import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEventListener } from "./hooks/useEventListener";
import type { AppSettings, Game, GameSession, StoreMetadata } from "./types";
import type {
  AppSettings as SettingsType,
  OverlayPanelId,
  OverlayPanelPosition,
} from "./types/settings";
import { FONT_OPTIONS } from "./types/theme";
import { useSettingsStore } from "./store/settingsSlice";
import { OVERLAY_PANELS } from "./components/overlay/overlayPanelRegistry";
import type { Rect } from "./components/overlay/panelCollision";
import { OverlayCommandCenter } from "./components/overlay/OverlayCommandCenter";
import { OverlayGameNotes } from "./components/overlay/OverlayGameNotes";
import { OverlaySystemMonitor } from "./components/overlay/OverlaySystemMonitor";
import {
  OverlayMediaControls,
  useMediaSession,
} from "./components/overlay/OverlayMediaControls";
import { OverlayAudioMixer } from "./components/overlay/OverlayAudioMixer";
import type { MediaControlsMode } from "./types";
import { FloatingPanel } from "./components/overlay/FloatingPanel";
import { OverlayBackdrop } from "./components/overlay/OverlayBackdrop";
import { OverlayWindowManager } from "./components/overlay/OverlayWindowManager";
import { OverlayVisibilityContext } from "./components/overlay/overlayVisibility";

const SAVE_DEBOUNCE_MS = 300;

export function OverlayApp() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [metadataCache, setMetadataCache] = useState<Map<string, StoreMetadata>>(
    new Map(),
  );
  const [activeSessions, setActiveSessions] = useState<GameSession[]>([]);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [panelPositions, setPanelPositions] = useState<
    Partial<Record<OverlayPanelId, OverlayPanelPosition>>
  >({});
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});

  const [isOverlayVisible, setIsOverlayVisible] = useState(true);

  // Track intentional hide so we don't re-grab focus when we dismiss on purpose
  const hidingRef = useRef(false);

  // Debounced settings save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSettingsRef = useRef<SettingsType | null>(null);

  const debouncedSave = useCallback((updated: SettingsType) => {
    pendingSettingsRef.current = updated;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (pendingSettingsRef.current) {
        invoke("save_settings", { settings: pendingSettingsRef.current }).catch(() => {});
        pendingSettingsRef.current = null;
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  // Debounce guard: prevents multiple rapid loadData calls from piling up
  // DB commands on the tokio thread pool (which causes freezes during session transitions).
  const loadingRef = useRef(false);

  // Load data on mount + whenever window regains focus.
  const loadData = useCallback(async () => {
    // Skip if a load is already in flight — prevents command pile-up
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const s = await invoke<AppSettings>("load_settings");
      setSettings(s);
      setPanelPositions((s as SettingsType).overlayPanelPositions ?? {});
    } catch {
      loadingRef.current = false;
      return;
    }

    try {
      const [libResult, sessionsResult, favsResult] = await Promise.allSettled([
        invoke<{ games: Game[] }>("get_overlay_library"),
        invoke<GameSession[]>("get_active_sessions"),
        invoke<string[]>("get_all_favorites"),
      ]);

      let loadedGames: Game[] = [];
      if (libResult.status === "fulfilled") {
        loadedGames = libResult.value?.games ?? [];
        setGames(loadedGames);
      }
      if (sessionsResult.status === "fulfilled") {
        setActiveSessions(sessionsResult.value ?? []);
      }
      if (favsResult.status === "fulfilled") {
        setFavoritesCount(favsResult.value?.length ?? 0);
      }

      // Fetch metadata for command palette genre/tag/category filters
      if (loadedGames.length > 0) {
        try {
          const gameIds = loadedGames.map((g) => g.gameId);
          const results = await invoke<[string, StoreMetadata | null][]>(
            "fetch_library_metadata",
            { gameIds },
          );
          const cache = new Map<string, StoreMetadata>();
          for (const [gameId, meta] of results) {
            if (meta) cache.set(gameId, meta);
          }
          setMetadataCache(cache);
        } catch {
          // Metadata fetch failed — command palette will just skip dynamic filters
        }
      }
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Re-fetch data when overlay regains focus (e.g. after toggling off/on).
  // We do NOT reclaim focus when lost — that causes a rapid focus-fight loop
  // between the overlay and main window that freezes the entire app.
  useEffect(() => {
    const win = getCurrentWindow();
    let isMounted = true;
    let unlistenFn: (() => void) | null = null;

    win
      .onFocusChanged(({ payload: focused }) => {
        if (!isMounted) return;
        if (focused) {
          hidingRef.current = false;
          setIsOverlayVisible(true);
          // loadData has its own debounce guard — safe to call on focus
          loadData();
        }
      })
      .then((fn) => {
        if (isMounted) unlistenFn = fn;
        else fn();
      });

    return () => {
      isMounted = false;
      unlistenFn?.();
    };
  }, [loadData]);

  // Re-fetch active sessions when a game session starts or stops (every ~5s during gaming).
  // Only fetches sessions — settings, library, and metadata don't change on session ticks.
  useEventListener(
    "session-update",
    () => {
      invoke<GameSession[]>("get_active_sessions")
        .then((sessions) => setActiveSessions(sessions ?? []))
        .catch(() => {});
    },
    [],
  );

  // Apply theme + sync to Zustand so AppIcon reads the correct icon set
  useEffect(() => {
    if (!settings) return;
    const theme = settings.theme ?? "dark-gaming";
    const fontFamily = settings.fontFamily ?? "system";
    const uiScale = settings.uiScale ?? "comfortable";

    document.documentElement.setAttribute("data-theme", theme);

    const fontOption = FONT_OPTIONS.find((f) => f.id === fontFamily);
    if (fontOption) {
      document.documentElement.style.setProperty("--font-family", fontOption.family);
    }

    if (uiScale === "comfortable") {
      document.documentElement.removeAttribute("data-ui-scale");
    } else {
      document.documentElement.setAttribute("data-ui-scale", uiScale);
    }

    // Sync to Zustand so shared components (AppIcon etc.) read from the store
    useSettingsStore.setState({ settings, isLoading: false });
  }, [settings]);

  // Reload settings when the main window notifies us of a change
  useEventListener("settings-changed", () => {
    invoke<AppSettings>("load_settings")
      .then((s) => setSettings(s))
      .catch(() => {});
  });

  // ── Panel orchestration ────────────────────────────────────────
  // Refs synced each render so panel callbacks have stable identity (no dep on state)
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const panelPositionsRef = useRef(panelPositions);
  panelPositionsRef.current = panelPositions;

  const handlePanelPositionChange = useCallback(
    (panelId: OverlayPanelId, pos: OverlayPanelPosition) => {
      setPanelPositions((prev) => {
        const next = { ...prev, [panelId]: pos };
        const s = settingsRef.current;
        if (s) {
          const updated = { ...s, overlayPanelPositions: next };
          setSettings(updated);
          debouncedSave(updated);
        }
        return next;
      });
    },
    [debouncedSave],
  );

  const handleTogglePanel = useCallback(
    (id: OverlayPanelId) => {
      const current = panelPositionsRef.current[id];
      const isVisible = current?.visible ?? true;
      const pos: OverlayPanelPosition = current
        ? { ...current, visible: !isVisible }
        : { ...getPanelDefault(id), visible: true };
      handlePanelPositionChange(id, pos);
    },
    [handlePanelPositionChange],
  );

  const handleHidePanel = useCallback(
    (id: OverlayPanelId) => {
      const current = panelPositionsRef.current[id];
      if (current) {
        handlePanelPositionChange(id, { ...current, visible: false });
      } else {
        handlePanelPositionChange(id, { ...getPanelDefault(id), visible: false });
      }
    },
    [handlePanelPositionChange],
  );

  const handleResetPanel = useCallback(
    (id: OverlayPanelId) => {
      setPanelPositions((prev) => {
        const next = { ...prev };
        delete next[id];
        const s = settingsRef.current;
        if (s) {
          const updated = { ...s, overlayPanelPositions: next };
          setSettings(updated);
          debouncedSave(updated);
        }
        return next;
      });
      // Bump reset key to force FloatingPanel remount at default position
      setResetKeys((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    },
    [debouncedSave],
  );

  const hideOverlay = useCallback(() => {
    hidingRef.current = true;
    setIsOverlayVisible(false);
    getCurrentWindow().hide();
  }, []);

  // Global Escape key handler — close overlay.
  // Uses capture phase so it fires BEFORE focused form elements (textarea, input)
  // consume the event. Panel-specific Escape handlers (e.g. dropdown close in
  // OverlayAssistant) also use capture and call stopPropagation to prevent this
  // from also firing when they handle Escape themselves.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        hideOverlay();
      }
    };
    window.addEventListener("keydown", handler, true); // capture phase
    return () => window.removeEventListener("keydown", handler, true);
  }, [hideOverlay]);

  // ── Media controls dynamic visibility ─────────────────────────
  const mediaMode: MediaControlsMode =
    (settings?.mediaControlsMode as MediaControlsMode) ?? "dynamic";
  const mediaSnapshot = useMediaSession(mediaMode === "dynamic");

  // Build panel states for window manager
  const panelStates: Record<string, { visible: boolean }> = {};
  for (const panel of OVERLAY_PANELS) {
    if (panel.id === "media-controls") {
      // Media controls visibility is driven entirely by mode
      if (mediaMode === "always") {
        panelStates[panel.id] = { visible: true };
      } else if (mediaMode === "hidden") {
        panelStates[panel.id] = { visible: false };
      } else {
        // Dynamic: show when active media session exists
        const hasMedia =
          mediaSnapshot?.hasSession === true &&
          mediaSnapshot.status !== "closed" &&
          mediaSnapshot.status !== "stopped";
        panelStates[panel.id] = { visible: hasMedia };
      }
    } else {
      panelStates[panel.id] = {
        visible: panelPositions[panel.id]?.visible ?? true,
      };
    }
  }

  // Build otherPanelRects for collision detection
  const buildOtherRects = useCallback(
    (excludeId: OverlayPanelId): Rect[] => {
      const rects: Rect[] = [];
      // Window manager bar rect (top center, ~auto width but estimate)
      rects.push({ x: 0, y: 0, width: window.innerWidth, height: 44 });

      // Cast to Record<string, ...> to prevent TS narrowing OverlayPanelId to never
      // when the only panel is excluded (currently "command-center" is the sole member).
      const positions = panelPositions as Record<
        string,
        OverlayPanelPosition | undefined
      >;
      for (const panel of OVERLAY_PANELS) {
        if (panel.id === excludeId) continue;
        const saved = positions[panel.id];
        const isVisible = saved?.visible ?? true;
        if (!isVisible) continue;

        if (saved) {
          rects.push({
            x: saved.x,
            y: saved.y,
            width: saved.width ?? panel.defaultWidth,
            height: saved.height ?? panel.defaultHeight,
          });
        } else {
          const def = panel.defaultPosition();
          rects.push({
            x: def.x,
            y: def.y,
            width: panel.defaultWidth,
            height: panel.defaultHeight,
          });
        }
      }
      return rects;
    },
    [panelPositions],
  );

  const handleMediaControlsModeChange = useCallback(
    (mode: MediaControlsMode) => {
      const s = settingsRef.current;
      if (!s) return;
      const updated = { ...s, mediaControlsMode: mode };
      setSettings(updated);
      debouncedSave(updated);
      // Also sync to main window
      invoke("notify_settings_changed").catch(() => {});
    },
    [debouncedSave],
  );

  // Stable per-panel position change callbacks — avoid inline arrows that create
  // new function references on every render (which would force FloatingPanel re-renders).
  const panelCallbacks = useMemo(() => {
    const ids = OVERLAY_PANELS.map((p) => p.id);
    const result: Record<
      string,
      {
        onPositionChange: (pos: OverlayPanelPosition) => void;
        onClose: () => void;
      }
    > = {};
    for (const id of ids) {
      result[id] = {
        onPositionChange: (pos: OverlayPanelPosition) =>
          handlePanelPositionChange(id, pos),
        onClose: () => handleHidePanel(id),
      };
    }
    return result;
  }, [handlePanelPositionChange, handleHidePanel]);

  if (!settings) return null;

  // Command center panel config
  const ccDef = OVERLAY_PANELS.find((p) => p.id === "command-center")!;
  const ccSaved = panelPositions["command-center"];
  const ccVisible = ccSaved?.visible ?? true;
  const ccPosition = ccSaved ? { x: ccSaved.x, y: ccSaved.y } : ccDef.defaultPosition();

  return (
    <OverlayVisibilityContext.Provider value={isOverlayVisible}>
      <OverlayBackdrop onClick={hideOverlay} />
      <OverlayWindowManager
        panelStates={panelStates}
        onTogglePanel={handleTogglePanel}
        onHidePanel={handleHidePanel}
        onResetPanel={handleResetPanel}
        mediaControlsMode={mediaMode}
        onMediaControlsModeChange={handleMediaControlsModeChange}
      />
      {ccVisible && (
        <FloatingPanel
          key={`command-center-${resetKeys["command-center"] ?? 0}`}
          panelId="command-center"
          title="Command Center"
          defaultPosition={ccPosition}
          pinned={ccSaved?.pinned}
          onPositionChange={panelCallbacks["command-center"].onPositionChange}
          width={ccSaved?.width ?? ccDef.defaultWidth}
          resizable={false}
          otherPanelRects={buildOtherRects("command-center")}
        >
          <OverlayCommandCenter
            settings={settings}
            games={games}
            metadataCache={metadataCache}
            activeSessions={activeSessions}
            favoritesCount={favoritesCount}
            onTogglePanel={handleTogglePanel}
            onSaveSettings={async (s) => {
              try {
                await invoke("save_settings", { settings: s });
                setSettings(s);
                invoke("notify_settings_changed").catch(() => {});
              } catch {
                // Settings save failed silently
              }
            }}
            onHideOverlay={hideOverlay}
          />
        </FloatingPanel>
      )}
      {(() => {
        const gnDef = OVERLAY_PANELS.find((p) => p.id === "game-notes")!;
        const gnSaved = panelPositions["game-notes"];
        const gnVisible = gnSaved?.visible ?? true;
        if (!gnVisible) return null;
        const gnPosition = gnSaved
          ? { x: gnSaved.x, y: gnSaved.y }
          : gnDef.defaultPosition();
        return (
          <FloatingPanel
            key={`game-notes-${resetKeys["game-notes"] ?? 0}`}
            panelId="game-notes"
            title="Game Notes"
            defaultPosition={gnPosition}
            pinned={gnSaved?.pinned}
            onPositionChange={panelCallbacks["game-notes"].onPositionChange}
            onClose={panelCallbacks["game-notes"].onClose}
            width={gnSaved?.width ?? gnDef.defaultWidth}
            resizable
            minWidth={300}
            minHeight={200}
            defaultHeight={gnSaved?.height ?? gnDef.defaultHeight}
            otherPanelRects={buildOtherRects("game-notes")}
          >
            <OverlayGameNotes activeSessions={activeSessions} games={games} />
          </FloatingPanel>
        );
      })()}
      {(() => {
        const smDef = OVERLAY_PANELS.find((p) => p.id === "system-monitor")!;
        const smSaved = panelPositions["system-monitor"];
        const smVisible = smSaved?.visible ?? true;
        if (!smVisible) return null;
        const smPosition = smSaved
          ? { x: smSaved.x, y: smSaved.y }
          : smDef.defaultPosition();
        return (
          <FloatingPanel
            key={`system-monitor-${resetKeys["system-monitor"] ?? 0}`}
            panelId="system-monitor"
            title="System Monitor"
            defaultPosition={smPosition}
            pinned={smSaved?.pinned}
            onPositionChange={panelCallbacks["system-monitor"].onPositionChange}
            onClose={panelCallbacks["system-monitor"].onClose}
            width={smSaved?.width ?? smDef.defaultWidth}
            resizable
            minWidth={360}
            minHeight={250}
            defaultHeight={smSaved?.height ?? smDef.defaultHeight}
            otherPanelRects={buildOtherRects("system-monitor")}
          >
            <OverlaySystemMonitor activeSessions={activeSessions} games={games} />
          </FloatingPanel>
        );
      })()}
      {(() => {
        const mcDef = OVERLAY_PANELS.find((p) => p.id === "media-controls")!;
        const mcSaved = panelPositions["media-controls"];
        const mcVisible = panelStates["media-controls"]?.visible ?? false;
        if (!mcVisible) return null;
        const mcPosition = mcSaved
          ? { x: mcSaved.x, y: mcSaved.y }
          : mcDef.defaultPosition();
        return (
          <FloatingPanel
            key={`media-controls-${resetKeys["media-controls"] ?? 0}`}
            panelId="media-controls"
            title="Media Controls"
            defaultPosition={mcPosition}
            pinned={mcSaved?.pinned}
            onPositionChange={panelCallbacks["media-controls"].onPositionChange}
            onClose={() => handleMediaControlsModeChange("hidden")}
            width={mcSaved?.width ?? mcDef.defaultWidth}
            resizable
            minWidth={320}
            minHeight={240}
            defaultHeight={mcSaved?.height ?? mcDef.defaultHeight}
            otherPanelRects={buildOtherRects("media-controls")}
          >
            <OverlayMediaControls />
          </FloatingPanel>
        );
      })()}
      {(() => {
        const amDef = OVERLAY_PANELS.find((p) => p.id === "audio-mixer")!;
        const amSaved = panelPositions["audio-mixer"];
        const amVisible = amSaved?.visible ?? true;
        if (!amVisible) return null;
        const amPosition = amSaved
          ? { x: amSaved.x, y: amSaved.y }
          : amDef.defaultPosition();
        return (
          <FloatingPanel
            key={`audio-mixer-${resetKeys["audio-mixer"] ?? 0}`}
            panelId="audio-mixer"
            title="Audio Mixer"
            defaultPosition={amPosition}
            pinned={amSaved?.pinned}
            onPositionChange={panelCallbacks["audio-mixer"].onPositionChange}
            onClose={panelCallbacks["audio-mixer"].onClose}
            width={amSaved?.width ?? amDef.defaultWidth}
            resizable
            minWidth={320}
            minHeight={250}
            defaultHeight={amSaved?.height ?? amDef.defaultHeight}
            otherPanelRects={buildOtherRects("audio-mixer")}
          >
            <OverlayAudioMixer />
          </FloatingPanel>
        );
      })()}
    </OverlayVisibilityContext.Provider>
  );
}

/** Get default position for a panel based on the registry. */
function getPanelDefault(id: OverlayPanelId): OverlayPanelPosition {
  const panel = OVERLAY_PANELS.find((p) => p.id === id);
  const pos = panel?.defaultPosition() ?? { x: 100, y: 100 };
  return { x: pos.x, y: pos.y, pinned: false, visible: true };
}
