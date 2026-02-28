import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantAvatars } from "./AssistantAvatars";
import { makeAiAvatar, makeAiPersonality } from "../../test/factories";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

const mockListAvatars = vi.fn();
const mockListPersonalities = vi.fn();
const mockSwitchAvatar = vi.fn();
const mockCreateAvatar = vi.fn();
const mockCreatePersonality = vi.fn();
const mockDeleteAvatar = vi.fn();
const mockWipeAvatarData = vi.fn();

vi.mock("../../services/tauri", () => ({
  assistantApi: {
    listAvatars: (...args: unknown[]) => mockListAvatars(...args),
    listPersonalities: (...args: unknown[]) => mockListPersonalities(...args),
    switchAvatar: (...args: unknown[]) => mockSwitchAvatar(...args),
    createAvatar: (...args: unknown[]) => mockCreateAvatar(...args),
    createPersonality: (...args: unknown[]) => mockCreatePersonality(...args),
    deleteAvatar: (...args: unknown[]) => mockDeleteAvatar(...args),
    wipeAvatarData: (...args: unknown[]) => mockWipeAvatarData(...args),
  },
}));

vi.mock("../../store/settingsSlice", () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ settings: { iconSet: "classic" } }),
}));

describe("AssistantAvatars", () => {
  const defaultPersonalities = [
    makeAiPersonality("p1", { name: "Friendly" }),
    makeAiPersonality("p2", { name: "Analytical", isBuiltin: false }),
  ];

  const defaultAvatars = [
    makeAiAvatar("a1", { name: "Buddy", personalityId: "p1", isActive: true }),
    makeAiAvatar("a2", { name: "Scholar", personalityId: "p2", isActive: false }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockListAvatars.mockResolvedValue(defaultAvatars);
    mockListPersonalities.mockResolvedValue(defaultPersonalities);
    mockSwitchAvatar.mockResolvedValue(undefined);
    mockCreateAvatar.mockResolvedValue(
      makeAiAvatar("a3", { name: "NewBot", personalityId: "p1" }),
    );
    mockCreatePersonality.mockResolvedValue(
      makeAiPersonality("p3", { name: "Custom", isBuiltin: false }),
    );
    mockDeleteAvatar.mockResolvedValue(undefined);
    mockWipeAvatarData.mockResolvedValue(undefined);
  });

  it("renders avatar list with names", async () => {
    const onSwitch = vi.fn();
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={onSwitch} />);

    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
      expect(screen.getByText("Scholar")).toBeInTheDocument();
    });
  });

  it("active avatar shows active badge", async () => {
    const onSwitch = vi.fn();
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={onSwitch} />);

    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    // The non-active avatar should have a Switch button
    expect(screen.getByText("Switch")).toBeInTheDocument();
  });

  it("switch avatar calls API and fires onAvatarSwitch", async () => {
    const onSwitch = vi.fn();
    const user = userEvent.setup();
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={onSwitch} />);

    await waitFor(() => {
      expect(screen.getByText("Switch")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Switch"));

    await waitFor(() => {
      expect(mockSwitchAvatar).toHaveBeenCalledWith("a2");
      expect(onSwitch).toHaveBeenCalledWith("a2");
    });
  });

  it("create avatar form submission calls API", async () => {
    const onSwitch = vi.fn();
    const user = userEvent.setup();
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={onSwitch} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Avatar name")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Avatar name"), "NewBot");
    await user.click(screen.getByRole("button", { name: /Create Avatar/ }));

    await waitFor(() => {
      expect(mockCreateAvatar).toHaveBeenCalledWith("NewBot", "p1");
    });
  });

  it("personality list renders built-in and custom personalities", async () => {
    const onSwitch = vi.fn();
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={onSwitch} />);

    await waitFor(() => {
      // "Friendly" appears in both the avatar item personality and personality list,
      // so use getAllByText to verify at least one exists
      expect(screen.getAllByText("Friendly").length).toBeGreaterThanOrEqual(1);
      // "Analytical" appears in the avatar personality display and personality list
      expect(screen.getAllByText("Analytical").length).toBeGreaterThanOrEqual(1);
    });

    // Built-in badge should appear for the first personality
    expect(screen.getByText("Built-in")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockListAvatars.mockReturnValue(new Promise(() => {}));
    mockListPersonalities.mockReturnValue(new Promise(() => {}));

    const onSwitch = vi.fn();
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={onSwitch} />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  // ── Delete Avatar Tests ──────────────────────────────────────────

  it("delete button hidden for active avatar", async () => {
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    // Only one Delete button should exist (for non-active Scholar, not for active Buddy)
    const deleteButtons = screen.getAllByTitle("Delete this avatar");
    expect(deleteButtons).toHaveLength(1);
  });

  it("delete button hidden when only 1 avatar exists", async () => {
    mockListAvatars.mockResolvedValue([
      makeAiAvatar("a1", { name: "Solo", personalityId: "p1", isActive: true }),
    ]);

    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Solo")).toBeInTheDocument();
    });

    expect(screen.queryByTitle("Delete this avatar")).not.toBeInTheDocument();
  });

  it("clicking delete shows confirmation dialog", async () => {
    const user = userEvent.setup();
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Scholar")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Delete this avatar"));

    expect(
      screen.getByText(/All conversations, memories, and journal entries/),
    ).toBeInTheDocument();
    // Confirmation dialog has a danger-styled Delete button
    const confirmOverlay = screen
      .getByText(/All conversations, memories, and journal entries/)
      .closest(".avatar-item__confirm-overlay")!;
    expect(
      confirmOverlay.querySelector(".avatar-item__confirm-btn--danger"),
    ).toBeInTheDocument();
  });

  it("confirming delete calls API and removes avatar from list", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    render(
      <AssistantAvatars
        activeAvatarId="a1"
        onAvatarSwitch={vi.fn()}
        onAvatarDeleted={onDeleted}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Scholar")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Delete this avatar"));
    // Click the danger-styled confirm button inside the overlay
    const confirmOverlay = screen
      .getByText(/All conversations, memories, and journal entries/)
      .closest(".avatar-item__confirm-overlay")!;
    const confirmBtn = confirmOverlay.querySelector(
      ".avatar-item__confirm-btn--danger",
    ) as HTMLElement;
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockDeleteAvatar).toHaveBeenCalledWith("a2");
      expect(onDeleted).toHaveBeenCalledWith("a2");
    });

    // Scholar should be removed from the list
    await waitFor(() => {
      expect(screen.queryByText("Scholar")).not.toBeInTheDocument();
    });
  });

  it("cancel dismisses delete confirmation", async () => {
    const user = userEvent.setup();
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Scholar")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Delete this avatar"));
    expect(
      screen.getByText(/All conversations, memories, and journal entries/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByText(/All conversations, memories, and journal entries/),
    ).not.toBeInTheDocument();
    expect(mockDeleteAvatar).not.toHaveBeenCalled();
  });

  // ── Wipe Avatar Data Tests ───────────────────────────────────────

  it("clear data button visible for all avatars", async () => {
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    // Both avatars should have Clear Data buttons
    const clearButtons = screen.getAllByTitle("Clear all data for this avatar");
    expect(clearButtons).toHaveLength(2);
  });

  it("clicking clear data shows confirmation dialog", async () => {
    const user = userEvent.setup();
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    const clearButtons = screen.getAllByTitle("Clear all data for this avatar");
    await user.click(clearButtons[0]);

    expect(
      screen.getByText(/all memories, journal entries, and conversation history/),
    ).toBeInTheDocument();
    // Confirmation dialog has a danger-styled Clear Data button
    const confirmOverlay = screen
      .getByText(/all memories, journal entries, and conversation history/)
      .closest(".avatar-item__confirm-overlay")!;
    expect(
      confirmOverlay.querySelector(".avatar-item__confirm-btn--danger"),
    ).toBeInTheDocument();
  });

  it("confirming wipe calls API", async () => {
    const user = userEvent.setup();
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    const clearButtons = screen.getAllByTitle("Clear all data for this avatar");
    await user.click(clearButtons[0]);
    // Click the danger-styled confirm button inside the overlay
    const confirmOverlay = screen
      .getByText(/all memories, journal entries, and conversation history/)
      .closest(".avatar-item__confirm-overlay")!;
    const confirmBtn = confirmOverlay.querySelector(
      ".avatar-item__confirm-btn--danger",
    ) as HTMLElement;
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockWipeAvatarData).toHaveBeenCalledWith("a1");
    });
  });

  it("cancel dismisses wipe confirmation", async () => {
    const user = userEvent.setup();
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    const clearButtons = screen.getAllByTitle("Clear all data for this avatar");
    await user.click(clearButtons[0]);
    expect(
      screen.getByText(/all memories, journal entries, and conversation history/),
    ).toBeInTheDocument();

    // Get the Cancel button from within the confirmation overlay
    const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });
    await user.click(cancelButtons[cancelButtons.length - 1]);

    expect(
      screen.queryByText(/all memories, journal entries, and conversation history/),
    ).not.toBeInTheDocument();
    expect(mockWipeAvatarData).not.toHaveBeenCalled();
  });
});
