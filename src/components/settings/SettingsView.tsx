import { useState, useEffect, useRef, useMemo } from "react";
import { useBlocker } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Header } from "../layout/Header";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { TagManager } from "./TagManager";
import { BookmarkManager } from "./BookmarkManager";
import { CardDisplaySettings } from "./CardDisplaySettings";
import { ThemeBuilder } from "./ThemeBuilder";
import { DeveloperSettings } from "./DeveloperSettings";
import { BackupRestoreSection } from "./BackupRestoreSection";
import { useSettings } from "../../hooks/useSettings";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { useSettingsStore } from "../../store/settingsSlice";
import { useAppVersion } from "../../hooks/useAppVersion";
import { useLibraryStore } from "../../store/librarySlice";
import {
  coverArtApi,
  cloudAiApi,
  updaterApi,
  autostartApi,
  assistantApi,
} from "../../services/tauri";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type {
  AppSettings,
  CommandCenterShortcut,
  RailMode,
  MediaControlsMode,
  CloudAiUsage,
  UpdateInfo,
} from "../../types";
import type { ThemeId } from "../../hooks/useTheme";
import type { IconSetId, FontFamilyId, UIScaleId } from "../../types/theme";
import { SHORTCUT_OPTIONS } from "../../types";
import "./SettingsView.css";

const SAVE_NOTIFICATION_MS = 2000;
const CLIPBOARD_MESSAGE_MS = 3000;

type SettingsTabId =
  | "general"
  | "assistant"
  | "connections"
  | "appearance"
  | "navigation"
  | "advanced";

const SETTINGS_TABS: { id: SettingsTabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "assistant", label: "Assistant" },
  { id: "connections", label: "Connections" },
  { id: "appearance", label: "Appearance" },
  { id: "navigation", label: "Navigation" },
  { id: "advanced", label: "Advanced" },
];

