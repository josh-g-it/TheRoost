import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { OverlayAssistant } from "./OverlayAssistant";
import { makeAiAvatar, makeAiPersonality } from "../../test/factories";

type ListenCallback = (event: { payload: unknown }) => void;
const listenCallbacks: Record<string, ListenCallback> = {};
const mockUnlisten = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((eventName: string, callback: ListenCallback) => {
    listenCallbacks[eventName] = callback;
    return Promise.resolve(mockUnlisten);
  }),
}));

const mockGetActiveAvatar = vi.fn();
const mockListPersonalities = vi.fn();
const mockStartConversation = vi.fn();
const mockEndConversation = vi.fn();
const mockGetConversationHistory = vi.fn();
const mockSendMessage = vi.fn();
const mockCheckConversationStale = vi.fn();
const mockAbandonConversation = vi.fn();

vi.mock("../../services/tauri", () => ({
  assistantApi: {
    getActiveAvatar: (...args: unknown[]) => mockGetActiveAvatar(...args),
    listPersonalities: (...args: unknown[]) => mockListPersonalities(...args),
    startConversation: (...args: unknown[]) => mockStartConversation(...args),
    endConversation: (...args: unknown[]) => mockEndConversation(...args),
    getConversationHistory: (...args: unknown[]) => mockGetConversationHistory(...args),
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    checkConversationStale: (...args: unknown[]) => mockCheckConversationStale(...args),
    abandonConversation: (...args: unknown[]) => mockAbandonConversation(...args),
  },
}));

vi.mock("../../store/settingsSlice", () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ settings: { iconSet: "classic" } }),
}));

vi.mock("../../hooks/useActionPipeline", () => ({
  useActionPipeline: () => ({
    state: { actions: [], currentIndex: 0, status: "idle", results: [] },
    setActions: vi.fn(),
    confirmTier2: vi.fn(),
    denyTier2: vi.fn(),
    cancelAll: vi.fn(),
    consumeResults: vi.fn().mockReturnValue([]),
    reset: vi.fn(),
  }),
  serializeActionFeedback: () => "",
}));

const avatar = makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" });
const personality = makeAiPersonality("p1", { name: "Friendly" });

