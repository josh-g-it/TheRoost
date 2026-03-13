import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { desktopDir, join } from "@tauri-apps/api/path";
import { listen } from "@tauri-apps/api/event";

import { Button } from "../common/Button";
import { RestoreWizard } from "./RestoreWizard";
import {
  backupApi,
  type BackupEstimate,
  type RestoreValidation,
} from "../../services/tauri";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function BackupRestoreSection() {
  // Backup state
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<BackupEstimate | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [backupPhase, setBackupPhase] = useState("");
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState(false);

  // Restore state
  const [validating, setValidating] = useState(false);
  const [restoreArchivePath, setRestoreArchivePath] = useState<string | null>(null);
  const [restoreValidation, setRestoreValidation] = useState<RestoreValidation | null>(
    null,
  );
  const [showRestoreWizard, setShowRestoreWizard] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const handleCreateBackup = async () => {
    setBackupError(null);
    setBackupSuccess(false);
    setEstimating(true);

    try {
      const est = await backupApi.estimateSize();
      setEstimate(est);
      setShowConfirm(true);
    } catch (e) {
      setBackupError(getErrorMessage(e));
      logger.error("Settings", "backup", "Failed to estimate backup size", {
        error: getErrorMessage(e),
      });
    } finally {
      setEstimating(false);
    }
  };

  const handleConfirmBackup = async () => {
    setShowConfirm(false);
    setCreating(true);
    setBackupPhase("Preparing...");

    const unlisten = await listen<{ phase: string; detail: string }>(
      "backup-progress",
      (event) => {
        setBackupPhase(event.payload.detail);
      },
    );

    try {
      const desktop = await desktopDir();
      const date = new Date().toISOString().slice(0, 10);
      const defaultName = `TheRoost_Backup_${date}.roost`;
      const defaultPath = await join(desktop, defaultName);

      const outputPath = await save({
        title: "Save Backup",
        defaultPath,
        filters: [{ name: "Roost Backup", extensions: ["roost"] }],
      });

      if (!outputPath) {
        setCreating(false);
        return;
      }

      await backupApi.createBackup(outputPath);
      setBackupSuccess(true);
      logger.info("Settings", "backup", "Backup created successfully");
    } catch (e) {
      setBackupError(getErrorMessage(e));
      logger.error("Settings", "backup", "Failed to create backup", {
        error: getErrorMessage(e),
      });
    } finally {
      unlisten();
      setCreating(false);
      setBackupPhase("");
    }
  };

  const handleRestoreBackup = async () => {
    setRestoreError(null);
    setValidating(true);

    try {
      const selected = await open({
        title: "Select Backup File",
        directory: false,
        multiple: false,
        filters: [{ name: "Roost Backup", extensions: ["roost"] }],
      });

      if (!selected) {
        setValidating(false);
        return;
      }

      const archivePath = selected as string;
      const validation = await backupApi.validateBackup(archivePath);

      if (!validation.valid) {
        setRestoreError(validation.error || "This backup file is not compatible.");
        setValidating(false);
        return;
      }

      setRestoreArchivePath(archivePath);
      setRestoreValidation(validation);
      setShowRestoreWizard(true);
    } catch (e) {
      setRestoreError(getErrorMessage(e));
      logger.error("Settings", "backup", "Failed to validate backup", {
        error: getErrorMessage(e),
      });
    } finally {
      setValidating(false);
    }
  };

  if (showRestoreWizard && restoreArchivePath && restoreValidation) {
    return (
      <RestoreWizard
        archivePath={restoreArchivePath}
        validation={restoreValidation}
        onCancel={() => {
          setShowRestoreWizard(false);
          setRestoreArchivePath(null);
          setRestoreValidation(null);
        }}
      />
    );
  }

  return (
    <section className="settings-view__section">
      <h3 className="settings-view__section-title">Backup &amp; Restore</h3>
      <p className="settings-view__section-desc">
        Create and restore full backups of your game library, settings, and custom art.
        API keys are not included in backups for security — you will be prompted to
        re-enter them when restoring.
      </p>

      <div className="settings-view__field-row">
        <div>
          <label className="settings-view__label">Create Backup</label>
          <p className="settings-view__field-hint">
            Save a full backup of all your data to a .roost file.
          </p>
        </div>
        <Button onClick={handleCreateBackup} loading={estimating} disabled={creating}>
          Create Backup
        </Button>
      </div>

      <div className="settings-view__field-row">
        <div>
          <label className="settings-view__label">Restore from Backup</label>
          <p className="settings-view__field-hint">
            Restore your data from a previously saved .roost backup file.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={handleRestoreBackup}
          loading={validating}
          disabled={creating}
        >
          Restore from Backup
        </Button>
      </div>

      {/* Backup progress */}
      {creating && (
        <div className="settings-view__field-row">
          <div>
            <span className="btn__spinner" style={{ display: "inline-block" }} />
            <span style={{ marginLeft: "var(--space-sm)" }}>{backupPhase}</span>
          </div>
        </div>
      )}

      {/* Backup success */}
      {backupSuccess && (
        <div
          className="settings-view__field-row"
          style={{ color: "var(--color-success)" }}
        >
          Backup created successfully!
        </div>
      )}

      {/* Errors */}
      {backupError && (
        <div
          className="settings-view__field-row"
          style={{ color: "var(--color-danger)" }}
        >
          {backupError}
        </div>
      )}
      {restoreError && (
        <div
          className="settings-view__field-row"
          style={{ color: "var(--color-danger)" }}
        >
          {restoreError}
        </div>
      )}

      {/* Size estimate confirmation modal */}
      {showConfirm && estimate && (
        <div className="settings-view__modal-overlay">
          <div className="settings-view__modal">
            <h3 className="settings-view__modal-title">Create Backup</h3>
            <p className="settings-view__modal-message">
              Estimated backup size:{" "}
              <strong>{formatBytes(estimate.totalSizeBytes)}</strong>
            </p>
            <ul
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--color-text-secondary)",
                padding: "0 0 0 var(--space-md)",
                margin: "var(--space-xs) 0",
              }}
            >
              <li>Database: {formatBytes(estimate.dbSizeBytes)}</li>
              <li>Settings: {formatBytes(estimate.settingsSizeBytes)}</li>
              <li>
                Custom art: {estimate.artFileCount} files (
                {formatBytes(estimate.artTotalBytes)})
              </li>
              <li>
                Sprites: {estimate.spriteFileCount} files (
                {formatBytes(estimate.spriteTotalBytes)})
              </li>
            </ul>
            <div className="settings-view__modal-actions">
              <Button variant="ghost" onClick={() => setShowConfirm(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmBackup}>Save Backup</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
