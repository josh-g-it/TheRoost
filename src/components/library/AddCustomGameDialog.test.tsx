import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddCustomGameDialog } from "./AddCustomGameDialog";
import { useSettingsStore } from "../../store/settingsSlice";
import { useLibraryStore } from "../../store/librarySlice";

// Mock the Tauri dialog plugin
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));

// Mock customGameApi
const mockAdd = vi.fn();
const mockUpdate = vi.fn();
const mockRemove = vi.fn();

vi.mock("../../services/tauri", () => ({
  customGameApi: {
    add: (...args: unknown[]) => mockAdd(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    remove: (...args: unknown[]) => mockRemove(...args),
  },
  settingsApi: {
    load: vi.fn(),
    save: vi.fn(),
  },
}));

describe("AddCustomGameDialog", () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      settings: { iconSet: "classic" } as never,
    });
    useLibraryStore.setState({
      library: { games: [], totalCount: 0, warnings: [] },
    });
  });

  describe("add mode", () => {
    it("renders add mode UI", () => {
      render(<AddCustomGameDialog editGame={null} onClose={mockOnClose} />);

      expect(screen.getByText("Add Custom Game")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("e.g. Hollow Knight")).toBeInTheDocument();
      expect(screen.getByText("Add Game")).toBeInTheDocument();
    });

    it("disables Add Game button when name is empty", () => {
      render(<AddCustomGameDialog editGame={null} onClose={mockOnClose} />);

      const addBtn = screen.getByText("Add Game").closest("button")!;
      expect(addBtn).toBeDisabled();
    });

    it("disables Add Game button when exe path is empty", () => {
      render(<AddCustomGameDialog editGame={null} onClose={mockOnClose} />);

      const nameInput = screen.getByPlaceholderText("e.g. Hollow Knight");
      fireEvent.change(nameInput, { target: { value: "My Game" } });

      const addBtn = screen.getByText("Add Game").closest("button")!;
      expect(addBtn).toBeDisabled();
    });

    it("enables Add Game button when name and path are filled", () => {
      render(<AddCustomGameDialog editGame={null} onClose={mockOnClose} />);

      fireEvent.change(screen.getByPlaceholderText("e.g. Hollow Knight"), {
        target: { value: "My Game" },
      });
      fireEvent.change(screen.getByPlaceholderText("C:\\Games\\MyGame\\game.exe"), {
        target: { value: "C:\\test.exe" },
      });

      const addBtn = screen.getByText("Add Game").closest("button")!;
      expect(addBtn).not.toBeDisabled();
    });

    it("calls onClose when Cancel is clicked", () => {
      render(<AddCustomGameDialog editGame={null} onClose={mockOnClose} />);

      fireEvent.click(screen.getByText("Cancel"));
      expect(mockOnClose).toHaveBeenCalledOnce();
    });

    it("calls onClose on Escape key", () => {
      render(<AddCustomGameDialog editGame={null} onClose={mockOnClose} />);

      fireEvent.keyDown(window, { key: "Escape" });
      expect(mockOnClose).toHaveBeenCalledOnce();
    });
  });

  describe("edit mode", () => {
    const editGame = {
      gameId: "custom-1",
      name: "Existing Game",
      description: "A test game",
      source: "manual" as const,
      sourceId: "custom-1",
      playtimeForever: 0,
      playtime2Weeks: 0,
      imgIconUrl: null,
      imgLogoUrl: null,
      lastPlayed: null,
      isInstalled: true,
      installPath: "C:\\Games",
      sizeOnDisk: null,
      launchId: null,
      launchMode: "direct" as const,
      lastUpdated: Date.now(),
    };

    it("renders edit mode UI with pre-filled values", () => {
      render(<AddCustomGameDialog editGame={editGame} onClose={mockOnClose} />);

      expect(screen.getByText("Edit Custom Game")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Existing Game")).toBeInTheDocument();
      expect(screen.getByText("Save")).toBeInTheDocument();
    });

    it("renders Remove button in edit mode", () => {
      render(<AddCustomGameDialog editGame={editGame} onClose={mockOnClose} />);

      expect(screen.getByText("Remove")).toBeInTheDocument();
    });

    it("shows confirmation dialog when Remove clicked", () => {
      render(<AddCustomGameDialog editGame={editGame} onClose={mockOnClose} />);

      fireEvent.click(screen.getByText("Remove"));
      expect(screen.getByText("Remove Game")).toBeInTheDocument();
      expect(screen.getByText(/Are you sure/)).toBeInTheDocument();
    });
  });
});