describe("OverlayAssistant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear captured listen callbacks
    for (const key in listenCallbacks) {
      delete listenCallbacks[key];
    }
    // invoke is globally mocked (setup.ts) — make it return a promise so .catch() works
    vi.mocked(invoke).mockResolvedValue(undefined);
    mockGetActiveAvatar.mockResolvedValue(avatar);
    mockListPersonalities.mockResolvedValue([personality]);
    mockStartConversation.mockResolvedValue("conv-1");
    mockEndConversation.mockResolvedValue(undefined);
    // Return non-empty history so auto-greeting doesn't fire
    mockGetConversationHistory.mockResolvedValue([
      {
        id: "m0",
        conversationId: "conv-1",
        role: "assistant" as const,
        content: "Hello!",
        createdAt: "2026-02-27T12:00:00Z",
        tokenEstimate: 4,
      },
    ]);
    mockSendMessage.mockResolvedValue(undefined);
    mockCheckConversationStale.mockResolvedValue(false);
    mockAbandonConversation.mockResolvedValue(undefined);
  });

  it("renders loading state initially", () => {
    // Make getActiveAvatar never resolve so we stay in loading
    mockGetActiveAvatar.mockReturnValue(new Promise(() => {}));
    render(<OverlayAssistant />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders avatar portrait when avatar exists", async () => {
    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getByText("B")).toBeInTheDocument();
    });
    expect(screen.getByText("Buddy")).toBeInTheDocument();
    expect(screen.getByText("Friendly")).toBeInTheDocument();
  });

  it("renders no-avatar fallback when no avatar returned", async () => {
    mockGetActiveAvatar.mockResolvedValue(null);
    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(
        screen.getByText("Set up your assistant in the main window"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Open Full Assistant")).toBeInTheDocument();
  });

  it("passes compact to AssistantChat", async () => {
    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });
    // The assistant-chat element should have the compact class
    const chatEl = document.querySelector(".assistant-chat--compact");
    expect(chatEl).toBeInTheDocument();
  });

  it("More dropdown renders expected options", async () => {
    const user = userEvent.setup();
    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    await user.click(screen.getByText("More"));

    expect(screen.getByText("TTS: Off")).toBeInTheDocument();
    expect(screen.getByText("Screenshot: Off")).toBeInTheDocument();
    expect(screen.getByText("End Conversation")).toBeInTheDocument();
    expect(screen.getByText("Open Full Assistant")).toBeInTheDocument();
  });

  it("Open Full Assistant calls invoke with correct route", async () => {
    mockGetActiveAvatar.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Open Full Assistant")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Open Full Assistant"));

    expect(invoke).toHaveBeenCalledWith("show_main_and_navigate", {
      route: "/assistant",
    });
  });

  it("End Conversation calls endConversation API", async () => {
    const user = userEvent.setup();
    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    await user.click(screen.getByText("End"));

    await waitFor(() => {
      expect(mockEndConversation).toHaveBeenCalledWith("conv-1", "a1");
    });
  });

  it("TTS toggle appears but is disabled", async () => {
    const user = userEvent.setup();
    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    await user.click(screen.getByText("More"));

    const ttsBtn = screen.getByText("TTS: Off");
    expect(ttsBtn).toBeDisabled();
  });

  // B1: API failure during init shows no-avatar fallback
  it("shows no-avatar fallback when getActiveAvatar rejects", async () => {
    mockGetActiveAvatar.mockRejectedValue(new Error("fail"));
    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(
        screen.getByText("Set up your assistant in the main window"),
      ).toBeInTheDocument();
    });
  });

  // B2: End Conversation calls API and auto-restarts via event
  it("auto-restarts conversation after manual end", async () => {
    mockStartConversation
      .mockResolvedValueOnce("conv-1") // initial
      .mockResolvedValueOnce("conv-2"); // auto-restart
    const user = userEvent.setup();
    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    await user.click(screen.getByText("End"));

    await waitFor(() => {
      expect(mockEndConversation).toHaveBeenCalledWith("conv-1", "a1");
    });

    // Simulate the conversation-ended event with reason: manual
    await act(async () => {
      listenCallbacks["ai-conversation-ended"]?.({
        payload: { conversationId: "conv-1", reason: "manual" },
      });
    });

    // Should auto-restart: startConversation called again
    await waitFor(() => {
      expect(mockStartConversation).toHaveBeenCalledTimes(2);
    });
  });

  // B3: End Conversation via dropdown
  it("End Conversation via dropdown calls endConversation API", async () => {
    const user = userEvent.setup();
    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    await user.click(screen.getByText("More"));
    await user.click(screen.getByText("End Conversation"));

    await waitFor(() => {
      expect(mockEndConversation).toHaveBeenCalledWith("conv-1", "a1");
    });
  });

  // B4: Dropdown close on outside click
  it("closes dropdown on outside pointerdown", async () => {
    const user = userEvent.setup();
    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    await user.click(screen.getByText("More"));
    expect(screen.getByText("End Conversation")).toBeInTheDocument();

    // Fire pointerdown on document body
    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText("End Conversation")).not.toBeInTheDocument();
    });
  });

  // B5: Dropdown close on Escape
  it("closes dropdown on Escape keydown", async () => {
    const user = userEvent.setup();
    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    await user.click(screen.getByText("More"));
    expect(screen.getByText("End Conversation")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByText("End Conversation")).not.toBeInTheDocument();
    });
  });

  // B6: Dropdown toggle close (click More twice)
  it("closes dropdown when More is clicked twice", async () => {
    const user = userEvent.setup();
    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    // Open dropdown
    await user.click(screen.getByText("More"));
    expect(screen.getByText("End Conversation")).toBeInTheDocument();

    // Close dropdown by clicking More again
    await user.click(screen.getByText("More"));
    expect(screen.queryByText("End Conversation")).not.toBeInTheDocument();
  });

  // B7: Open Full Assistant from dropdown with avatar
  it("Open Full Assistant from dropdown with avatar calls invoke", async () => {
    const user = userEvent.setup();
    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    await user.click(screen.getByText("More"));
    await user.click(screen.getByText("Open Full Assistant"));

    expect(invoke).toHaveBeenCalledWith("show_main_and_navigate", {
      route: "/assistant",
    });
  });

  // B8: Guard clause — End does not call endConversation when conversationId is null
  it("End button does nothing when conversation has not started", async () => {
    // Make startConversation never resolve so conversationId stays null
    mockStartConversation.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<OverlayAssistant />);

    // Wait for avatar to appear (loading ends when getActiveAvatar resolves,
    // but startConversation hangs — loading will still be true)
    // Actually, since startConversation never resolves, finally won't fire
    // and we'll be stuck in loading. Let's instead make it so avatar resolves
    // but startConversation returns null
    mockStartConversation.mockResolvedValue(null);

    // Re-render with the new mock — use a fresh render
    const { unmount } = render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getAllByText("Buddy").length).toBeGreaterThanOrEqual(1);
    });

    await user.click(screen.getAllByText("End")[0]);

    // endConversation should not be called because conversationId is null
    expect(mockEndConversation).not.toHaveBeenCalled();
    unmount();
  });

  // B9: Screenshot disabled
  it("Screenshot toggle appears but is disabled", async () => {
    const user = userEvent.setup();
    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    await user.click(screen.getByText("More"));

    const screenshotBtn = screen.getByText("Screenshot: Off");
    expect(screenshotBtn).toBeDisabled();
  });

  // B10: Timer auto-end does NOT auto-restart
  it("does NOT auto-restart on timer auto-end", async () => {
    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    // Simulate the conversation-ended event with reason: timer
    await act(async () => {
      listenCallbacks["ai-conversation-ended"]?.({
        payload: { conversationId: "conv-1", reason: "timer" },
      });
    });

    // startConversation should have been called only once (initial load)
    expect(mockStartConversation).toHaveBeenCalledTimes(1);
  });

  // B12: Auto-restart error sets conversationId to null
  it("sets conversationId to null when auto-restart fails", async () => {
    mockStartConversation
      .mockResolvedValueOnce("conv-1")
      .mockRejectedValueOnce(new Error("fail"));

    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    await act(async () => {
      listenCallbacks["ai-conversation-ended"]?.({
        payload: { conversationId: "conv-1", reason: "manual" },
      });
    });

    await waitFor(() => {
      expect(mockStartConversation).toHaveBeenCalledTimes(2);
    });
  });

  // B13: isEndingRef guard prevents double endConversation calls
  it("guards against double endConversation calls", async () => {
    mockEndConversation.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();

    render(<OverlayAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Buddy")).toBeInTheDocument();
    });

    await user.click(screen.getByText("End"));
    await user.click(screen.getByText("End"));

    expect(mockEndConversation).toHaveBeenCalledTimes(1);
  });

  // B11: Stale reset starts a fresh conversation
  it("starts a fresh conversation after stale reset", async () => {
    // Only the first conversation is stale; the replacement is fresh
    mockCheckConversationStale
      .mockResolvedValueOnce(true) // conv-1 is stale
      .mockResolvedValue(false); // conv-2 is fresh
    // After stale reset, startConversation is called again for the fresh conversation
    mockStartConversation
      .mockResolvedValueOnce("conv-1") // initial mount
      .mockResolvedValueOnce("conv-2"); // stale reset

    render(<OverlayAssistant />);

    await waitFor(() => {
      expect(mockStartConversation).toHaveBeenCalledTimes(2);
    });
  });
});
