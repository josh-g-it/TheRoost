import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantAvatars } from "./AssistantAvatars";
import { makeAiAvatar, makeAiPersonality } from "../../test/factories";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn().mockResolvedValue(null),
  open: vi.fn().mockResolvedValue(null),
}));

const mockListAvatars = vi.fn();
const mockListPersonalities = vi.fn();
const mockSwitchAvatar = vi.fn();
const mockCreateAvatar = vi.fn();
const mockDeleteAvatar = vi.fn();
const mockWipeAvatarData = vi.fn();
const mockUpdateAvatar = vi.fn();
const mockListCompanionRoles = vi.fn();
const mockGetAvatarStats = vi.fn();
const mockListSprites = vi.fn();
const mockReadSprite = vi.fn();
const mockStartConversation = vi.fn();

vi.mock("../../services/tauri", () => ({
  assistantApi: {
    listAvatars: (...args: unknown[]) => mockListAvatars(...args),
    listPersonalities: (...args: unknown[]) => mockListPersonalities(...args),
    switchAvatar: (...args: unknown[]) => mockSwitchAvatar(...args),
    createAvatar: (...args: unknown[]) => mockCreateAvatar(...args),
    deleteAvatar: (...args: unknown[]) => mockDeleteAvatar(...args),
    wipeAvatarData: (...args: unknown[]) => mockWipeAvatarData(...args),
    updateAvatar: (...args: unknown[]) => mockUpdateAvatar(...args),
    listCompanionRoles: (...args: unknown[]) => mockListCompanionRoles(...args),
    getAvatarStats: (...args: unknown[]) => mockGetAvatarStats(...args),
    startConversation: (...args: unknown[]) => mockStartConversation(...args),
  },
  spriteApi: {
    listSprites: (...args: unknown[]) => mockListSprites(...args),
    readSprite: (...args: unknown[]) => mockReadSprite(...args),
    setActiveSprite: vi.fn().mockResolvedValue(undefined),
    deleteSprite: vi.fn().mockResolvedValue(undefined),
    exportSprite: vi.fn().mockResolvedValue(undefined),
    importSpriteFromPath: vi.fn().mockResolvedValue(undefined),
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
    mockDeleteAvatar.mockResolvedValue(undefined);
    mockWipeAvatarData.mockResolvedValue(undefined);
    mockUpdateAvatar.mockImplementation((_id: string, fields: Record<string, unknown>) =>
      Promise.resolve(makeAiAvatar("a1", { ...fields })),
    );
    mockListCompanionRoles.mockResolvedValue([
      {
        id: "gaming-companion",
        name: "Gaming Companion",
        description: "A friendly gaming buddy",
        systemPromptText: "You are a gaming companion.",
      },
    ]);
    mockStartConversation.mockResolvedValue("conv-1");
    mockGetAvatarStats.mockResolvedValue({
      memoryCount: 5,
      journalCount: 3,
      createdAt: "2026-01-01T00:00:00Z",
    });
    mockListSprites.mockResolvedValue([]);
    mockReadSprite.mockRejectedValue(new Error("not found"));
  });

  it("renders avatar list with names", async () => {
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
      expect(screen.getByText("Scholar")).toBeInTheDocument();
    });
  });

  it("active avatar shows active badge in list and detail", async () => {
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      // Active badge appears in both list panel and detail panel
      expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("selecting an avatar shows detail panel", async () => {
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      // Active avatar is selected by default — detail panel should show name input
      expect(screen.getByLabelText("Avatar name")).toBeInTheDocument();
    });
  });

  it("switch avatar calls API from detail panel", async () => {
    const onSwitch = vi.fn();
    const user = userEvent.setup();
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={onSwitch} />);

    await waitFor(() => {
      expect(screen.getByText("Scholar")).toBeInTheDocument();
    });

    // Select the non-active avatar
    await user.click(screen.getByLabelText("Select avatar Scholar"));

    await waitFor(() => {
      expect(screen.getByText("Switch to This Avatar")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Switch to This Avatar"));

    await waitFor(() => {
      expect(mockSwitchAvatar).toHaveBeenCalledWith("a2");
      expect(onSwitch).toHaveBeenCalledWith("a2");
    });
  });

  it("create avatar flow works via + button with wizard", async () => {
    const user = userEvent.setup();
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    // Click the + button to show wizard
    await user.click(screen.getByLabelText("Create new avatar"));

    await waitFor(() => {
      expect(screen.getByText("Create New Avatar")).toBeInTheDocument();
    });

    // Step 1: enter name
    await user.type(screen.getByPlaceholderText("Enter a name..."), "NewBot");
    await user.click(screen.getByRole("button", { name: /Next/i }));

    // Step 2: accept default role
    await waitFor(() => {
      expect(screen.getByText("Choose a Companion Role")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Next/i }));

    // Step 3: skip sprite
    await user.click(screen.getByText("Skip & Create"));

    await waitFor(() => {
      expect(mockCreateAvatar).toHaveBeenCalledWith(
        "NewBot",
        "p1",
        "gaming-companion",
        null,
        null,
      );
    });
  });

  it("shows error message when avatar creation fails with duplicate name", async () => {
    const user = userEvent.setup();
    mockCreateAvatar.mockRejectedValue({
      code: "VALIDATION_ERROR",
      message: "An avatar with that name already exists. Please choose a different name.",
    });

    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Create new avatar"));

    await waitFor(() => {
      expect(screen.getByText("Create New Avatar")).toBeInTheDocument();
    });

    // Go through wizard
    await user.type(screen.getByPlaceholderText("Enter a name..."), "Buddy");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => {
      expect(screen.getByText("Choose a Companion Role")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await user.click(screen.getByText("Skip & Create"));

    await waitFor(() => {
      expect(
        screen.getByText(
          "An avatar with that name already exists. Please choose a different name.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows loading state", () => {
    mockListAvatars.mockReturnValue(new Promise(() => {}));
    mockListPersonalities.mockReturnValue(new Promise(() => {}));
    mockListCompanionRoles.mockReturnValue(new Promise(() => {}));
    mockListSprites.mockReturnValue(new Promise(() => {}));

    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  // ── Delete Avatar Tests ──────────────────────────────────────────

  it("delete button hidden for active avatar when other avatars exist", async () => {
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    // Active avatar (Buddy) is selected by default — detail shows no delete button
    // because it's active and other avatars exist
    expect(screen.queryByTitle("Delete this avatar")).not.toBeInTheDocument();
  });

  it("delete button shown for last avatar (allows reset to first-run)", async () => {
    mockListAvatars.mockResolvedValue([
      makeAiAvatar("a1", { name: "Solo", personalityId: "p1", isActive: true }),
    ]);

    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Solo")).toBeInTheDocument();
    });

    expect(screen.getByTitle("Delete this avatar")).toBeInTheDocument();
  });

  it("last avatar delete confirmation warns about returning to setup wizard", async () => {
    const user = userEvent.setup();
    mockListAvatars.mockResolvedValue([
      makeAiAvatar("a1", { name: "Solo", personalityId: "p1", isActive: true }),
    ]);

    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Solo")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Delete this avatar"));

    expect(screen.getByText(/returned to the setup wizard/)).toBeInTheDocument();
  });

  it("deleting last avatar calls onAvatarDeleted callback", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    mockListAvatars.mockResolvedValue([
      makeAiAvatar("a1", { name: "Solo", personalityId: "p1", isActive: true }),
    ]);

    render(
      <AssistantAvatars
        activeAvatarId="a1"
        onAvatarSwitch={vi.fn()}
        onAvatarDeleted={onDeleted}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Solo")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Delete this avatar"));
    const confirmOverlay = screen
      .getByText(/All conversations, memories, and journal entries/)
      .closest(".avatar-item__confirm-overlay")!;
    const confirmBtn = confirmOverlay.querySelector(
      ".avatar-item__confirm-btn--danger",
    ) as HTMLElement;
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockDeleteAvatar).toHaveBeenCalledWith("a1");
      expect(onDeleted).toHaveBeenCalledWith("a1");
    });
  });

  it("clicking delete shows confirmation dialog", async () => {
    const user = userEvent.setup();
    // Use a non-active avatar to get a delete button (select Scholar)
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Scholar")).toBeInTheDocument();
    });

    // Select Scholar (non-active)
    await user.click(screen.getByLabelText("Select avatar Scholar"));

    await waitFor(() => {
      expect(screen.getByTitle("Delete this avatar")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Delete this avatar"));

    expect(
      screen.getByText(/All conversations, memories, and journal entries/),
    ).toBeInTheDocument();
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

    // Select Scholar (non-active)
    await user.click(screen.getByLabelText("Select avatar Scholar"));

    await waitFor(() => {
      expect(screen.getByTitle("Delete this avatar")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Delete this avatar"));
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
  });

  it("cancel dismisses delete confirmation", async () => {
    const user = userEvent.setup();
    // Select non-active avatar to see delete button
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Scholar")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Select avatar Scholar"));

    await waitFor(() => {
      expect(screen.getByTitle("Delete this avatar")).toBeInTheDocument();
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

  it("clear data button visible in detail panel", async () => {
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    expect(screen.getByTitle("Clear all data for this avatar")).toBeInTheDocument();
  });

  it("clicking clear data shows confirmation dialog", async () => {
    const user = userEvent.setup();
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Clear all data for this avatar"));

    expect(
      screen.getByText(/all memories, journal entries, and conversation history/),
    ).toBeInTheDocument();
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

    await user.click(screen.getByTitle("Clear all data for this avatar"));
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

    await user.click(screen.getByTitle("Clear all data for this avatar"));
    expect(
      screen.getByText(/all memories, journal entries, and conversation history/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByText(/all memories, journal entries, and conversation history/),
    ).not.toBeInTheDocument();
    expect(mockWipeAvatarData).not.toHaveBeenCalled();
  });

  // ── Detail Panel Feature Tests ───────────────────────────────────

  it("stats display shows memory and journal counts", async () => {
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("5 memories")).toBeInTheDocument();
      expect(screen.getByText("3 journals")).toBeInTheDocument();
    });
  });

  it("expression preview grid renders all 8 expressions", async () => {
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Neutral")).toBeInTheDocument();
      expect(screen.getByText("Speaking")).toBeInTheDocument();
      expect(screen.getByText("Listening")).toBeInTheDocument();
      expect(screen.getByText("Sleepy")).toBeInTheDocument();
      expect(screen.getByText("Happy")).toBeInTheDocument();
      expect(screen.getByText("Sad")).toBeInTheDocument();
      expect(screen.getByText("Interested")).toBeInTheDocument();
      expect(screen.getByText("Bored")).toBeInTheDocument();
    });
  });

  it("personality dropdown auto-saves on change", async () => {
    const user = userEvent.setup();
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    // Change personality dropdown
    const selects = screen.getAllByRole("combobox");
    const personalitySelect = selects.find((s) =>
      Array.from(s.querySelectorAll("option")).some((o) =>
        o.textContent?.includes("Friendly"),
      ),
    )!;
    await user.selectOptions(personalitySelect, "p2");

    await waitFor(() => {
      expect(mockUpdateAvatar).toHaveBeenCalledWith("a1", { personalityId: "p2" });
    });
  });

  it("inline name rename calls updateAvatar on blur", async () => {
    const user = userEvent.setup();
    render(<AssistantAvatars activeAvatarId="a1" onAvatarSwitch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Avatar name")).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText("Avatar name");
    await user.clear(nameInput);
    await user.type(nameInput, "NewName");
    await user.tab(); // blur

    await waitFor(() => {
      expect(mockUpdateAvatar).toHaveBeenCalledWith("a1", { name: "NewName" });
    });
  });
});
