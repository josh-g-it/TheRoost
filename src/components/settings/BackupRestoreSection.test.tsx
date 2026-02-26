import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BackupRestoreSection } from "./BackupRestoreSection";

// Mock Tauri dialog plugin
const mockSave = vi.fn();
const mockOpen = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: (...args: unknown[]) => mockSave(...args),
  open: (...args: unknown[]) => mockOpen(...args),
}));

// Mock Tauri path API
vi.mock("@tauri-apps/api/path", () => ({
  desktopDir: vi.fn().mockResolvedValue("C:\\Users\\test\\Desktop"),
  join: vi
    .fn()
    .mockImplementation((...parts: string[]) => Promise.resolve(parts.join("\\"))),
}));

// Mock Tauri event API
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

// Mock backup API
const mockEstimateSize = vi.fn();
const mockCreateBackup = vi.fn();
const mockValidateBackup = vi.fn();
vi.mock("../../services/tauri", () => ({
  backupApi: {
    estimateSize: (...args: unknown[]) => mockEstimateSize(...args),
    createBackup: (...args: unknown[]) => mockCreateBackup(...args),
    validateBackup: (...args: unknown[]) => mockValidateBackup(...args),
    checkActiveSessions: vi.fn().mockResolvedValue([]),
    restoreFromBackup: vi.fn(),
    getCredentialHints: vi.fn().mockResolvedValue([]),
    restartApp: vi.fn(),
  },
  settingsApi: { load: vi.fn(), save: vi.fn() },
}));

describe("BackupRestoreSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the section title and buttons", () => {
    render(<BackupRestoreSection />);

    expect(screen.getByText("Backup & Restore")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Backup" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Restore from Backup" }),
    ).toBeInTheDocument();
  });

  it("shows section description with security note", () => {
    render(<BackupRestoreSection />);

    expect(
      screen.getByText(/API keys are not included in backups for security/),
    ).toBeInTheDocument();
  });

  it("calls estimateSize when Create Backup is clicked", async () => {
    mockEstimateSize.mockResolvedValue({
      totalSizeBytes: 1024 * 1024 * 42,
      dbSizeBytes: 1024 * 1024 * 40,
      settingsSizeBytes: 1024 * 50,
      artFileCount: 5,
      artTotalBytes: 1024 * 1024 * 2,
    });

    render(<BackupRestoreSection />);

    fireEvent.click(screen.getByRole("button", { name: "Create Backup" }));

    await waitFor(() => {
      expect(mockEstimateSize).toHaveBeenCalledOnce();
    });
  });

  it("shows size estimate confirmation modal", async () => {
    mockEstimateSize.mockResolvedValue({
      totalSizeBytes: 1024 * 1024 * 42,
      dbSizeBytes: 1024 * 1024 * 40,
      settingsSizeBytes: 1024 * 50,
      artFileCount: 5,
      artTotalBytes: 1024 * 1024 * 2,
    });

    render(<BackupRestoreSection />);
    fireEvent.click(screen.getByRole("button", { name: "Create Backup" }));

    await waitFor(() => {
      expect(screen.getByText(/42\.0 MB/)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Save Backup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows error when estimate fails", async () => {
    mockEstimateSize.mockRejectedValue(new Error("Disk not available"));

    render(<BackupRestoreSection />);
    fireEvent.click(screen.getByRole("button", { name: "Create Backup" }));

    await waitFor(() => {
      expect(screen.getByText("Disk not available")).toBeInTheDocument();
    });
  });

  it("shows error when validation fails", async () => {
    mockOpen.mockResolvedValue("C:\\backup.roost");
    mockValidateBackup.mockResolvedValue({
      valid: false,
      manifest: null,
      error: "Missing required file: theroost.db",
      schemaCompatible: false,
      schemaWarning: null,
    });

    render(<BackupRestoreSection />);
    fireEvent.click(screen.getByRole("button", { name: "Restore from Backup" }));

    await waitFor(() => {
      expect(screen.getByText("Missing required file: theroost.db")).toBeInTheDocument();
    });
  });

  it("does nothing when user cancels file picker", async () => {
    mockOpen.mockResolvedValue(null);

    render(<BackupRestoreSection />);
    fireEvent.click(screen.getByRole("button", { name: "Restore from Backup" }));

    await waitFor(() => {
      expect(mockValidateBackup).not.toHaveBeenCalled();
    });
  });
});
