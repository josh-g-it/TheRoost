import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StorageView, __resetStorageCache } from "./StorageView";
import type { StorageScanResult } from "../../types/storage";

// Mock Tauri event API
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

// Mock recharts ResponsiveContainer (doesn't render in jsdom without dimensions)
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

// Mock storage API
const mockScanStorage = vi.fn();
vi.mock("../../services/tauri", () => ({
  storageApi: {
    scanStorage: (...args: unknown[]) => mockScanStorage(...args),
  },
}));

// Mock useSettingsStore for AppIcon
vi.mock("../../store/settingsSlice", () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ settings: { iconSet: "classic" } }),
}));

const SAMPLE_RESULT: StorageScanResult = {
  drives: [
    {
      driveLetter: "D:",
      totalBytes: 1_000_000_000_000,
      freeBytes: 400_000_000_000,
      gameBytes: 500_000_000_000,
      gameCount: 25,
    },
    {
      driveLetter: "E:",
      totalBytes: 500_000_000_000,
      freeBytes: 300_000_000_000,
      gameBytes: 150_000_000_000,
      gameCount: 10,
    },
  ],
  games: [
    {
      gameId: "g1",
      name: "ARK: Survival Evolved",
      source: "steam",
      sourceId: "346110",
      installPath: "D:\\Games\\ARK",
      sizeBytes: 200_000_000_000,
      driveLetter: "D:",
    },
    {
      gameId: "g2",
      name: "Cyberpunk 2077",
      source: "steam",
      sourceId: "1091500",
      installPath: "D:\\Games\\Cyberpunk",
      sizeBytes: 80_000_000_000,
      driveLetter: "D:",
    },
    {
      gameId: "g3",
      name: "Fortnite",
      source: "epic",
      sourceId: "fn123",
      installPath: "E:\\Games\\Fortnite",
      sizeBytes: 60_000_000_000,
      driveLetter: "E:",
    },
  ],
  totalGameBytes: 340_000_000_000,
  scannedCount: 3,
  scanDurationMs: 2500,
};

