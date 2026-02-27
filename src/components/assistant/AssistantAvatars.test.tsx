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

vi.mock("../../services/tauri", () => ({
  assistantApi: {
    listAvatars: (...args: unknown[]) => mockListAvatars(...args),
    listPersonalities: (...args: unknown[]) => mockListPersonalities(...args),
    switchAvatar: (...args: unknown[]) => mockSwitchAvatar(...args),
    createAvatar: (...args: unknown[]) => mockCreateAvatar(...args),
    createPersonality: (...args: unknown[]) => mockCreatePersonality(...args),
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
});
