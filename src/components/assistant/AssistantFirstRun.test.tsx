import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantFirstRun } from "./AssistantFirstRun";
import { makeAiAvatar, makeAiPersonality, makeSpriteInfo } from "../../test/factories";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

const mockCheckEncryptionKeyExists = vi.fn();
const mockGenerateEncryptionKey = vi.fn();
const mockListPersonalities = vi.fn();
const mockCreateAvatar = vi.fn();
const mockSwitchAvatar = vi.fn();
const mockStartConversation = vi.fn();
const mockListCompanionRoles = vi.fn();
const mockListSprites = vi.fn();
const mockReadSprite = vi.fn();

vi.mock("../../services/tauri", () => ({
  assistantApi: {
    checkEncryptionKeyExists: (...args: unknown[]) =>
      mockCheckEncryptionKeyExists(...args),
    generateEncryptionKey: (...args: unknown[]) => mockGenerateEncryptionKey(...args),
    listPersonalities: (...args: unknown[]) => mockListPersonalities(...args),
    createAvatar: (...args: unknown[]) => mockCreateAvatar(...args),
    switchAvatar: (...args: unknown[]) => mockSwitchAvatar(...args),
    startConversation: (...args: unknown[]) => mockStartConversation(...args),
    listCompanionRoles: (...args: unknown[]) => mockListCompanionRoles(...args),
  },
  spriteApi: {
    listSprites: (...args: unknown[]) => mockListSprites(...args),
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

describe("AssistantFirstRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckEncryptionKeyExists.mockResolvedValue(true);
    mockGenerateEncryptionKey.mockResolvedValue(undefined);
    mockListPersonalities.mockResolvedValue([
      makeAiPersonality("p1", { name: "Friendly" }),
      makeAiPersonality("p2", { name: "Analytical" }),
    ]);
    mockListCompanionRoles.mockResolvedValue([
      {
        id: "gaming-companion",
        name: "Gaming Companion",
        description: "A friendly gaming buddy",
        systemPromptText: "You are a gaming companion.",
        isBuiltin: true,
      },
    ]);
    mockListSprites.mockResolvedValue([]);
    mockReadSprite.mockRejectedValue(new Error("not found"));
    mockCreateAvatar.mockResolvedValue(makeAiAvatar("a1"));
    mockSwitchAvatar.mockResolvedValue(undefined);
    mockStartConversation.mockResolvedValue("conv-1");
  });

  it("shows wizard after initialization", async () => {
    render(<AssistantFirstRun onComplete={vi.fn()} />);

    // First-run wizard shows "Name Your Assistant" title
    await waitFor(() => {
      expect(screen.getByText("Name Your Assistant")).toBeInTheDocument();
    });

    // Name field pre-filled with "Assistant"
    const input = screen.getByPlaceholderText("Enter a name...") as HTMLInputElement;
    expect(input.value).toBe("Assistant");
  });

  it("generates encryption key when none exists", async () => {
    mockCheckEncryptionKeyExists.mockResolvedValue(false);

    render(<AssistantFirstRun onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Name Your Assistant")).toBeInTheDocument();
    });

    expect(mockGenerateEncryptionKey).toHaveBeenCalledTimes(1);
  });

  it("does not generate encryption key when one already exists", async () => {
    mockCheckEncryptionKeyExists.mockResolvedValue(true);

    render(<AssistantFirstRun onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Name Your Assistant")).toBeInTheDocument();
    });

    expect(mockGenerateEncryptionKey).not.toHaveBeenCalled();
  });

  it("calls APIs in correct order through wizard flow", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();

    render(<AssistantFirstRun onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText("Name Your Assistant")).toBeInTheDocument();
    });

    // Step 1 → 2
    await user.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByText("Choose a Companion Role")).toBeInTheDocument();
    });

    // Step 2 → 3
    await user.click(screen.getByRole("button", { name: /Next/i }));

    // Step 3: skip sprite
    await user.click(screen.getByText("Skip & Create"));

    await waitFor(() => {
      expect(mockCreateAvatar).toHaveBeenCalledWith(
        "Assistant",
        "p1",
        "gaming-companion",
        null,
        null,
      );
      expect(mockSwitchAvatar).toHaveBeenCalledWith("a1");
      expect(mockStartConversation).toHaveBeenCalledWith("a1");
      expect(onComplete).toHaveBeenCalledWith("a1", "conv-1");
    });
  });

  it("shows error on setup failure", async () => {
    mockCheckEncryptionKeyExists.mockRejectedValue({
      message: "Credential Manager unavailable",
    });

    render(<AssistantFirstRun onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Setup Failed")).toBeInTheDocument();
      expect(screen.getByText("Credential Manager unavailable")).toBeInTheDocument();
    });
  });

  it("loads sprites during initialization", async () => {
    const sprite = makeSpriteInfo({
      filename: "prebuilt-default.png",
      displayName: "Default",
    });
    mockListSprites.mockResolvedValue([sprite]);
    mockReadSprite.mockResolvedValue("data:image/png;base64,abc");

    render(<AssistantFirstRun onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Name Your Assistant")).toBeInTheDocument();
    });

    expect(mockListSprites).toHaveBeenCalledTimes(1);
    expect(mockReadSprite).toHaveBeenCalledWith("prebuilt-default.png");
  });

  it("hides cancel button in first-run mode", async () => {
    render(<AssistantFirstRun onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Name Your Assistant")).toBeInTheDocument();
    });

    // First-run mode hides cancel
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });
});