describe("StorageView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetStorageCache();
  });

  it("shows loading state initially", () => {
    mockScanStorage.mockReturnValue(new Promise(() => {})); // never resolves
    render(<StorageView />);
    expect(screen.getByText("Preparing scan...")).toBeInTheDocument();
  });

  it("renders scan results after loading", async () => {
    mockScanStorage.mockResolvedValue(SAMPLE_RESULT);
    render(<StorageView />);

    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument(); // Games on Disk
    });

    // Stat cards
    expect(screen.getByText("Games on Disk")).toBeInTheDocument();
    expect(screen.getByText("Game Storage")).toBeInTheDocument();
    expect(screen.getByText("Largest Game")).toBeInTheDocument();
    expect(screen.getByText("ARK: Survival Evolved")).toBeInTheDocument();
    expect(screen.getByText("Avg. Game Size")).toBeInTheDocument();

    // Chart cards
    expect(screen.getByText("Drive Overview")).toBeInTheDocument();
    expect(screen.getByText("Storage by Launcher")).toBeInTheDocument();
    expect(screen.getByText("Games by Size")).toBeInTheDocument();

    // Drive labels
    expect(screen.getByText(/D: —/)).toBeInTheDocument();
    expect(screen.getByText(/E: —/)).toBeInTheDocument();

    // Scan duration
    expect(screen.getByText(/Scanned in 2.5s/)).toBeInTheDocument();
  });

  it("shows empty state when no games found", async () => {
    mockScanStorage.mockResolvedValue({
      drives: [],
      games: [],
      totalGameBytes: 0,
      scannedCount: 0,
      scanDurationMs: 50,
    });
    render(<StorageView />);

    await waitFor(() => {
      expect(screen.getByText("No installed games found")).toBeInTheDocument();
    });
  });

  it("shows error state on scan failure", async () => {
    mockScanStorage.mockRejectedValue(new Error("DB locked"));
    render(<StorageView />);

    await waitFor(() => {
      expect(screen.getByText("Scan failed")).toBeInTheDocument();
      expect(screen.getByText("DB locked")).toBeInTheDocument();
    });
  });

  it("renders the header with title and rescan button", async () => {
    mockScanStorage.mockResolvedValue(SAMPLE_RESULT);
    render(<StorageView />);

    expect(screen.getByText("Storage")).toBeInTheDocument();
    expect(screen.getByText("Rescan")).toBeInTheDocument();
  });

  it("filters games by drive when a drive bar is clicked", async () => {
    mockScanStorage.mockResolvedValue(SAMPLE_RESULT);
    const user = userEvent.setup();
    render(<StorageView />);

    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    // Click the E: drive bar
    const eDriveBar = screen.getByText(/E: —/).closest(".drive-bar")!;
    await user.click(eDriveBar);

    // Filter chip should appear
    expect(screen.getByText("Drive: E:")).toBeInTheDocument();

    // Subtitle should reflect filtering
    expect(screen.getByText(/1 games? matching filters/)).toBeInTheDocument();
  });

  it("clears drive filter when chip dismiss is clicked", async () => {
    mockScanStorage.mockResolvedValue(SAMPLE_RESULT);
    const user = userEvent.setup();
    render(<StorageView />);

    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    // Click D: drive to filter
    const dDriveBar = screen.getByText(/D: —/).closest(".drive-bar")!;
    await user.click(dDriveBar);
    expect(screen.getByText("Drive: D:")).toBeInTheDocument();

    // Click the chip to dismiss
    const chip = screen.getByTitle("Clear drive filter");
    await user.click(chip);

    // Filter chip should be gone
    expect(screen.queryByText("Drive: D:")).not.toBeInTheDocument();
  });

  it("toggles drive filter off when same drive is clicked again", async () => {
    mockScanStorage.mockResolvedValue(SAMPLE_RESULT);
    const user = userEvent.setup();
    render(<StorageView />);

    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    const dDriveBar = screen.getByText(/D: —/).closest(".drive-bar")!;

    // Click to activate
    await user.click(dDriveBar);
    expect(screen.getByText("Drive: D:")).toBeInTheDocument();

    // Click again to deactivate
    await user.click(dDriveBar);
    expect(screen.queryByText("Drive: D:")).not.toBeInTheDocument();
  });

  // ── Caching tests ──────────────────────────────────────

  it("displays cached data immediately on revisit without loading spinner", async () => {
    // First visit: populate the cache
    mockScanStorage.mockResolvedValue(SAMPLE_RESULT);
    const { unmount } = render(<StorageView />);

    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });
    unmount();

    // Second visit: should show cached data immediately (no loading spinner)
    const scanPromise = new Promise<StorageScanResult>((resolve) => {
      // Scan will hang — but cached data should already be visible
      setTimeout(() => resolve(SAMPLE_RESULT), 10_000);
    });
    mockScanStorage.mockReturnValue(scanPromise);

    render(<StorageView />);

    // Cached data visible immediately — no "Preparing scan..." spinner
    expect(screen.queryByText("Preparing scan...")).not.toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Games on Disk")).toBeInTheDocument();
    expect(screen.getByText("ARK: Survival Evolved")).toBeInTheDocument();
  });

  it("shows background refresh indicator when updating cached data", async () => {
    // First visit: populate the cache
    mockScanStorage.mockResolvedValue(SAMPLE_RESULT);
    const { unmount } = render(<StorageView />);

    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });
    unmount();

    // Second visit: scan takes time
    let resolveScan!: (value: StorageScanResult) => void;
    mockScanStorage.mockReturnValue(
      new Promise<StorageScanResult>((r) => {
        resolveScan = r;
      }),
    );

    render(<StorageView />);

    // Cached data is visible and shows "Updating..." indicator
    expect(screen.getByText("3")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Updating...")).toBeInTheDocument();
    });

    // Resolve the scan with updated data
    const updatedResult = { ...SAMPLE_RESULT, scannedCount: 5 };
    resolveScan(updatedResult);

    // Data updates in place
    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });
    expect(screen.queryByText("Updating...")).not.toBeInTheDocument();
  });

  it("updates cached data when background rescan completes", async () => {
    // First visit
    mockScanStorage.mockResolvedValue(SAMPLE_RESULT);
    const { unmount: unmount1 } = render(<StorageView />);
    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });
    unmount1();

    // Second visit — rescan returns updated data
    const updatedResult: StorageScanResult = {
      ...SAMPLE_RESULT,
      scannedCount: 7,
      totalGameBytes: 500_000_000_000,
    };
    mockScanStorage.mockResolvedValue(updatedResult);
    const { unmount: unmount2 } = render(<StorageView />);

    // Initially shows cached value (3), then updates to 7
    expect(screen.getByText("3")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("7")).toBeInTheDocument();
    });
    unmount2();

    // Third visit — should show the updated cached value (7) immediately
    mockScanStorage.mockReturnValue(new Promise(() => {})); // never resolves
    render(<StorageView />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});
