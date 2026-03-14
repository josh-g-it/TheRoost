import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { useSettings } from "../../hooks/useSettings";
import { developerApi, achievementsApi, newsApi } from "../../services/tauri";
import { useAchievementsStore } from "../../store/achievementsSlice";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { APP_NAME } from "../../constants";

export function DeveloperSettings() {
  const { settings, saveSettings } = useSettings();
  const navigate = useNavigate();

  // Clear-all-data modal state
  const [clearStage, setClearStage] = useState<0 | 1 | 2>(0);
  const [confirmText, setConfirmText] = useState("");
  const [clearing, setClearing] = useState(false);

  // Disable confirmation modal state
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  // Achievement reset state
  const [resettingAchievements, setResettingAchievements] = useState(false);

  // News cache state
  const [clearingNews, setClearingNews] = useState(false);

  if (!settings) return null;

  const enabled = settings.devSettingsEnabled;

  const handleToggle = async (checked: boolean) => {
    if (!checked && enabled) {
      // Turning OFF — show confirmation
      setShowDisableConfirm(true);
      return;
    }
    // Turning ON
    logger.info("DeveloperSettings", "settings", "Enabling developer settings");
    await saveSettings({ ...settings, devSettingsEnabled: true });
  };

  const handleConfirmDisable = async () => {
    logger.info("DeveloperSettings", "settings", "Disabling developer settings");
    setShowDisableConfirm(false);
    await saveSettings({ ...settings, devSettingsEnabled: false });
  };

  const handleRerunOnboarding = async () => {
    logger.info("DeveloperSettings", "settings", "Re-running onboarding");
    await saveSettings({ ...settings, isFirstRun: true });
  };

  const handleResetAchievements = async () => {
    setResettingAchievements(true);
    try {
      const count = await achievementsApi.clearAchievementCache();
      logger.info("DeveloperSettings", "achievements", "Achievement cache cleared", {
        deleted: count,
      });
      useAchievementsStore.getState().resetCache();
      useAchievementsStore.getState().batchFetchAll();
    } catch (e) {
      logger.error(
        "DeveloperSettings",
        "achievements",
        "Failed to clear achievement cache",
        {
          error: getErrorMessage(e),
        },
      );
    } finally {
      setResettingAchievements(false);
    }
  };

  const handleClearNewsCache = async () => {
    setClearingNews(true);
    try {
      const count = await newsApi.clearNewsCache();
      logger.info("DeveloperSettings", "news", "News cache cleared", { deleted: count });
    } catch (e) {
      logger.error("DeveloperSettings", "news", "Failed to clear news cache", {
        error: getErrorMessage(e),
      });
    } finally {
      setClearingNews(false);
    }
  };

  const handleClearAllData = async () => {
    logger.warn("DeveloperSettings", "settings", "Clearing all user data");
    setClearing(true);
    try {
      await developerApi.clearAllData();
    } catch {
      // App should exit — if we're still here, something went wrong
      setClearing(false);
      setClearStage(0);
    }
  };

  return (
    <section className="settings-view__section settings-view__section--developer">
      <h3 className="settings-view__section-title">Developer</h3>
      <p className="settings-view__section-desc">
        Advanced tools for troubleshooting, diagnostics, and data management.
      </p>

      {/* Enable toggle — always visible */}
      <div className="settings-view__field-row">
        <div>
          <label className="settings-view__label">Enable Developer Settings</label>
          <p className="settings-view__field-hint">
            Show advanced developer tools and diagnostic options.
          </p>
        </div>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => handleToggle(e.target.checked)}
          className="settings-view__checkbox"
        />
      </div>

      {/* Gated tools — only when enabled */}
      {enabled && (
        <>
          <div className="settings-view__field-row">
            <div>
              <label className="settings-view__label">Debug Panel</label>
              <p className="settings-view__field-hint">
                View structured logs, app state, and performance diagnostics.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/debug")}>
              Open Debug Panel
            </Button>
          </div>

          <div className="settings-view__field-row">
            <div>
              <label className="settings-view__label">Re-run Setup Wizard</label>
              <p className="settings-view__field-hint">
                Go through the initial setup again. Your current API key and Steam account
                will be pre-filled but can be changed.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRerunOnboarding}>
              Re-run Setup
            </Button>
          </div>

          <div className="settings-view__field-row">
            <div>
              <label className="settings-view__label">Reset Achievement Cache</label>
              <p className="settings-view__field-hint">
                Clear all cached achievement data and re-fetch from Steam. Useful if
                achievement data appears stale or incorrect.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              loading={resettingAchievements}
              onClick={handleResetAchievements}
            >
              Reset Achievements
            </Button>
          </div>

          <div className="settings-view__field-row">
            <div>
              <label className="settings-view__label">Clear News Cache</label>
              <p className="settings-view__field-hint">
                Clear all cached news articles. Fresh articles will be fetched when you
                next visit the News page or click Refresh.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              loading={clearingNews}
              onClick={handleClearNewsCache}
            >
              Clear News Cache
            </Button>
          </div>

          <div className="settings-view__field-row">
            <div>
              <label className="settings-view__label">Clear All Data</label>
              <p className="settings-view__field-hint">
                Permanently delete all {APP_NAME} data and start fresh. This cannot be
                undone.
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={() => setClearStage(1)}>
              Clear All Data
            </Button>
          </div>
        </>
      )}

      {/* Disable confirmation modal */}
      {showDisableConfirm && (
        <div className="settings-view__modal-overlay">
          <div className="settings-view__modal">
            <h3 className="settings-view__modal-title">Disable Developer Settings?</h3>
            <p className="settings-view__modal-message">
              This will hide all developer tools and reset developer settings to their
              defaults. You can re-enable them at any time.
            </p>
            <div className="settings-view__modal-actions">
              <Button variant="ghost" onClick={() => setShowDisableConfirm(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmDisable}>Disable</Button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Data — Stage 1: Warning */}
      {clearStage === 1 && (
        <div className="settings-view__modal-overlay">
          <div className="settings-view__modal">
            <h3 className="settings-view__modal-title">Clear All Data</h3>
            <p className="settings-view__modal-message">
              This will permanently delete <strong>all</strong> of your {APP_NAME} data:
            </p>
            <ul className="settings-view__modal-list">
              <li>Steam API key (from Windows Credential Manager)</li>
              <li>Settings and preferences</li>
              <li>Game library database (tags, favorites, shelves, sessions)</li>
              <li>Metadata cache</li>
            </ul>
            <p className="settings-view__modal-message">
              {APP_NAME} will quit after clearing data. On next launch, you will go
              through the setup wizard as if it were a fresh install.
            </p>
            <div className="settings-view__modal-actions">
              <Button variant="ghost" onClick={() => setClearStage(0)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setClearStage(2)}>
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Data — Stage 2: Type DELETE */}
      {clearStage === 2 && (
        <div className="settings-view__modal-overlay">
          <div className="settings-view__modal">
            <h3 className="settings-view__modal-title">Are you absolutely sure?</h3>
            <p className="settings-view__modal-message">
              Type <strong>DELETE</strong> below to confirm. This action cannot be undone.
            </p>
            <Input
              placeholder='Type "DELETE" to confirm'
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
            />
            <div className="settings-view__modal-actions">
              <Button
                variant="ghost"
                onClick={() => {
                  setClearStage(0);
                  setConfirmText("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={confirmText !== "DELETE"}
                loading={clearing}
                onClick={handleClearAllData}
              >
                Clear Everything &amp; Quit
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
