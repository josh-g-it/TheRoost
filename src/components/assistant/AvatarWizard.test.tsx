import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvatarWizard } from "./AvatarWizard";
import { makeAiAvatar, makeAiPersonality, makeSpriteInfo } from "../../test/factories";
import type { CompanionRolePreset } from "../../types";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

const mockCreateAvatar = vi.fn();
const mockSwitchAvatar = vi.fn();
const mockStartConversation = vi.fn();
const mockListCompanionRoles = vi.fn();
const mockListPersonalities = vi.fn();
const mockDeletePersonality = vi.fn();
const mockCreateCompanionRole = vi.fn();
const mockDeleteCompanionRole = vi.fn();
const mockReadSprite = vi.fn();

vi.mock("../../services/tauri", () => ({
  assistantApi: {
    createAvatar: (...args: unknown[]) => mockCreateAvatar(...args),
    switchAvatar: (...args: unknown[]) => mockSwitchAvatar(...args),
    startConversation: (...args: unknown[]) => mockStartConversation(...args),
    listCompanionRoles: (...args: unknown[]) => mockListCompanionRoles(...args),
    listPersonalities: (...args: unknown[]) => mockListPersonalities(...args),
    deletePersonality: (...args: unknown[]) => mockDeletePersonality(...args),
    createCompanionRole: (...args: unknown[]) => mockCreateCompanionRole(...args),
    deleteCompanionRole: (...args: unknown[]) => mockDeleteCompanionRole(...args),
  },
  spriteApi: {
    readSprite: (...args: unknown[]) => mockReadSprite(...args),
  },
}));

const mockSaveSettings = vi.fn();

vi.mock("../../store/settingsSlice", () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      settings: { iconSet: "classic", customStylePresets: [] },
      saveSettings: mockSaveSettings,
    }),
}));

const defaultPersonalities = [
  makeAiPersonality("p1", { name: "Warm" }),
  makeAiPersonality("p2", { name: "Witty", isBuiltin: false }),
];

const defaultRoles: CompanionRolePreset[] = [
  {
    id: "gaming-companion",
    name: "Gaming Companion",
    description: "A friendly gaming buddy",
    systemPromptText: "You are a gaming companion.",
    isBuiltin: true,
  },
  {
    id: "strategic-advisor",
    name: "Strategic Advisor",
    description: "Helps with strategy",
    systemPromptText: "You are a strategic advisor.",
    isBuiltin: true,
  },
];

