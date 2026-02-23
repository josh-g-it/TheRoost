import { useState } from "react";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { useSettingsStore } from "../../store/settingsSlice";
import { steamApi, coverArtApi } from "../../services/tauri";
import { THEMES, type ThemeId } from "../../hooks/useTheme";
import { FONT_OPTIONS, ICON_SET_OPTIONS, UI_SCALE_OPTIONS } from "../../types/theme";
import type { IconSetId, FontFamilyId, UIScaleId } from "../../types/theme";
import { getIcon } from "../../utils/icons";
import type { IconName } from "../../utils/icons";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { APP_NAME } from "../../constants";
import { useLibraryStore } from "../../store/librarySlice";
import type { AppSettings, PlayerSummary } from "../../types";
import {
  DEFAULT_CARD_DISPLAY,
  DEFAULT_COMMAND_CENTER_SLOTS,
  DEFAULT_PROFILE_CHART_OPTIONS,
} from "../../types";
import "./FirstRunSetup.css";

export function FirstRunSetup() {
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Customization state
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>("dark-gaming");
  const [selectedFont, setSelectedFont] = useState<FontFamilyId>("system");
  const [selectedIconSet, setSelectedIconSet] = useState<IconSetId>("default");
  const [selectedScale, setSelectedScale] = useState<UIScaleId>("comfortable");
  const [openSection, setOpenSection] = useState<"palette" | "font" | "icons" | "scale">(
    "palette",
  );

  // SteamGridDB state
  const [sgdbKey, setSgdbKey] = useState("");
  const [sgdbSaving, setSgdbSaving] = useState(false);
  const [sgdbError, setSgdbError] = useState("");

  // Tray / session tracking state
  const [minimizeToTray, setMinimizeToTray] = useState(true);

  // Account lookup state
  const [lookupInput, setLookupInput] = useState("");
  const [resolvedProfile, setResolvedProfile] = useState<PlayerSummary | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");

  const saveSettings = useSettingsStore((s) => s.saveSettings);

  const handleLookup = async () => {
    if (!lookupInput.trim()) return;
    logger.info("FirstRunSetup", "api", "Looking up Steam account", {
      input: lookupInput.trim(),
    });
    setLookupLoading(true);
    setLookupError("");
    setResolvedProfile(null);
    try {
      const profile = await steamApi.resolveSteamAccount(apiKey, lookupInput.trim());
      logger.info("FirstRunSetup", "api", "Account resolved", {
        personaName: profile.personaName,
      });
      setResolvedProfile(profile);
    } catch (e) {
      const msg = getErrorMessage(e);
      logger.error("FirstRunSetup", "api", "Account lookup failed", { error: msg });
      setLookupError(
        msg.includes("Not found")
          ? "No Steam account found. Try a different username, profile URL, or Steam ID."
          : `Lookup failed: ${msg}`,
      );
    } finally {
      setLookupLoading(false);
    }
  };

  const handleClearProfile = () => {
    setResolvedProfile(null);
    setLookupInput("");
    setLookupError("");
  };

  const handleComplete = async () => {
    logger.info("FirstRunSetup", "settings", "Completing setup", {
      theme: selectedTheme,
    });
    setSaving(true);
    setError("");
    try {
      const settings: AppSettings = {
        steamApiKey: apiKey || null,
        steamId: resolvedProfile?.steamid || null,
        isFirstRun: false,
        theme: selectedTheme,
        iconSet: selectedIconSet,
        fontFamily: selectedFont,
        uiScale: selectedScale,
        cardDisplay: { ...DEFAULT_CARD_DISPLAY },
        profileChartOptions: { ...DEFAULT_PROFILE_CHART_OPTIONS },
        commandCenterSlots: [...DEFAULT_COMMAND_CENTER_SLOTS],
        commandCenterShortcut: "Ctrl+Space",
        railMode: "dynamic",
        minimizeToTray,
        devSettingsEnabled: false,
      };
      await saveSettings(settings);
      logger.info("FirstRunSetup", "settings", "Setup completed successfully");
    } catch (e) {
      const msg = getErrorMessage(e);
      logger.error("FirstRunSetup", "settings", "Setup completion failed", {
        error: msg,
      });
      setError(msg);
      setSaving(false);
    }
  };

  const steps = [
    // Step 0: Welcome
    <div key="welcome" className="setup__step">
      <h1 className="setup__title">Welcome to {APP_NAME}</h1>
      <p className="setup__description">
        Your entire PC game collection, one beautiful home. Let&apos;s get you set up in
        just a couple of steps.
      </p>
      <Button size="lg" onClick={() => setStep(1)}>
        Get Started
      </Button>
    </div>,

    // Step 1: API Key with tutorial
    <div key="apikey" className="setup__step">
      <h2 className="setup__title">Steam Web API Key</h2>
      <p className="setup__description">
        A Steam Web API key lets {APP_NAME} read your game library, playtime stats, and
        profile information directly from Steam. It&apos;s free and takes about 30 seconds
        to create.
      </p>
      <div className="setup__tutorial">
        <p className="setup__tutorial-heading">How to get your API key:</p>
        <ol className="setup__tutorial-steps">
          <li>Make sure you are logged in to Steam in your browser</li>
          <li>
            Visit{" "}
            <a
              href="https://steamcommunity.com/dev/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="setup__link"
            >
              steamcommunity.com/dev/apikey
            </a>
          </li>
          <li>
            Enter any domain name (e.g. &quot;localhost&quot;) and click
            &quot;Register&quot;
          </li>
          <li>Copy the key shown on the page and paste it below</li>
        </ol>
      </div>
      <Input
        label="API Key"
        type="password"
        placeholder="Paste your Steam Web API key here"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
      />
      <p className="setup__hint">
        Your key is stored securely on your device and never sent anywhere except
        Steam&apos;s own servers.
      </p>
      <div className="setup__actions">
        <Button variant="ghost" onClick={() => setStep(0)}>
          Back
        </Button>
        <Button onClick={() => setStep(2)} disabled={!apiKey.trim()}>
          Next
        </Button>
      </div>
    </div>,

    // Step 2: Find Account
    <div key="findaccount" className="setup__step">
      <h2 className="setup__title">Find Your Steam Account</h2>
      <p className="setup__description">
        Enter your Steam username, profile URL, or 64-bit Steam ID and we&apos;ll look it
        up for you.
      </p>

      {!resolvedProfile ? (
        <>
          <Input
            label="Steam username, profile URL, or Steam ID"
            placeholder="e.g. gaben, https://steamcommunity.com/id/gaben"
            value={lookupInput}
            onChange={(e) => {
              setLookupInput(e.target.value);
              setLookupError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLookup();
            }}
          />
          {lookupError && <p className="setup__error">{lookupError}</p>}
          <p className="setup__hint">
            Your custom URL name is the part after /id/ in your Steam profile URL. For
            example, in steamcommunity.com/id/gaben the name is &quot;gaben&quot;.
          </p>
          <div className="setup__actions">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              onClick={handleLookup}
              loading={lookupLoading}
              disabled={!lookupInput.trim()}
            >
              Look Up
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="setup__profile-card">
            <img
              src={resolvedProfile.avatarFull}
              alt={resolvedProfile.personaName}
              className="setup__profile-avatar"
            />
            <div className="setup__profile-info">
              <span className="setup__profile-name">{resolvedProfile.personaName}</span>
              <span className="setup__profile-id">{resolvedProfile.steamid}</span>
            </div>
          </div>
          <p className="setup__hint">
            Is this your account? If not, click &quot;Not Me&quot; to try again.
          </p>
          {error && <p className="setup__error">{error}</p>}
          <div className="setup__actions">
            <Button variant="ghost" onClick={handleClearProfile}>
              Not Me
            </Button>
            <Button
              onClick={() => {
                // Kick off library scan early — runs in background during remaining steps
                useLibraryStore
                  .getState()
                  .refreshLibrary(apiKey, resolvedProfile!.steamid);
                setStep(3);
              }}
            >
              That&apos;s Me
            </Button>
          </div>
        </>
      )}
    </div>,

    // Step 3: Customize Appearance
    <div key="settings" className="setup__step">
      <h2 className="setup__title">Customize Your Look</h2>
      <p className="setup__description">
        Pick a palette, font, icon style, and UI density. Changes preview live. You can
        always tweak these later in Settings.
      </p>

      <div className="setup__customizer">
        {/* ── Palette ──────────────────────────────────────── */}
        <div
          className={`setup__customizer-section ${openSection === "palette" ? "setup__customizer-section--open" : ""}`}
        >
          <button
            type="button"
            className="setup__customizer-header"
            onClick={() => setOpenSection("palette")}
          >
            <div className="setup__customizer-selected">
              <div className="setup__palette-mini" data-theme={selectedTheme}>
                <div className="setup__palette-mini-bg" />
                <div className="setup__palette-mini-accent" />
              </div>
              <div className="setup__customizer-info">
                <span className="setup__customizer-label">Palette</span>
                <span className="setup__customizer-value">
                  {THEMES.find((t) => t.id === selectedTheme)?.name}
                </span>
              </div>
            </div>
            <span className="setup__customizer-chevron" />
          </button>
          <div className="setup__customizer-body">
            <div className="setup__customizer-body-inner">
              <div className="setup__palette-grid">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`setup__palette-swatch ${selectedTheme === t.id ? "setup__palette-swatch--selected" : ""}`}
                    onClick={() => {
                      setSelectedTheme(t.id);
                      document.documentElement.setAttribute("data-theme", t.id);
                    }}
                    aria-label={`${t.name}: ${t.description}`}
                    aria-pressed={selectedTheme === t.id}
                  >
                    <div className="setup__palette-preview" data-theme={t.id}>
                      <div className="setup__palette-bg" />
                      <div className="setup__palette-accent" />
                    </div>
                    <span className="setup__palette-name">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Font ─────────────────────────────────────────── */}
        <div
          className={`setup__customizer-section ${openSection === "font" ? "setup__customizer-section--open" : ""}`}
        >
          <button
            type="button"
            className="setup__customizer-header"
            onClick={() => setOpenSection("font")}
          >
            <div className="setup__customizer-selected">
              <span
                className="setup__font-mini"
                style={{
                  fontFamily: FONT_OPTIONS.find((f) => f.id === selectedFont)?.family,
                }}
              >
                Aa
              </span>
              <div className="setup__customizer-info">
                <span className="setup__customizer-label">Font</span>
                <span className="setup__customizer-value">
                  {FONT_OPTIONS.find((f) => f.id === selectedFont)?.name}
                </span>
              </div>
            </div>
            <span className="setup__customizer-chevron" />
          </button>
          <div className="setup__customizer-body">
            <div className="setup__customizer-body-inner">
              <div className="setup__font-list">
                {FONT_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`setup__font-card ${selectedFont === f.id ? "setup__font-card--selected" : ""}`}
                    onClick={() => {
                      setSelectedFont(f.id);
                      document.documentElement.style.setProperty(
                        "--font-family",
                        f.family,
                      );
                    }}
                    aria-pressed={selectedFont === f.id}
                  >
                    <span className="setup__font-name">{f.name}</span>
                    <span className="setup__font-sample" style={{ fontFamily: f.family }}>
                      The quick brown fox jumps
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Icons ────────────────────────────────────────── */}
        <div
          className={`setup__customizer-section ${openSection === "icons" ? "setup__customizer-section--open" : ""}`}
        >
          <button
            type="button"
            className="setup__customizer-header"
            onClick={() => setOpenSection("icons")}
          >
            <div className="setup__customizer-selected">
              <div className="setup__icon-mini">
                {ICON_SET_OPTIONS.find((s) => s.id === selectedIconSet)
                  ?.preview.slice(0, 3)
                  .map((iconName) => {
                    const Icon = getIcon(iconName as IconName, selectedIconSet);
                    return <Icon key={iconName} size={14} />;
                  })}
              </div>
              <div className="setup__customizer-info">
                <span className="setup__customizer-label">Icons</span>
                <span className="setup__customizer-value">
                  {ICON_SET_OPTIONS.find((s) => s.id === selectedIconSet)?.name}
                </span>
              </div>
            </div>
            <span className="setup__customizer-chevron" />
          </button>
          <div className="setup__customizer-body">
            <div className="setup__customizer-body-inner">
              <div className="setup__icon-grid">
                {ICON_SET_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`setup__icon-card ${selectedIconSet === s.id ? "setup__icon-card--selected" : ""}`}
                    onClick={() => setSelectedIconSet(s.id)}
                    aria-pressed={selectedIconSet === s.id}
                  >
                    <span className="setup__icon-card-name">{s.name}</span>
                    <div className="setup__icon-card-samples">
                      {s.preview.map((iconName) => {
                        const Icon = getIcon(iconName as IconName, s.id);
                        return <Icon key={iconName} size={16} />;
                      })}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── UI Scale ─────────────────────────────────────── */}
        <div
          className={`setup__customizer-section ${openSection === "scale" ? "setup__customizer-section--open" : ""}`}
        >
          <button
            type="button"
            className="setup__customizer-header"
            onClick={() => setOpenSection("scale")}
          >
            <div className="setup__customizer-selected">
              <span className="setup__scale-mini">
                {
                  { minimal: "S", comfortable: "M", expanded: "L", large: "XL" }[
                    selectedScale
                  ]
                }
              </span>
              <div className="setup__customizer-info">
                <span className="setup__customizer-label">UI Scale</span>
                <span className="setup__customizer-value">
                  {UI_SCALE_OPTIONS.find((s) => s.id === selectedScale)?.name}
                </span>
              </div>
            </div>
            <span className="setup__customizer-chevron" />
          </button>
          <div className="setup__customizer-body">
            <div className="setup__customizer-body-inner">
              <div className="setup__scale-list">
                {UI_SCALE_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`setup__scale-card ${selectedScale === s.id ? "setup__scale-card--selected" : ""}`}
                    onClick={() => {
                      setSelectedScale(s.id);
                      if (s.id === "comfortable") {
                        document.documentElement.removeAttribute("data-ui-scale");
                      } else {
                        document.documentElement.setAttribute("data-ui-scale", s.id);
                      }
                    }}
                    aria-pressed={selectedScale === s.id}
                  >
                    <span className="setup__scale-name">{s.name}</span>
                    <span className="setup__scale-desc">{s.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="setup__actions">
        <Button variant="ghost" onClick={() => setStep(2)}>
          Back
        </Button>
        <Button onClick={() => setStep(4)}>Next</Button>
      </div>
    </div>,

    // Step 4: SteamGridDB API Key (Optional)
    <div key="steamgriddb" className="setup__step">
      <h2 className="setup__title">Cover Art for Non-Steam Games</h2>
      <p className="setup__description">
        {APP_NAME} can fetch beautiful cover art for your Epic, EA, Ubisoft, and
        Battle.net games using <strong>SteamGridDB</strong>, a free community image
        database. This step is completely optional.
      </p>

      <div className="setup__tutorial">
        <p className="setup__tutorial-heading">How to get a SteamGridDB API key:</p>
        <ol className="setup__tutorial-steps">
          <li>
            Create a free account at{" "}
            <a
              href="https://www.steamgriddb.com"
              target="_blank"
              rel="noopener noreferrer"
              className="setup__link"
            >
              steamgriddb.com
            </a>
          </li>
          <li>
            Go to <strong>Preferences</strong> &rarr; <strong>API</strong>
          </li>
          <li>Copy your API key and paste it below</li>
        </ol>
      </div>

      <Input
        label="SteamGridDB API Key"
        type="password"
        placeholder="Paste your SteamGridDB API key here (optional)"
        value={sgdbKey}
        onChange={(e) => {
          setSgdbKey(e.target.value);
          setSgdbError("");
        }}
      />

      <p className="setup__hint">
        No SteamGridDB key? No problem. GOG games get cover art automatically, and you can
        always add a key later in Settings.
      </p>

      {sgdbError && <p className="setup__error">{sgdbError}</p>}

      <div className="setup__actions">
        <Button variant="ghost" onClick={() => setStep(3)}>
          Back
        </Button>
        <div style={{ display: "flex", gap: "var(--space-sm)" }}>
          <Button variant="ghost" onClick={() => setStep(5)}>
            Skip
          </Button>
          {sgdbKey.trim() && (
            <Button
              loading={sgdbSaving}
              onClick={async () => {
                setSgdbSaving(true);
                setSgdbError("");
                try {
                  await coverArtApi.storeSgdbKey(sgdbKey.trim());
                  logger.info("FirstRunSetup", "api", "SteamGridDB key saved");
                  setStep(5);
                } catch (e) {
                  const msg = getErrorMessage(e);
                  logger.error("FirstRunSetup", "api", "Failed to save SteamGridDB key", {
                    error: msg,
                  });
                  setSgdbError(
                    "Failed to save key. You can try again or skip this step.",
                  );
                } finally {
                  setSgdbSaving(false);
                }
              }}
            >
              Save Key &amp; Continue
            </Button>
          )}
        </div>
      </div>
    </div>,

    // Step 5: Background & Session Tracking
    <div key="background" className="setup__step">
      <h2 className="setup__title">Background &amp; Session Tracking</h2>
      <p className="setup__description">
        {APP_NAME} can automatically track your play sessions by detecting when games are
        running. For this to work, {APP_NAME} needs to be running in the background.
      </p>

      <div className="setup__toggle-row">
        <label className="setup__toggle-label">
          <input
            type="checkbox"
            checked={minimizeToTray}
            onChange={(e) => setMinimizeToTray(e.target.checked)}
            className="setup__toggle-checkbox"
          />
          Minimize to system tray when closed
        </label>
      </div>

      <div className="setup__info-box">
        {minimizeToTray ? (
          <p>
            Closing the window will keep {APP_NAME} running in the system tray. Your game
            sessions will be tracked automatically, even when the window is hidden. Use
            &quot;Fully Quit&quot; from the tray icon to exit completely.
          </p>
        ) : (
          <p>
            Closing the window will fully quit {APP_NAME}. Sessions will only be tracked
            while the app window is open.
          </p>
        )}
      </div>

      <p className="setup__hint">You can change this anytime in Settings.</p>
      {error && <p className="setup__error">{error}</p>}
      <div className="setup__actions">
        <Button variant="ghost" onClick={() => setStep(4)}>
          Back
        </Button>
        <Button onClick={handleComplete} loading={saving}>
          Finish Setup
        </Button>
      </div>
    </div>,
  ];

  if (saving && !error) {
    return (
      <div className="setup">
        <LoadingSpinner size="lg" message="Setting things up..." />
      </div>
    );
  }

  return (
    <div className="setup">
      <div className="setup__container">
        <div className="setup__progress">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`setup__progress-dot ${i <= step ? "setup__progress-dot--active" : ""}`}
            />
          ))}
        </div>
        {steps[step]}
      </div>
    </div>
  );
}
