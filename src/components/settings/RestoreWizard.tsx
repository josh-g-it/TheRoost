import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { Button } from "../common/Button";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { backupApi, type RestoreValidation } from "../../services/tauri";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";

import "./RestoreWizard.css";

interface RestoreWizardProps {
  archivePath: string;
  validation: RestoreValidation;
  onCancel: () => void;
}

const TOTAL_STEPS = 4;

/** Map credential account names to human-readable labels. */
function credentialLabel(account: string): string {
  switch (account) {
    case "steam_api_key":
      return "Steam Web API Key";
    case "steamgriddb_api_key":
      return "SteamGridDB API Key";
    default:
      if (account.startsWith("cloud_ai_")) {
        const provider = account.replace("cloud_ai_", "");
        return `${provider.charAt(0).toUpperCase() + provider.slice(1)} AI API Key`;
      }
      return account;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function RestoreWizard({ archivePath, validation, onCancel }: RestoreWizardProps) {
  const [step, setStep] = useState(0);
  const manifest = validation.manifest!;

  // Step 1 — Session check
  const [activeSessions, setActiveSessions] = useState<string[]>([]);
  const [checkingSessions, setCheckingSessions] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 2 — Credential entry
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});

  // Step 3 — Restore progress
  const [restoring, setRestoring] = useState(false);
  const [restorePhase, setRestorePhase] = useState("");
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // Session polling
  const checkSessions = useCallback(async () => {
    setCheckingSessions(true);
    try {
      const sessions = await backupApi.checkActiveSessions();
      setActiveSessions(sessions);
    } catch (e) {
      logger.error("RestoreWizard", "backup", "Failed to check sessions", {
        error: getErrorMessage(e),
      });
    } finally {
      setCheckingSessions(false);
    }
  }, []);

  useEffect(() => {
    if (step === 1) {
      checkSessions();
      pollRef.current = setInterval(checkSessions, 5000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [step, checkSessions]);

  // Initialize credential fields from hints
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const hint of manifest.credentialHints) {
      initial[hint] = "";
    }
    setCredentialValues(initial);
  }, [manifest.credentialHints]);

  const handleRestore = async () => {
    setRestoring(true);
    setRestoreError(null);
    setRestorePhase("Starting restore...");

    const unlisten = await listen<{ phase: string; detail: string }>(
      "backup-progress",
      (event) => {
        setRestorePhase(event.payload.detail);
      },
    );

    try {
      // Filter out empty credential values
      const filledCredentials: Record<string, string> = {};
      for (const [key, value] of Object.entries(credentialValues)) {
        if (value.trim()) {
          filledCredentials[key] = value.trim();
        }
      }

      await backupApi.restoreFromBackup(archivePath, filledCredentials);
      setRestoreSuccess(true);
      logger.info("RestoreWizard", "backup", "Restore completed successfully");
    } catch (e) {
      setRestoreError(getErrorMessage(e));
      logger.error("RestoreWizard", "backup", "Restore failed", {
        error: getErrorMessage(e),
      });
    } finally {
      unlisten();
      setRestoring(false);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await backupApi.restartApp();
    } catch (e) {
      logger.error("RestoreWizard", "backup", "Restart failed", {
        error: getErrorMessage(e),
      });
      setRestarting(false);
    }
  };

  // ── Progress dots ──────────────────────────────────────────────

  const progressDots = (
    <div className="restore-wizard__progress">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          className={`restore-wizard__dot ${i <= step ? "restore-wizard__dot--active" : ""}`}
        />
      ))}
    </div>
  );

  // ── Step 0: Summary ────────────────────────────────────────────

  const stepSummary = (
    <div className="restore-wizard__step">
      <h2 className="restore-wizard__title">Restore Backup</h2>
      <p className="restore-wizard__description">
        Review the backup details below before restoring.
      </p>

      <div className="restore-wizard__info-card">
        <div className="restore-wizard__info-row">
          <span className="restore-wizard__info-label">App Version</span>
          <span className="restore-wizard__info-value">{manifest.appVersion}</span>
        </div>
        <div className="restore-wizard__info-row">
          <span className="restore-wizard__info-label">Created</span>
          <span className="restore-wizard__info-value">
            {new Date(manifest.createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <div className="restore-wizard__info-row">
          <span className="restore-wizard__info-label">Database</span>
          <span className="restore-wizard__info-value">
            {formatBytes(manifest.dbSizeBytes)}
          </span>
        </div>
        <div className="restore-wizard__info-row">
          <span className="restore-wizard__info-label">Custom Art</span>
          <span className="restore-wizard__info-value">
            {manifest.artFileCount} files ({formatBytes(manifest.artTotalBytes)})
          </span>
        </div>
        <div className="restore-wizard__info-row">
          <span className="restore-wizard__info-label">Sprites</span>
          <span className="restore-wizard__info-value">
            {manifest.spriteFileCount ?? 0} files (
            {formatBytes(manifest.spriteTotalBytes ?? 0)})
          </span>
        </div>
        <div className="restore-wizard__info-row">
          <span className="restore-wizard__info-label">Schema Version</span>
          <span className="restore-wizard__info-value">v{manifest.schemaVersion}</span>
        </div>
      </div>

      {validation.schemaWarning && (
        <div className="restore-wizard__warning">{validation.schemaWarning}</div>
      )}

      <div className="restore-wizard__actions">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => setStep(1)}>Continue</Button>
      </div>
    </div>
  );

  // ── Step 1: Active session check ───────────────────────────────

  const sessionsBlocking = activeSessions.length > 0;

  const stepSessions = (
    <div className="restore-wizard__step">
      <h2 className="restore-wizard__title">Active Sessions</h2>

      {checkingSessions && activeSessions.length === 0 ? (
        <p className="restore-wizard__description">
          Checking for active game sessions...
        </p>
      ) : sessionsBlocking ? (
        <>
          <p className="restore-wizard__description">
            The following games are currently being tracked by the session monitor. Please
            close them before restoring.
          </p>
          <ul className="restore-wizard__session-list">
            {activeSessions.map((name) => (
              <li key={name} className="restore-wizard__session-item">
                <span className="restore-wizard__session-dot" />
                {name}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="restore-wizard__description">
          No active game sessions detected. You can proceed with the restore.
        </p>
      )}

      <div className="restore-wizard__actions">
        <Button variant="ghost" onClick={() => setStep(0)}>
          Back
        </Button>
        <Button onClick={() => setStep(2)} disabled={sessionsBlocking}>
          Continue
        </Button>
      </div>
    </div>
  );

  // ── Step 2: Credential entry ───────────────────────────────────

  const hasCredentialHints = manifest.credentialHints.length > 0;

  const stepCredentials = (
    <div className="restore-wizard__step">
      <h2 className="restore-wizard__title">API Keys</h2>

      {hasCredentialHints ? (
        <>
          <p className="restore-wizard__description">
            Your previous setup had the following API keys configured. Enter them below to
            restore full functionality, or skip to add them later in Settings.
          </p>

          {manifest.credentialHints.map((hint) => (
            <div key={hint} className="restore-wizard__credential-field">
              <label className="restore-wizard__credential-label">
                {credentialLabel(hint)}
              </label>
              <input
                type="password"
                className="restore-wizard__credential-input"
                value={credentialValues[hint] || ""}
                onChange={(e) =>
                  setCredentialValues((prev) => ({
                    ...prev,
                    [hint]: e.target.value,
                  }))
                }
                placeholder="Paste your API key..."
                autoComplete="off"
              />
            </div>
          ))}

          <p className="restore-wizard__credential-hint">
            All other settings (theme, shelves, AI configuration, etc.) will be restored
            automatically from the backup.
          </p>
        </>
      ) : (
        <p className="restore-wizard__description">
          No API keys were configured in this backup. All settings will be restored
          automatically.
        </p>
      )}

      <div className="restore-wizard__actions">
        <Button variant="ghost" onClick={() => setStep(1)}>
          Back
        </Button>
        <div style={{ display: "flex", gap: "var(--space-sm)" }}>
          {hasCredentialHints && (
            <Button variant="ghost" onClick={() => setStep(3)}>
              Skip Keys
            </Button>
          )}
          <Button onClick={() => setStep(3)}>Continue</Button>
        </div>
      </div>
    </div>
  );

  // ── Step 3: Confirmation & Restore ─────────────────────────────

  const stepRestore = (
    <div className="restore-wizard__step">
      {!restoring && !restoreSuccess && !restoreError && (
        <>
          <h2 className="restore-wizard__title">Ready to Restore</h2>
          <p className="restore-wizard__description">
            A safety backup of your current data will be created automatically before
            restoring. If anything goes wrong, your data will be rolled back.
          </p>
          <p className="restore-wizard__description">
            The app will need to restart after the restore completes.
          </p>

          <div className="restore-wizard__actions">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={handleRestore}>Restore Now</Button>
          </div>
        </>
      )}

      {restoring && (
        <div className="restore-wizard__progress-status">
          <LoadingSpinner size="lg" />
          <p className="restore-wizard__progress-text">{restorePhase}</p>
        </div>
      )}

      {restoreSuccess && (
        <>
          <h2 className="restore-wizard__title">Restore Complete</h2>
          <p className="restore-wizard__success">
            Your data has been restored successfully. Please restart the app to load the
            restored data.
          </p>
          <div className="restore-wizard__actions">
            <div />
            <Button onClick={handleRestart} loading={restarting}>
              Restart App
            </Button>
          </div>
        </>
      )}

      {restoreError && (
        <>
          <h2 className="restore-wizard__title">Restore Failed</h2>
          <p className="restore-wizard__error">{restoreError}</p>
          <p className="restore-wizard__description">
            Your previous data has been automatically restored from the safety backup. No
            data was lost.
          </p>
          <div className="restore-wizard__actions">
            <div />
            <Button onClick={onCancel}>Close</Button>
          </div>
        </>
      )}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────

  const steps = [stepSummary, stepSessions, stepCredentials, stepRestore];

  return (
    <div className="restore-wizard">
      <div className="restore-wizard__container">
        {progressDots}
        {steps[step]}
      </div>
    </div>
  );
}