export function SettingsView() {
  const { settings, saveSettings, isLoading } = useSettings();
  const { confirm, dialogProps } = useConfirmDialog();
  const [form, setForm] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SteamGridDB key state (managed independently — stored in Credential Manager)
  const [sgdbKey, setSgdbKey] = useState("");
  const [showSgdbKey, setShowSgdbKey] = useState(false);
  const [sgdbKeyConfigured, setSgdbKeyConfigured] = useState(false);
  const [sgdbSaving, setSgdbSaving] = useState(false);
  const [sgdbFetching, setSgdbFetching] = useState(false);
  const [sgdbMessage, setSgdbMessage] = useState<string | null>(null);

  // Cloud AI state (managed independently — key stored in Credential Manager)
  const [cloudKey, setCloudKey] = useState("");
  const [showCloudKey, setShowCloudKey] = useState(false);
  const [cloudKeyConfigured, setCloudKeyConfigured] = useState(false);
  const [cloudSaving, setCloudSaving] = useState(false);
  const [cloudTesting, setCloudTesting] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [cloudUsage, setCloudUsage] = useState<CloudAiUsage | null>(null);
  const [contextGameSearch, setContextGameSearch] = useState("");

  // Update state
  const appVersion = useAppVersion();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  // Autostart state
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(true);

  // AI Data Management state
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState("");
  const [isWipingAi, setIsWipingAi] = useState(false);
  const [encryptionKeyExists, setEncryptionKeyExists] = useState(false);
  const [showKeyImport, setShowKeyImport] = useState(false);
  const [importKeyValue, setImportKeyValue] = useState("");
  const [keyImportMessage, setKeyImportMessage] = useState<string | null>(null);
  const [isImportingKey, setIsImportingKey] = useState(false);
  const [showExportedKey, setShowExportedKey] = useState(false);
  const [exportedKey, setExportedKey] = useState("");
  const clipboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear exported key from memory on unmount
  useEffect(() => {
    return () => {
      setExportedKey("");
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
    };
  }, []);

  // Game name lookup for exclude/include lists
  const allGames = useLibraryStore((s) => s.library?.games);
  const gameNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (allGames) {
      for (const g of allGames) map.set(g.gameId, g.name);
    }
    return map;
  }, [allGames]);

  useEffect(() => {
    if (settings && !form) {
      setForm({ ...settings });
    }
  }, [settings, form]);

  useEffect(() => {
    coverArtApi
      .getSgdbKeyStatus()
      .then(setSgdbKeyConfigured)
      .catch(() => {});
    // Load cloud AI key status and usage (default to gemini on first load)
    cloudAiApi
      .getKeyStatus("gemini")
      .then(setCloudKeyConfigured)
      .catch(() => {});
    cloudAiApi
      .getUsage()
      .then(setCloudUsage)
      .catch(() => {});
    autostartApi
      .isEnabled()
      .then((v) => {
        setAutostartEnabled(v);
        setAutostartLoading(false);
      })
      .catch(() => setAutostartLoading(false));
    assistantApi
      .checkEncryptionKeyExists()
      .then(setEncryptionKeyExists)
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const isDirty =
    form !== null &&
    settings !== null &&
    (form.theme !== settings.theme ||
      form.iconSet !== settings.iconSet ||
      form.fontFamily !== settings.fontFamily ||
      form.uiScale !== settings.uiScale ||
      form.steamApiKey !== settings.steamApiKey ||
      form.steamId !== settings.steamId ||
      form.commandCenterShortcut !== settings.commandCenterShortcut ||
      form.railMode !== settings.railMode ||
      form.minimizeToTray !== settings.minimizeToTray ||
      form.cloudAiEnabled !== settings.cloudAiEnabled ||
      form.cloudAiProvider !== settings.cloudAiProvider ||
      form.cloudAiDailyLimit !== settings.cloudAiDailyLimit ||
      form.cloudAiContextScope !== settings.cloudAiContextScope ||
      form.aiConversationAutoEndEnabled !== settings.aiConversationAutoEndEnabled ||
      form.aiPostSessionReviewEnabled !== settings.aiPostSessionReviewEnabled ||
      form.aiMaxTokensMain !== settings.aiMaxTokensMain ||
      form.aiMaxTokensOverlay !== settings.aiMaxTokensOverlay ||
      form.mediaControlsMode !== settings.mediaControlsMode ||
      JSON.stringify(form.cloudAiIncludedGames ?? []) !==
        JSON.stringify(settings.cloudAiIncludedGames ?? []) ||
      JSON.stringify(form.cloudAiExcludedGames ?? []) !==
        JSON.stringify(settings.cloudAiExcludedGames ?? []));

  const revertChanges = () => {
    if (settings) {
      setForm({ ...settings });
    }
  };

  const blocker = useBlocker(isDirty);

  // Build a clean save payload that exactly matches the Rust AppSettings struct.
  // Uses strict type coercion (=== true, Number(), Array.isArray) instead of ??
  // because ?? only guards null/undefined — a corrupted value like {} passes through.
  // JSON roundtrip strips proxies, undefined values, and non-serializable properties.
  const buildSavePayload = (f: AppSettings): AppSettings => {
    const payload = {
      steamApiKey: f.steamApiKey ?? null,
      steamId: f.steamId ?? null,
      isFirstRun: f.isFirstRun === true,
      theme: String(f.theme || "dark-gaming"),
      iconSet: String(f.iconSet || "default"),
      fontFamily: String(f.fontFamily || "system"),
      uiScale: String(f.uiScale || "comfortable"),
      cardDisplay: {
        showGenreTags: f.cardDisplay?.showGenreTags === true,
        showPlaytime: f.cardDisplay?.showPlaytime === true,
        showInstalledBadge: f.cardDisplay?.showInstalledBadge === true,
        showTags: f.cardDisplay?.showTags === true,
        gridSize: String(f.cardDisplay?.gridSize || "medium"),
        listDensity: String(f.cardDisplay?.listDensity || "default"),
        listColumns: Array.isArray(f.cardDisplay?.listColumns)
          ? f.cardDisplay.listColumns
          : [],
      },
      profileChartOptions: {
        genreRadarCount: Number(f.profileChartOptions?.genreRadarCount) || 8,
        playtimeBuckets: String(f.profileChartOptions?.playtimeBuckets || "default"),
        leaderboardTopN: Number(f.profileChartOptions?.leaderboardTopN) || 10,
      },
      commandCenterSlots: Array.isArray(f.commandCenterSlots) ? f.commandCenterSlots : [],
      commandCenterShortcut: String(f.commandCenterShortcut || "Ctrl+Space"),
      railMode: String(f.railMode || "dynamic"),
      shelves: Array.isArray(f.shelves) ? f.shelves : [],
      minimizeToTray: f.minimizeToTray !== false, // defaults true
      devSettingsEnabled: f.devSettingsEnabled === true,
      activityLayout: Array.isArray(f.activityLayout) ? f.activityLayout : [],
      hasSeenWelcome: f.hasSeenWelcome === true,
      overlayPanelPositions: f.overlayPanelPositions ?? {},
      mediaControlsMode: String(f.mediaControlsMode || "dynamic"),
      cloudAiEnabled: f.cloudAiEnabled === true,
      cloudAiProvider: String(f.cloudAiProvider || "gemini"),
      cloudAiDailyLimit: Number(f.cloudAiDailyLimit) || 100,
      cloudAiPrivacyAcknowledged: f.cloudAiPrivacyAcknowledged === true,
      cloudAiContextScope: String(f.cloudAiContextScope || "all"),
      cloudAiExcludedGames: Array.isArray(f.cloudAiExcludedGames)
        ? f.cloudAiExcludedGames
        : [],
      cloudAiIncludedGames: Array.isArray(f.cloudAiIncludedGames)
        ? f.cloudAiIncludedGames
        : [],
      aiPostSessionReviewEnabled: f.aiPostSessionReviewEnabled === true,
      aiConversationAutoEndEnabled: f.aiConversationAutoEndEnabled !== false, // defaults true
      aiMaxTokensMain: Number(f.aiMaxTokensMain) || 8192,
      aiMaxTokensOverlay: Number(f.aiMaxTokensOverlay) || 2048,
    };
    // JSON roundtrip ensures a perfectly clean plain object for Tauri invoke
    return JSON.parse(JSON.stringify(payload)) as AppSettings;
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    // Re-register global shortcut if it changed
    if (settings && form.commandCenterShortcut !== settings.commandCenterShortcut) {
      invoke("update_overlay_shortcut", { shortcut: form.commandCenterShortcut });
    }
    const cleanForm = buildSavePayload(form);
    await saveSettings(cleanForm);
    const { settings: saved, error } = useSettingsStore.getState();
    setSaving(false);
    if (error) {
      logger.error("settings", "ui", "Save failed", { error });
      return;
    }
    // Re-sync form from store to ensure isDirty becomes false
    if (saved) setForm({ ...saved });
    // Sync in-memory CloudConfig with saved values
    cloudAiApi.updateSettings(
      form.cloudAiEnabled ?? false,
      form.cloudAiProvider ?? "gemini",
      form.cloudAiDailyLimit ?? 100,
    );
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), SAVE_NOTIFICATION_MS);
  };

  const handleSaveAndLeave = async () => {
    if (!form) return;
    setSaving(true);
    if (settings && form.commandCenterShortcut !== settings.commandCenterShortcut) {
      invoke("update_overlay_shortcut", { shortcut: form.commandCenterShortcut });
    }
    const cleanForm = buildSavePayload(form);
    await saveSettings(cleanForm);
    // Sync in-memory CloudConfig with saved values
    cloudAiApi.updateSettings(
      form.cloudAiEnabled ?? false,
      form.cloudAiProvider ?? "gemini",
      form.cloudAiDailyLimit ?? 100,
    );
    setSaving(false);
    blocker.proceed?.();
  };

  const handleDiscard = () => {
    revertChanges();
    blocker.proceed?.();
  };

  const handleQuickApply = async (changes: {
    theme?: ThemeId;
    iconSet?: IconSetId;
    fontFamily?: FontFamilyId;
    uiScale?: UIScaleId;
  }) => {
    if (!form) return;
    const updated = {
      ...form,
      ...(changes.theme !== undefined && { theme: changes.theme }),
      ...(changes.iconSet !== undefined && { iconSet: changes.iconSet }),
      ...(changes.fontFamily !== undefined && { fontFamily: changes.fontFamily }),
      ...(changes.uiScale !== undefined && { uiScale: changes.uiScale }),
    };
    setForm(updated);
    setSaving(true);
    await saveSettings(buildSavePayload(updated));
    setSaving(false);
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), SAVE_NOTIFICATION_MS);
  };

  if (isLoading || !form) return null;

  return (
    <div className="settings-view">
      <Header title="Settings" />

      <div className="settings-view__bar">
        <div className="settings-view__save-bar">
          <Button onClick={handleSave} loading={saving} disabled={!isDirty && !saved}>
            {saved ? "Saved!" : "Save Settings"}
          </Button>
          {isDirty && (
            <span className="settings-view__unsaved-hint">You have unsaved changes</span>
          )}
        </div>

        <div className="settings-view__tabs">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`settings-view__tab ${activeTab === tab.id ? "settings-view__tab--active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-view__content">
        {/* ── General tab ─────────────────────────────────────────── */}
        <div
          className={`settings-view__tab-panel ${activeTab === "general" ? "settings-view__tab-panel--active" : ""}`}
        >
          <section className="settings-view__section">
            <h3 className="settings-view__section-title">Application</h3>
            <div className="settings-view__field-row">
              <label className="settings-view__label">Version</label>
              <span className="settings-view__version-value">v{appVersion}</span>
            </div>

            <div className="settings-view__field-row">
              <div className="settings-view__sgdb-actions">
                <Button
                  size="sm"
                  disabled={updateChecking || updateInstalling}
                  loading={updateChecking}
                  onClick={async () => {
                    setUpdateChecking(true);
                    setUpdateMessage(null);
                    setUpdateInfo(null);
                    try {
                      const info = await updaterApi.checkForUpdate();
                      if (info) {
                        setUpdateInfo(info);
                        setUpdateMessage(`Update available: v${info.version}`);
                      } else {
                        setUpdateMessage("You're up to date!");
                      }
                    } catch {
                      setUpdateMessage("Update check failed");
                    } finally {
                      setUpdateChecking(false);
                    }
                  }}
                >
                  Check for Updates
                </Button>
                {updateInfo && (
                  <Button
                    size="sm"
                    disabled={updateInstalling}
                    loading={updateInstalling}
                    onClick={async () => {
                      setUpdateInstalling(true);
                      setUpdateMessage("Downloading update...");
                      try {
                        await updaterApi.installUpdate();
                      } catch (err: unknown) {
                        const msg =
                          err && typeof err === "object" && "message" in err
                            ? String((err as { message: string }).message)
                            : String(err);
                        setUpdateMessage(`Install failed: ${msg}`);
                        setUpdateInstalling(false);
                      }
                    }}
                  >
                    Install v{updateInfo.version}
                  </Button>
                )}
              </div>
              {updateMessage && (
                <span className="settings-view__sgdb-message">{updateMessage}</span>
              )}
            </div>

            {updateInfo?.body && (
              <div className="settings-view__release-notes">
                <span className="settings-view__release-notes-label">Release notes:</span>
                <p className="settings-view__release-notes-body">{updateInfo.body}</p>
              </div>
            )}
          </section>

          <section className="settings-view__section">
            <h3 className="settings-view__section-title">System Tray</h3>
            <p className="settings-view__section-desc">
              Control how The Roost behaves when you close the window. Background
              operation enables automatic game session tracking.
            </p>

            <div className="settings-view__field-row">
              <div>
                <label className="settings-view__label">Minimize to tray on close</label>
                <p className="settings-view__field-hint">
                  When enabled, closing the window keeps The Roost running in the system
                  tray. Game sessions are tracked automatically by detecting running
                  games. When disabled, sessions are only tracked while the app window is
                  open. Use &quot;Fully Quit&quot; from the tray icon to exit completely.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.minimizeToTray}
                onChange={(e) => setForm({ ...form, minimizeToTray: e.target.checked })}
                className="settings-view__checkbox"
              />
            </div>
          </section>

          <section className="settings-view__section">
            <h3 className="settings-view__section-title">Startup</h3>
            <div className="settings-view__field-row">
              <div>
                <label className="settings-view__label">Launch on startup</label>
                <p className="settings-view__field-hint">
                  Automatically start The Roost when you log in to Windows.
                </p>
              </div>
              <input
                type="checkbox"
                checked={autostartEnabled}
                disabled={autostartLoading}
                onChange={async (e) => {
                  const enabled = e.target.checked;
                  setAutostartEnabled(enabled);
                  try {
                    await autostartApi.setEnabled(enabled);
                  } catch {
                    setAutostartEnabled(!enabled);
                  }
                }}
                className="settings-view__checkbox"
              />
            </div>
          </section>
        </div>

        {/* ── Connections tab ──────────────────────────────────────── */}
        <div
          className={`settings-view__tab-panel ${activeTab === "connections" ? "settings-view__tab-panel--active" : ""}`}
        >
          <section className="settings-view__section">
            <h3 className="settings-view__section-title">Steam Connection</h3>

            <div className="settings-view__field">
              <Input
                label="Steam Web API Key"
                type={showKey ? "text" : "password"}
                placeholder="Enter your Steam Web API key"
                value={form.steamApiKey ?? ""}
                onChange={(e) =>
                  setForm({ ...form, steamApiKey: e.target.value || null })
                }
              />
              <Button variant="ghost" size="sm" onClick={() => setShowKey(!showKey)}>
                {showKey ? "Hide" : "Show"}
              </Button>
            </div>

            <Input
              label="Steam ID (64-bit)"
              placeholder="e.g. 76561198012345678"
              value={form.steamId ?? ""}
              onChange={(e) => setForm({ ...form, steamId: e.target.value || null })}
            />
          </section>

          <section className="settings-view__section">
            <h3 className="settings-view__section-title">Cover Art (Non-Steam Games)</h3>
            <p className="settings-view__section-desc">
              GOG games get cover art automatically. For other launchers (Epic, EA,
              Ubisoft, Battle.net), provide a free <strong>SteamGridDB</strong> API key.
              Get one at steamgriddb.com &rarr; Preferences &rarr; API.
            </p>

            <div className="settings-view__field">
              <Input
                label="SteamGridDB API Key"
                type={showSgdbKey ? "text" : "password"}
                placeholder={
                  sgdbKeyConfigured
                    ? "••••••••••••••••"
                    : "Enter your SteamGridDB API key"
                }
                value={sgdbKey}
                onChange={(e) => setSgdbKey(e.target.value)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSgdbKey(!showSgdbKey)}
              >
                {showSgdbKey ? "Hide" : "Show"}
              </Button>
            </div>

            <div className="settings-view__field-row">
              <div className="settings-view__sgdb-actions">
                <Button
                  size="sm"
                  disabled={!sgdbKey.trim() || sgdbSaving}
                  loading={sgdbSaving}
                  onClick={async () => {
                    setSgdbSaving(true);
                    setSgdbMessage(null);
                    try {
                      await coverArtApi.storeSgdbKey(sgdbKey.trim());
                      setSgdbKeyConfigured(true);
                      setSgdbKey("");
                      setSgdbMessage("Key saved");
                    } catch {
                      setSgdbMessage("Failed to save key");
                    } finally {
                      setSgdbSaving(false);
                    }
                  }}
                >
                  Save Key
                </Button>
                {sgdbKeyConfigured && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await coverArtApi.deleteSgdbKey();
                        setSgdbKeyConfigured(false);
                        setSgdbMessage("Key removed");
                      } catch {
                        setSgdbMessage("Failed to remove key");
                      }
                    }}
                  >
                    Remove Key
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={sgdbFetching}
                  loading={sgdbFetching}
                  onClick={async () => {
                    setSgdbFetching(true);
                    setSgdbMessage(null);
                    try {
                      const count = await coverArtApi.fetchBatch();
                      setSgdbMessage(
                        count > 0
                          ? `Found ${count} image${count !== 1 ? "s" : ""}`
                          : "No new images found",
                      );
                    } catch {
                      setSgdbMessage("Fetch failed");
                    } finally {
                      setSgdbFetching(false);
                    }
                  }}
                >
                  Fetch Cover Art Now
                </Button>
              </div>
              {sgdbMessage && (
                <span className="settings-view__sgdb-message">{sgdbMessage}</span>
              )}
            </div>
          </section>
        </div>

        {/* ── Assistant tab ──────────────────────────────────────── */}
        <div
          className={`settings-view__tab-panel ${activeTab === "assistant" ? "settings-view__tab-panel--active" : ""}`}
        >
          <section className="settings-view__section">
            <h3 className="settings-view__section-title">Cloud AI (Experimental)</h3>
            <p className="settings-view__section-desc">
              Enable cloud-powered AI for smarter search suggestions in the command
              palette. The AI can understand natural language queries like &ldquo;what
              should I play tonight?&rdquo; or &ldquo;recommend something like
              Skyrim&rdquo;. Requires a free <strong>Gemini</strong> API key from Google
              AI Studio.
            </p>

            {form.cloudAiEnabled && (
              <div className="settings-view__cloud-privacy">
                When enabled, your search queries, game names, and aggregated library
                stats (genres, playtime) are sent to {cloudUsage?.provider ?? "Gemini"}
                &apos;s servers for processing. API keys, file paths, and personal
                information are never sent.
              </div>
            )}

            <div className="settings-view__field-row">
              <label className="settings-view__checkbox-label">
                <input
                  type="checkbox"
                  checked={form.cloudAiEnabled ?? false}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    // First-use privacy acknowledgment
                    if (enabled && !form.cloudAiPrivacyAcknowledged) {
                      const ok = await confirm({
                        title: "Enable Cloud AI?",
                        message:
                          "Cloud AI sends your search queries and library data (game names, genres, playtime) to external servers for processing.\n\nAPI keys, file paths, and personal information are never sent.",
                        confirmLabel: "Enable",
                        cancelLabel: "Cancel",
                      });
                      if (!ok) return;
                      // Prompt for post-session reviews feature
                      const enableReviews = await confirm({
                        title: "Post-Session Reviews",
                        message:
                          "After a 30+ minute gaming session, your assistant can prompt you to share your thoughts and help write a review.\n\nWould you like to enable this feature?",
                        confirmLabel: "Enable",
                        cancelLabel: "No Thanks",
                      });
                      setForm({
                        ...form,
                        cloudAiEnabled: true,
                        cloudAiPrivacyAcknowledged: true,
                        aiPostSessionReviewEnabled: enableReviews,
                      });
                      return;
                    }
                    setForm({ ...form, cloudAiEnabled: enabled });
                  }}
                />
                Enable Cloud AI
              </label>
            </div>

            {form.cloudAiEnabled && (
              <>
                <div className="settings-view__field-row">
                  <label className="settings-view__label">Provider</label>
                  <select
                    className="settings-view__select"
                    value={form.cloudAiProvider ?? "gemini"}
                    onChange={(e) => {
                      setForm({ ...form, cloudAiProvider: e.target.value });
                      // Refresh key status for new provider
                      cloudAiApi
                        .getKeyStatus(e.target.value)
                        .then(setCloudKeyConfigured)
                        .catch(() => {});
                    }}
                  >
                    <option value="gemini">Gemini 3 Flash</option>
                    <option value="openai" disabled>
                      OpenAI (Coming soon)
                    </option>
                    <option value="claude" disabled>
                      Claude (Coming soon)
                    </option>
                  </select>
                </div>

                <div className="settings-view__field">
                  <Input
                    label="API Key"
                    type={showCloudKey ? "text" : "password"}
                    placeholder={
                      cloudKeyConfigured
                        ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                        : "Enter your API key"
                    }
                    value={cloudKey}
                    onChange={(e) => setCloudKey(e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCloudKey(!showCloudKey)}
                  >
                    {showCloudKey ? "Hide" : "Show"}
                  </Button>
                </div>

                <div className="settings-view__field-row">
                  <div className="settings-view__sgdb-actions">
                    <Button
                      size="sm"
                      disabled={!cloudKey.trim() || cloudSaving}
                      loading={cloudSaving}
                      onClick={async () => {
                        setCloudSaving(true);
                        setCloudMessage(null);
                        try {
                          await cloudAiApi.storeKey(
                            form.cloudAiProvider ?? "gemini",
                            cloudKey.trim(),
                          );
                          setCloudKeyConfigured(true);
                          setCloudKey("");
                          setCloudMessage("Key saved");
                        } catch {
                          setCloudMessage("Failed to save key");
                        } finally {
                          setCloudSaving(false);
                        }
                      }}
                    >
                      Save Key
                    </Button>
                    {cloudKeyConfigured && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            await cloudAiApi.deleteKey(form.cloudAiProvider ?? "gemini");
                            setCloudKeyConfigured(false);
                            setCloudMessage("Key removed");
                          } catch {
                            setCloudMessage("Failed to remove key");
                          }
                        }}
                      >
                        Remove Key
                      </Button>
                    )}
                    {cloudKeyConfigured && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={cloudTesting}
                        loading={cloudTesting}
                        onClick={async () => {
                          setCloudTesting(true);
                          setCloudMessage(null);
                          try {
                            const valid = await cloudAiApi.testKey(
                              form.cloudAiProvider ?? "gemini",
                            );
                            setCloudMessage(valid ? "Key valid" : "Invalid key");
                          } catch {
                            setCloudMessage("Connection failed");
                          } finally {
                            setCloudTesting(false);
                          }
                        }}
                      >
                        Test Key
                      </Button>
                    )}
                  </div>
                  {cloudMessage && (
                    <span className="settings-view__sgdb-message">{cloudMessage}</span>
                  )}
                </div>

                <div className="settings-view__field-row">
                  <label className="settings-view__label">Daily request limit</label>
                  <input
                    type="number"
                    className="settings-view__number-input"
                    min={1}
                    max={9999}
                    value={form.cloudAiDailyLimit ?? 100}
                    onChange={(e) => {
                      const val = Math.max(
                        1,
                        Math.min(9999, Number(e.target.value) || 100),
                      );
                      setForm({ ...form, cloudAiDailyLimit: val });
                    }}
                  />
                </div>

                {cloudUsage && (
                  <div className="settings-view__cloud-usage">
                    <span className="settings-view__cloud-usage-remaining">
                      {Math.max(0, cloudUsage.dailyLimit - cloudUsage.requestsToday)}{" "}
                      remaining
                    </span>
                    <span className="settings-view__cloud-usage-detail">
                      {cloudUsage.requestsToday} of {cloudUsage.dailyLimit} used today
                    </span>
                  </div>
                )}

                <div className="settings-view__field-row">
                  <label className="settings-view__label">
                    Max response length (main)
                  </label>
                  <input
                    type="number"
                    className="settings-view__number-input"
                    min={256}
                    max={32768}
                    value={form.aiMaxTokensMain ?? 8192}
                    onChange={(e) => {
                      const val = Math.max(
                        256,
                        Math.min(32768, Number(e.target.value) || 8192),
                      );
                      setForm({ ...form, aiMaxTokensMain: val });
                    }}
                  />
                  <span className="settings-view__hint">
                    Max output tokens for the main assistant window
                  </span>
                </div>

                <div className="settings-view__field-row">
                  <label className="settings-view__label">
                    Max response length (overlay)
                  </label>
                  <input
                    type="number"
                    className="settings-view__number-input"
                    min={256}
                    max={32768}
                    value={form.aiMaxTokensOverlay ?? 2048}
                    onChange={(e) => {
                      const val = Math.max(
                        256,
                        Math.min(32768, Number(e.target.value) || 2048),
                      );
                      setForm({ ...form, aiMaxTokensOverlay: val });
                    }}
                  />
                  <span className="settings-view__hint">
                    Max output tokens for the overlay assistant
                  </span>
                </div>

                <div className="settings-view__field-row">
                  <label className="settings-view__label">Context scope</label>
                  <select
                    className="settings-view__select"
                    value={form.cloudAiContextScope ?? "all"}
                    onChange={(e) =>
                      setForm({ ...form, cloudAiContextScope: e.target.value })
                    }
                  >
                    <option value="all">All games</option>
                    <option value="installed">Installed only</option>
                    <option value="recent">Played in last year</option>
                  </select>
                </div>
                <p className="settings-view__field-hint">
                  Controls which games are included in the context sent to the AI
                  provider. Reducing scope lowers token usage and cost.
                </p>

                {/* Always Include / Exclude game lists */}
                <div className="settings-view__field-row">
                  <label className="settings-view__label">
                    Always include / exclude games
                  </label>
                  <input
                    type="text"
                    className="settings-view__number-input settings-view__context-search"
                    placeholder="Search games to add..."
                    value={contextGameSearch}
                    onChange={(e) => setContextGameSearch(e.target.value)}
                  />
                </div>

                {contextGameSearch.trim().length >= 2 && allGames && (
                  <div className="settings-view__context-game-results">
                    {allGames
                      .filter((g) =>
                        g.name.toLowerCase().includes(contextGameSearch.toLowerCase()),
                      )
                      .slice(0, 8)
                      .map((g) => {
                        const isIncluded = (form.cloudAiIncludedGames ?? []).includes(
                          g.gameId,
                        );
                        const isExcluded = (form.cloudAiExcludedGames ?? []).includes(
                          g.gameId,
                        );
                        return (
                          <div key={g.gameId} className="settings-view__context-game-row">
                            <span className="settings-view__context-game-name">
                              {g.name}
                            </span>
                            <button
                              className={`settings-view__context-btn ${isIncluded ? "settings-view__context-btn--active" : ""}`}
                              onClick={() => {
                                const current = form.cloudAiIncludedGames ?? [];
                                const next = isIncluded
                                  ? current.filter((id) => id !== g.gameId)
                                  : [...current, g.gameId];
                                // Also remove from excluded if adding to included
                                const excluded = isIncluded
                                  ? (form.cloudAiExcludedGames ?? [])
                                  : (form.cloudAiExcludedGames ?? []).filter(
                                      (id) => id !== g.gameId,
                                    );
                                setForm({
                                  ...form,
                                  cloudAiIncludedGames: next,
                                  cloudAiExcludedGames: excluded,
                                });
                              }}
                            >
                              {isIncluded ? "Included" : "Include"}
                            </button>
                            <button
                              className={`settings-view__context-btn settings-view__context-btn--exclude ${isExcluded ? "settings-view__context-btn--active" : ""}`}
                              onClick={() => {
                                const current = form.cloudAiExcludedGames ?? [];
                                const next = isExcluded
                                  ? current.filter((id) => id !== g.gameId)
                                  : [...current, g.gameId];
                                // Also remove from included if adding to excluded
                                const included = isExcluded
                                  ? (form.cloudAiIncludedGames ?? [])
                                  : (form.cloudAiIncludedGames ?? []).filter(
                                      (id) => id !== g.gameId,
                                    );
                                setForm({
                                  ...form,
                                  cloudAiExcludedGames: next,
                                  cloudAiIncludedGames: included,
                                });
                              }}
                            >
                              {isExcluded ? "Excluded" : "Exclude"}
                            </button>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Show current included games */}
                {(form.cloudAiIncludedGames ?? []).length > 0 && (
                  <div className="settings-view__context-list">
                    <span className="settings-view__context-list-label">
                      Always included:
                    </span>
                    {(form.cloudAiIncludedGames ?? []).map((id) => (
                      <span
                        key={id}
                        className="settings-view__context-chip settings-view__context-chip--include"
                      >
                        {gameNameMap.get(id) ?? id}
                        <button
                          className="settings-view__context-chip-remove"
                          onClick={() =>
                            setForm({
                              ...form,
                              cloudAiIncludedGames: (
                                form.cloudAiIncludedGames ?? []
                              ).filter((x) => x !== id),
                            })
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Show current excluded games */}
                {(form.cloudAiExcludedGames ?? []).length > 0 && (
                  <div className="settings-view__context-list">
                    <span className="settings-view__context-list-label">
                      Always excluded:
                    </span>
                    {(form.cloudAiExcludedGames ?? []).map((id) => (
                      <span
                        key={id}
                        className="settings-view__context-chip settings-view__context-chip--exclude"
                      >
                        {gameNameMap.get(id) ?? id}
                        <button
                          className="settings-view__context-chip-remove"
                          onClick={() =>
                            setForm({
                              ...form,
                              cloudAiExcludedGames: (
                                form.cloudAiExcludedGames ?? []
                              ).filter((x) => x !== id),
                            })
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="settings-view__field-row">
                  <label className="settings-view__checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.aiConversationAutoEndEnabled ?? true}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          aiConversationAutoEndEnabled: e.target.checked,
                        })
                      }
                    />
                    Auto-end conversations after inactivity
                  </label>
                </div>
                <p className="settings-view__field-hint">
                  Automatically end conversations after 1 hour of inactivity. When
                  disabled, conversations stay open until manually ended.
                </p>

                <div className="settings-view__field-row">
                  <label className="settings-view__checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.aiPostSessionReviewEnabled ?? false}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          aiPostSessionReviewEnabled: e.target.checked,
                        })
                      }
                    />
                    Ask me to review games after playing
                  </label>
                </div>
                <p className="settings-view__field-hint">
                  After a gaming session of 30+ minutes, sends a notification prompting
                  you to share your thoughts. Only triggers for games you haven't reviewed
                  yet.
                </p>
              </>
            )}
          </section>

          <section className="settings-view__section settings-view__section--danger">
            <h3 className="settings-view__section-title">AI Data Management</h3>

            <div className="settings-view__field-row">
              <label className="settings-view__label">Encryption Key</label>
              <span className="settings-view__value">
                {encryptionKeyExists
                  ? "Stored in Windows Credential Manager"
                  : "Not found"}
              </span>
            </div>

            {encryptionKeyExists && (
              <div className="settings-view__field-row">
                <label className="settings-view__label">Export Key</label>
                <div>
                  {!showExportedKey ? (
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        try {
                          const key = await assistantApi.exportEncryptionKey();
                          setExportedKey(key);
                          setShowExportedKey(true);
                        } catch {
                          setKeyImportMessage("Failed to export key");
                        }
                      }}
                    >
                      Show Key
                    </Button>
                  ) : (
                    <div className="settings-view__key-export">
                      <code className="settings-view__key-display">{exportedKey}</code>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(exportedKey);
                          setKeyImportMessage("Copied to clipboard (auto-clears in 30s)");
                          setTimeout(
                            () => setKeyImportMessage(null),
                            CLIPBOARD_MESSAGE_MS,
                          );
                          if (clipboardTimerRef.current)
                            clearTimeout(clipboardTimerRef.current);
                          clipboardTimerRef.current = setTimeout(() => {
                            navigator.clipboard.writeText("").catch(() => {});
                            clipboardTimerRef.current = null;
                          }, 30000);
                        }}
                      >
                        Copy
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setShowExportedKey(false);
                          setExportedKey("");
                        }}
                      >
                        Hide
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="settings-view__field-row">
              <label className="settings-view__label">Import Key</label>
              <div>
                {!showKeyImport ? (
                  <Button variant="ghost" onClick={() => setShowKeyImport(true)}>
                    Import Key
                  </Button>
                ) : (
                  <div className="settings-view__key-import">
                    {encryptionKeyExists && (
                      <p className="settings-view__key-import-warning">
                        Importing a new key will make existing encrypted AI data
                        unreadable.
                      </p>
                    )}
                    <input
                      className="settings-view__cloud-input"
                      type="text"
                      placeholder="Paste base64 key..."
                      value={importKeyValue}
                      onChange={(e) => setImportKeyValue(e.target.value)}
                    />
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <Button
                        disabled={!importKeyValue.trim() || isImportingKey}
                        onClick={async () => {
                          setIsImportingKey(true);
                          setKeyImportMessage(null);
                          try {
                            await assistantApi.importEncryptionKey(importKeyValue.trim());
                            setEncryptionKeyExists(true);
                            setImportKeyValue("");
                            setShowKeyImport(false);
                            setKeyImportMessage("Key imported successfully");
                          } catch (err) {
                            setKeyImportMessage(`Import failed: ${getErrorMessage(err)}`);
                          } finally {
                            setIsImportingKey(false);
                          }
                        }}
                      >
                        {isImportingKey ? "Importing..." : "Import"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setShowKeyImport(false);
                          setImportKeyValue("");
                          setKeyImportMessage(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                {keyImportMessage && (
                  <p className="settings-view__cloud-message">{keyImportMessage}</p>
                )}
              </div>
            </div>

            <div className="settings-view__field-row">
              <div>
                <label className="settings-view__label settings-view__label--danger">
                  Wipe All AI Data
                </label>
                <p className="settings-view__field-hint">
                  Permanently delete all conversations, memories, and journal entries for
                  all avatars.
                </p>
              </div>
              <div>
                {!showWipeConfirm ? (
                  <Button variant="danger" onClick={() => setShowWipeConfirm(true)}>
                    Wipe All AI Data
                  </Button>
                ) : (
                  <div className="settings-view__wipe-confirm">
                    <p className="settings-view__wipe-warning">
                      This will permanently delete ALL conversations, memories, and
                      journal entries for ALL avatars. Avatars and personalities will be
                      kept. This cannot be undone.
                    </p>
                    <p className="settings-view__wipe-instruction">
                      Type <strong>DELETE</strong> to confirm:
                    </p>
                    <input
                      className="settings-view__cloud-input"
                      type="text"
                      placeholder="Type DELETE"
                      value={wipeConfirmText}
                      onChange={(e) => setWipeConfirmText(e.target.value)}
                    />
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                      <Button
                        variant="danger"
                        disabled={wipeConfirmText !== "DELETE" || isWipingAi}
                        onClick={async () => {
                          setIsWipingAi(true);
                          try {
                            await assistantApi.wipeAiMemory();
                            setShowWipeConfirm(false);
                            setWipeConfirmText("");
                          } catch (err) {
                            logger.error("Settings", "api", "Failed to wipe AI data", {
                              error: getErrorMessage(err),
                            });
                          } finally {
                            setIsWipingAi(false);
                          }
                        }}
                      >
                        {isWipingAi ? "Wiping..." : "Confirm Wipe"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setShowWipeConfirm(false);
                          setWipeConfirmText("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* ── Appearance tab ──────────────────────────────────────── */}
        <div
          className={`settings-view__tab-panel ${activeTab === "appearance" ? "settings-view__tab-panel--active" : ""}`}
        >
          <section className="settings-view__section">
            <h3 className="settings-view__section-title">Theme Builder</h3>
            <p className="settings-view__section-desc">
              Customize your palette, font, icon style, and UI density. Changes preview
              live and apply when you save. <strong>Tip:</strong> Double-click any option
              to apply it instantly.
            </p>
            <ThemeBuilder
              palette={form.theme}
              iconSet={form.iconSet}
              fontFamily={form.fontFamily}
              uiScale={form.uiScale}
              onPaletteChange={(id) => setForm({ ...form, theme: id })}
              onIconSetChange={(id) => setForm({ ...form, iconSet: id })}
              onFontChange={(id) => setForm({ ...form, fontFamily: id })}
              onScaleChange={(id) => setForm({ ...form, uiScale: id })}
              onQuickApply={handleQuickApply}
            />
          </section>

          <section className="settings-view__section">
            <h3 className="settings-view__section-title">Card Display</h3>
            <p className="settings-view__section-desc">
              Choose what information appears on game cards.
            </p>
            <CardDisplaySettings />
          </section>
        </div>

        {/* ── Navigation tab ──────────────────────────────────────── */}
        <div
          className={`settings-view__tab-panel ${activeTab === "navigation" ? "settings-view__tab-panel--active" : ""}`}
        >
          <section className="settings-view__section">
            <h3 className="settings-view__section-title">Navigation</h3>
            <p className="settings-view__section-desc">
              Configure the sidebar and overlay shortcut. The overlay shortcut works
              system-wide, even when The Roost is minimized to the tray.
            </p>

            <div className="settings-view__field-row">
              <label className="settings-view__label">Overlay Shortcut</label>
              <select
                className="settings-view__select"
                value={form.commandCenterShortcut}
                onChange={(e) =>
                  setForm({
                    ...form,
                    commandCenterShortcut: e.target.value as CommandCenterShortcut,
                  })
                }
              >
                {SHORTCUT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-view__field-row">
              <label className="settings-view__label">Sidebar Mode</label>
              <select
                className="settings-view__select"
                value={form.railMode}
                onChange={(e) =>
                  setForm({ ...form, railMode: e.target.value as RailMode })
                }
              >
                <option value="dynamic">Dynamic (hover to expand)</option>
                <option value="expanded">Always open</option>
                <option value="collapsed">Always collapsed (icons only)</option>
              </select>
            </div>

            <div className="settings-view__field-row">
              <label className="settings-view__label">Media Controls</label>
              <select
                className="settings-view__select"
                value={form.mediaControlsMode ?? "dynamic"}
                onChange={(e) =>
                  setForm({
                    ...form,
                    mediaControlsMode: e.target.value as MediaControlsMode,
                  })
                }
              >
                <option value="dynamic">Dynamic (auto-show when media playing)</option>
                <option value="always">Always shown</option>
                <option value="hidden">Always hidden (manual toggle only)</option>
              </select>
            </div>
          </section>

          <section className="settings-view__section">
            <h3 className="settings-view__section-title">Media Bookmarks</h3>
            <p className="settings-view__section-desc">
              Save links to playlists, videos, or any media URL and open them from the
              overlay with one click. YouTube playlist URLs will automatically start
              playing the first track when opened. Other services (Spotify, SoundCloud,
              etc.) will open in your browser but autoplay depends on each service&apos;s
              own behavior.
            </p>
            <BookmarkManager />
          </section>
        </div>

        {/* ── Advanced tab ─────────────────────────────────────────── */}
        <div
          className={`settings-view__tab-panel ${activeTab === "advanced" ? "settings-view__tab-panel--active" : ""}`}
        >
          <section className="settings-view__section">
            <h3 className="settings-view__section-title">Tags</h3>
            <p className="settings-view__section-desc">
              Create custom tags to organize your game library.
            </p>
            <TagManager />
          </section>

          <BackupRestoreSection />

          <DeveloperSettings />
        </div>
      </div>

      {blocker.state === "blocked" && (
        <div className="settings-view__modal-overlay">
          <div className="settings-view__modal">
            <h3 className="settings-view__modal-title">Unsaved Changes</h3>
            <p className="settings-view__modal-message">
              You have unsaved settings changes. Would you like to save before leaving?
            </p>
            <div className="settings-view__modal-actions">
              <Button variant="ghost" onClick={handleDiscard}>
                Discard Changes
              </Button>
              <Button onClick={handleSaveAndLeave} loading={saving}>
                Save &amp; Leave
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
