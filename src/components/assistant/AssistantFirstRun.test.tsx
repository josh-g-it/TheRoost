import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantFirstRun } from "./AssistantFirstRun";
import { makeAiPersonality, makeAiAvatar } from "../../test/factories";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

const mockCheckEncryptionKeyExists = vi.fn();
const mockGenerateEncryptionKey = vi.fn();
const mockListPersonalities = vi.fn();
const mockCreateAvatar = vi.fn();
const mockSwitchAvatar = vi.fn();
const mockStartConversation = vi.fn();

vi.mock("../../services/tauri", () => ({
  assistantApi: {
    checkEncryptionKeyExists: (...args: unknown[]) =>
      mockCheckEncryptionKeyExists(...args),
    generateEncryptionKey: (...args: unknown[]) => mockGenerateEncryptionKey(...args),
    listPersonalities: (...args: unknown[]) => mockListPersonalities(...args),
    createAvatar: (...args: unknown[]) => mockCreateAvatar(...args),
    switchAvatar: (...args: unknown[]) => mockSwitchAvatar(...args),
    startConversation: (...args: unknown[]) => mockStartConversation(...args),
  },
}));

vi.mock("../../store/settingsSlice", () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ settings: { iconSet: "classic" } }),
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
    mockCreateAvatar.mockResolvedValue(makeAiAvatar("a1"));
    mockSwitchAvatar.mockResolvedValue(undefined);
    mockStartConversation.mockResolvedValue("conv-1");
  });

  it("shows setup flow after initialization", async () => {
    render(<AssistantFirstRun onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Create Your Assistant")).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText("Assistant")).toBeInTheDocument();
    expect(screen.getByText("Get Started")).toBeInTheDocument();
  });

  it("generates encryption key when none exists", async () => {
    mockCheckEncryptionKeyExists.mockResolvedValue(false);

    render(<AssistantFirstRun onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Create Your Assistant")).toBeInTheDocument();
    });

    expect(mockGenerateEncryptionKey).toHaveBeenCalledTimes(1);
  });

  it("does not generate encryption key when one already exists", async () => {
    mockCheckEncryptionKeyExists.mockResolvedValue(true);

    render(<AssistantFirstRun onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Create Your Assistant")).toBeInTheDocument();
    });

    expect(mockGenerateEncryptionKey).not.toHaveBeenCalled();
  });

  it("calls APIs in correct order on submit", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();

    render(<AssistantFirstRun onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText("Create Your Assistant")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Get Started"));

    await waitFor(() => {
      expect(mockCreateAvatar).toHaveBeenCalledWith("Assistant", "p1");
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

  it("populates personality dropdown from API", async () => {
    render(<AssistantFirstRun onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Create Your Assistant")).toBeInTheDocument();
    });

    const select = screen.getByRole("combobox");
    const options = select.querySelectorAll("option");
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toBe("Friendly");
    expect(options[1].textContent).toBe("Analytical");
  });
});