describe("AvatarWizard", () => {
  const sprites = [
    makeSpriteInfo({ filename: "prebuilt-default.png", displayName: "Default" }),
    makeSpriteInfo({ filename: "prebuilt-pixel.png", displayName: "Pixel" }),
  ];
  const spriteDataUrls = new Map<string, string | null>([
    ["prebuilt-default.png", "data:image/png;base64,abc"],
    ["prebuilt-pixel.png", "data:image/png;base64,def"],
  ]);

  const defaultProps = {
    sprites,
    spriteDataUrls,
    onComplete: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockListPersonalities.mockResolvedValue(defaultPersonalities);
    mockListCompanionRoles.mockResolvedValue(defaultRoles);
    mockCreateAvatar.mockResolvedValue(makeAiAvatar("a1", { name: "TestBot" }));
    mockSwitchAvatar.mockResolvedValue(undefined);
    mockStartConversation.mockResolvedValue("conv-1");
    mockReadSprite.mockResolvedValue("data:image/png;base64,abc");
    mockSaveSettings.mockResolvedValue(undefined);
  });

  // ── Step 1: Name & Personality ────────────────────────────────────

  it("renders step 1 with name input and personality cards", async () => {
    render(<AvatarWizard {...defaultProps} />);

    expect(screen.getByText("Create New Avatar")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter a name...")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Personality")).toBeInTheDocument();

    // Wait for personalities to load
    await waitFor(() => {
      expect(screen.getByText("Warm")).toBeInTheDocument();
      expect(screen.getByText("Witty")).toBeInTheDocument();
    });
  });

  it("shows first-run title when isFirstRun is true", () => {
    render(<AvatarWizard {...defaultProps} isFirstRun />);

    expect(screen.getByText("Name Your Assistant")).toBeInTheDocument();
  });

  it("pre-fills name with 'Assistant' in first-run mode", () => {
    render(<AvatarWizard {...defaultProps} isFirstRun />);

    const input = screen.getByPlaceholderText("Enter a name...") as HTMLInputElement;
    expect(input.value).toBe("Assistant");
  });

  it("next button disabled when name is empty", () => {
    render(<AvatarWizard {...defaultProps} />);

    const nextBtn = screen.getByRole("button", { name: /Next/i });
    expect(nextBtn).toBeDisabled();
  });

  it("next button enabled after entering name", async () => {
    const user = userEvent.setup();
    render(<AvatarWizard {...defaultProps} />);

    // Wait for personalities to load (personalityId must be set)
    await waitFor(() => {
      expect(screen.getByText("Warm")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter a name..."), "MyBot");

    const nextBtn = screen.getByRole("button", { name: /Next/i });
    expect(nextBtn).not.toBeDisabled();
  });

  it("hides cancel button in first-run mode", () => {
    render(<AvatarWizard {...defaultProps} isFirstRun />);

    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("shows cancel button in normal mode", () => {
    render(<AvatarWizard {...defaultProps} />);

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("cancel calls onCancel", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<AvatarWizard {...defaultProps} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("personality cards show all personalities", async () => {
    render(<AvatarWizard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Warm")).toBeInTheDocument();
      expect(screen.getByText("Witty")).toBeInTheDocument();
    });
  });

  it("shows delete button only on custom personalities", async () => {
    render(<AvatarWizard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Witty")).toBeInTheDocument();
    });

    // Custom personality "Witty" should have a delete button
    expect(screen.getByLabelText("Delete Witty")).toBeInTheDocument();
    // Built-in personality "Warm" should not
    expect(screen.queryByLabelText("Delete Warm")).not.toBeInTheDocument();
  });

  // ── Step 2: Companion Role ────────────────────────────────────────

  it("navigates to step 2 on Next", async () => {
    const user = userEvent.setup();
    render(<AvatarWizard {...defaultProps} isFirstRun />);

    await user.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByText("Choose a Companion Role")).toBeInTheDocument();
    });
  });

  it("shows companion role cards from API", async () => {
    const user = userEvent.setup();
    render(<AvatarWizard {...defaultProps} isFirstRun />);

    await user.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByText("Gaming Companion")).toBeInTheDocument();
      expect(screen.getByText("Strategic Advisor")).toBeInTheDocument();
      expect(screen.getByText("Custom Role")).toBeInTheDocument();
    });
  });

  it("selecting custom role shows textarea", async () => {
    const user = userEvent.setup();
    render(<AvatarWizard {...defaultProps} isFirstRun />);

    await user.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByText("Custom Role")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Custom Role"));

    expect(
      screen.getByPlaceholderText("Describe what your avatar should focus on..."),
    ).toBeInTheDocument();
  });

  it("next disabled when custom role selected but text empty", async () => {
    const user = userEvent.setup();
    render(<AvatarWizard {...defaultProps} isFirstRun />);

    await user.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByText("Custom Role")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Custom Role"));

    const nextBtn = screen.getByRole("button", { name: /Next/i });
    expect(nextBtn).toBeDisabled();
  });

  it("next enabled when custom role text is provided", async () => {
    const user = userEvent.setup();
    render(<AvatarWizard {...defaultProps} isFirstRun />);

    await user.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByText("Custom Role")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Custom Role"));
    await user.type(
      screen.getByPlaceholderText("Describe what your avatar should focus on..."),
      "Help me with RPGs",
    );

    const nextBtn = screen.getByRole("button", { name: /Next/i });
    expect(nextBtn).not.toBeDisabled();
  });

  it("back button returns to step 1", async () => {
    const user = userEvent.setup();
    render(<AvatarWizard {...defaultProps} isFirstRun />);

    await user.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByText("Choose a Companion Role")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Back/i }));

    expect(screen.getByText("Name Your Assistant")).toBeInTheDocument();
  });

  // ── Step 3: Sprite Selection ──────────────────────────────────────

  it("navigates to step 3 and shows sprite grid", async () => {
    const user = userEvent.setup();
    render(<AvatarWizard {...defaultProps} isFirstRun />);

    // Step 1 → 2
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => {
      expect(screen.getByText("Choose a Companion Role")).toBeInTheDocument();
    });

    // Step 2 → 3
    await user.click(screen.getByRole("button", { name: /Next/i }));

    expect(screen.getByText("Choose a Sprite")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("Pixel")).toBeInTheDocument();
  });

  it("shows 'Skip & Create' when no sprite selected", async () => {
    const user = userEvent.setup();
    render(<AvatarWizard {...defaultProps} isFirstRun />);

    await user.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => {
      expect(screen.getByText("Choose a Companion Role")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Next/i }));

    expect(screen.getByText("Skip & Create")).toBeInTheDocument();
  });

  it("shows 'Create Avatar' when sprite selected", async () => {
    const user = userEvent.setup();
    render(<AvatarWizard {...defaultProps} isFirstRun />);

    await user.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => {
      expect(screen.getByText("Choose a Companion Role")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Next/i }));

    // Click a sprite
    await user.click(screen.getByTitle("Default"));

    expect(screen.getByText("Create Avatar")).toBeInTheDocument();
  });

  it("shows Generate New button on sprite step", async () => {
    const user = userEvent.setup();
    render(<AvatarWizard {...defaultProps} isFirstRun />);

    await user.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => {
      expect(screen.getByText("Choose a Companion Role")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Next/i }));

    expect(screen.getByText("Generate New")).toBeInTheDocument();
  });

  // ── Creation Flow ─────────────────────────────────────────────────

  it("creates avatar with all fields on submit", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<AvatarWizard {...defaultProps} onComplete={onComplete} isFirstRun />);

    // Step 1: name already "Assistant"
    await user.click(screen.getByRole("button", { name: /Next/i }));

    // Step 2: default role is gaming-companion
    await waitFor(() => {
      expect(screen.getByText("Choose a Companion Role")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Next/i }));

    // Step 3: select a sprite
    await user.click(screen.getByTitle("Default"));
    await user.click(screen.getByText("Create Avatar"));

    await waitFor(() => {
      expect(mockCreateAvatar).toHaveBeenCalledWith(
        "Assistant",
        "p1",
        "gaming-companion",
        null,
        "prebuilt-default.png",
      );
      expect(mockSwitchAvatar).toHaveBeenCalledWith("a1");
      expect(mockStartConversation).toHaveBeenCalledWith("a1");
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ id: "a1" }),
        "conv-1",
      );
    });
  });

  it("creates avatar without sprite when skipped", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<AvatarWizard {...defaultProps} onComplete={onComplete} isFirstRun />);

    // Step 1 → 2 → 3
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => {
      expect(screen.getByText("Choose a Companion Role")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Next/i }));

    // Skip sprite
    await user.click(screen.getByText("Skip & Create"));

    await waitFor(() => {
      expect(mockCreateAvatar).toHaveBeenCalledWith(
        "Assistant",
        "p1",
        "gaming-companion",
        null,
        null,
      );
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it("creates avatar with custom role", async () => {
    const user = userEvent.setup();
    render(<AvatarWizard {...defaultProps} onComplete={vi.fn()} isFirstRun />);

    // Step 1
    await user.click(screen.getByRole("button", { name: /Next/i }));

    // Step 2: select custom role
    await waitFor(() => {
      expect(screen.getByText("Custom Role")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Custom Role"));
    await user.type(
      screen.getByPlaceholderText("Describe what your avatar should focus on..."),
      "RPG expert",
    );
    await user.click(screen.getByRole("button", { name: /Next/i }));

    // Step 3: skip sprite
    await user.click(screen.getByText("Skip & Create"));

    await waitFor(() => {
      expect(mockCreateAvatar).toHaveBeenCalledWith(
        "Assistant",
        "p1",
        null,
        "RPG expert",
        null,
      );
    });
  });

  it("shows error and returns to sprite step on creation failure", async () => {
    const user = userEvent.setup();
    mockCreateAvatar.mockRejectedValue({ message: "Server error" });

    render(<AvatarWizard {...defaultProps} isFirstRun />);

    // Navigate to step 3
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => {
      expect(screen.getByText("Choose a Companion Role")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Next/i }));

    // Try to create
    await user.click(screen.getByText("Skip & Create"));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
      // Should be back on sprite step
      expect(screen.getByText("Choose a Sprite")).toBeInTheDocument();
    });
  });

  // ── Step indicator ────────────────────────────────────────────────

  it("renders 3 step dots", () => {
    render(<AvatarWizard {...defaultProps} />);

    const dots = document.querySelectorAll(".avatar-wizard__step-dot");
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveClass("avatar-wizard__step-dot--active");
    expect(dots[1]).not.toHaveClass("avatar-wizard__step-dot--active");
  });

  it("sprite deselects on second click (toggle)", async () => {
    const user = userEvent.setup();
    render(<AvatarWizard {...defaultProps} isFirstRun />);

    // Navigate to sprite step
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => {
      expect(screen.getByText("Choose a Companion Role")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Next/i }));

    // Select sprite
    await user.click(screen.getByTitle("Default"));
    expect(screen.getByText("Create Avatar")).toBeInTheDocument();

    // Deselect sprite
    await user.click(screen.getByTitle("Default"));
    expect(screen.getByText("Skip & Create")).toBeInTheDocument();
  });

  // ── Modal behavior ───────────────────────────────────────────────

  it("renders as a portal with overlay", () => {
    render(<AvatarWizard {...defaultProps} />);

    const overlay = document.querySelector(".avatar-wizard__overlay");
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveAttribute("role", "dialog");
    expect(overlay).toHaveAttribute("aria-modal", "true");
  });
});
