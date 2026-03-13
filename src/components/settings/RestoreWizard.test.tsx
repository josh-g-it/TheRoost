import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RestoreWizard } from "./RestoreWizard";
import type { RestoreValidation } from "../../services/tauri";

// Mock Tauri event API
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

// Mock backup API
const mockCheckActiveSessions = vi.fn();
const mockRestoreFromBackup = vi.fn();
const mockRestartApp = vi.fn();
vi.mock("../../services/tauri", () => ({
  backupApi: {
    checkActiveSessions: (...args: unknown[]) => mockCheckActiveSessions(...args),
    restoreFromBackup: (...args: unknown[]) => mockRestoreFromBackup(...args),
    restartApp: (...args: unknown[]) => mockRestartApp(...args),
    estimateSize: vi.fn(),
    createBackup: vi.fn(),
    validateBackup: vi.fn(),
    getCredentialHints: vi.fn().mockResolvedValue([]),
  },
  settingsApi: { load: vi.fn(), save: vi.fn() },
}));

const baseValidation: RestoreValidation = {
  valid: true,
  manifest: {
    appVersion: "1.8.0",
    schemaVersion: 23,
    createdAt: "2026-02-26T12:00:00Z",
    dbSizeBytes: 1024 * 1024 * 10,
    settingsSizeBytes: 1024 * 5,
    artFileCount: 3,
    artTotalBytes: 1024 * 1024,
    spriteFileCount: 1,
    spriteTotalBytes: 50000,
    credentialHints: ["steam_api_key", "steamgriddb_api_key"],
  },
  error: null,
  schemaCompatible: true,
  schemaWarning: null,
};

describe("RestoreWizard", () => {
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckActiveSessions.mockResolvedValue([]);
  });

  it("renders step 0 with backup summary", () => {
    render(
      <RestoreWizard
        archivePath="C:\\backup.roost"
        validation={baseValidation}
        onCancel={mockOnCancel}
      />,
    );

    expect(screen.getByText("Restore Backup")).toBeInTheDocument();
    expect(screen.getByText("1.8.0")).toBeInTheDocument();
    expect(screen.getByText("v23")).toBeInTheDocument();
    expect(screen.getByText(/3 files/)).toBeInTheDocument();
  });

  it("shows schema warning when present", () => {
    const validation = {
      ...baseValidation,
      schemaWarning: "Backup is from a newer version",
    };

    render(
      <RestoreWizard
        archivePath="C:\\backup.roost"
        validation={validation}
        onCancel={mockOnCancel}
      />,
    );

    expect(screen.getByText("Backup is from a newer version")).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked on step 0", () => {
    render(
      <RestoreWizard
        archivePath="C:\\backup.roost"
        validation={baseValidation}
        onCancel={mockOnCancel}
      />,
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(mockOnCancel).toHaveBeenCalledOnce();
  });

  it("navigates to step 1 when Continue is clicked", async () => {
    render(
      <RestoreWizard
        archivePath="C:\\backup.roost"
        validation={baseValidation}
        onCancel={mockOnCancel}
      />,
    );

    fireEvent.click(screen.getByText("Continue"));

    await waitFor(() => {
      expect(screen.getByText("Active Sessions")).toBeInTheDocument();
    });
  });

  it("shows no sessions message and enables Continue", async () => {
    mockCheckActiveSessions.mockResolvedValue([]);

    render(
      <RestoreWizard
        archivePath="C:\\backup.roost"
        validation={baseValidation}
        onCancel={mockOnCancel}
      />,
    );

    fireEvent.click(screen.getByText("Continue")); // Go to step 1

    await waitFor(() => {
      expect(screen.getByText(/No active game sessions detected/)).toBeInTheDocument();
    });
  });

  it("shows active sessions and disables Continue", async () => {
    mockCheckActiveSessions.mockResolvedValue(["Elden Ring", "Celeste"]);

    render(
      <RestoreWizard
        archivePath="C:\\backup.roost"
        validation={baseValidation}
        onCancel={mockOnCancel}
      />,
    );

    fireEvent.click(screen.getByText("Continue")); // Go to step 1

    await waitFor(() => {
      expect(screen.getByText("Elden Ring")).toBeInTheDocument();
      expect(screen.getByText("Celeste")).toBeInTheDocument();
    });

    // Continue button should be disabled
    const continueBtn = screen
      .getAllByText("Continue")
      .find((el) => el.closest("button"));
    expect(continueBtn?.closest("button")).toBeDisabled();
  });

  it("navigates to credential step and shows fields", async () => {
    mockCheckActiveSessions.mockResolvedValue([]);

    render(
      <RestoreWizard
        archivePath="C:\\backup.roost"
        validation={baseValidation}
        onCancel={mockOnCancel}
      />,
    );

    // Step 0 → 1
    fireEvent.click(screen.getByText("Continue"));

    // Step 1 → 2
    await waitFor(() => {
      expect(screen.getByText("Active Sessions")).toBeInTheDocument();
    });

    // Wait for session check, then proceed
    await waitFor(() => {
      const buttons = screen.getAllByText("Continue");
      const step1Continue = buttons[buttons.length - 1];
      expect(step1Continue.closest("button")).not.toBeDisabled();
    });

    fireEvent.click(screen.getAllByText("Continue").pop()!);

    await waitFor(() => {
      expect(screen.getByText("API Keys")).toBeInTheDocument();
      expect(screen.getByText("Steam Web API Key")).toBeInTheDocument();
      expect(screen.getByText("SteamGridDB API Key")).toBeInTheDocument();
    });
  });

  it("shows no credential fields when hints are empty", async () => {
    const validation = {
      ...baseValidation,
      manifest: { ...baseValidation.manifest!, credentialHints: [] },
    };
    mockCheckActiveSessions.mockResolvedValue([]);

    render(
      <RestoreWizard
        archivePath="C:\\backup.roost"
        validation={validation}
        onCancel={mockOnCancel}
      />,
    );

    // Navigate to step 2
    fireEvent.click(screen.getByText("Continue")); // step 0 → 1
    await waitFor(() => expect(screen.getByText("Active Sessions")).toBeInTheDocument());

    await waitFor(() => {
      const buttons = screen.getAllByText("Continue");
      expect(buttons[buttons.length - 1].closest("button")).not.toBeDisabled();
    });
    fireEvent.click(screen.getAllByText("Continue").pop()!); // step 1 → 2

    await waitFor(() => {
      expect(screen.getByText("API Keys")).toBeInTheDocument();
      expect(screen.getByText(/No API keys were configured/)).toBeInTheDocument();
    });
  });

  it("renders 4 progress dots", () => {
    render(
      <RestoreWizard
        archivePath="C:\\backup.roost"
        validation={baseValidation}
        onCancel={mockOnCancel}
      />,
    );

    const dots = document.querySelectorAll(".restore-wizard__dot");
    expect(dots.length).toBe(4);
  });
});
