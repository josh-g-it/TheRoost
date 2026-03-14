import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConversation } from "./useConversation";
import type { AiMessage } from "../types";

type EventCallback = (event: { payload: unknown }) => void;
let conversationEndedCallback:
  | ((event: { payload: { conversationId: string; reason: string } }) => void)
  | null = null;
const mockUnlisten = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((eventName: string, callback: EventCallback) => {
    if (eventName === "ai-conversation-ended") {
      conversationEndedCallback = callback as (event: {
        payload: { conversationId: string; reason: string };
      }) => void;
    }
    return Promise.resolve(mockUnlisten);
  }),
  emitTo: vi.fn(() => Promise.resolve()),
}));

const mockSendMessage = vi.fn();
const mockEndConversation = vi.fn();
const mockGetConversationHistory = vi.fn();
const mockValidateAndResolveAiActions = vi.fn();

vi.mock("../services/tauri", () => ({
  assistantApi: {
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    endConversation: (...args: unknown[]) => mockEndConversation(...args),
    getConversationHistory: (...args: unknown[]) => mockGetConversationHistory(...args),
    validateAndResolveAiActions: (...args: unknown[]) =>
      mockValidateAndResolveAiActions(...args),
  },
}));

describe("useConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conversationEndedCallback = null;
    // Default: sendMessage returns an empty response (like a greeting noop)
    mockSendMessage.mockResolvedValue("");
    mockEndConversation.mockResolvedValue(undefined);
    mockGetConversationHistory.mockResolvedValue([]);
    mockValidateAndResolveAiActions.mockResolvedValue({
      actions: [],
      rejectedCount: 0,
    });
  });

  it("starts with empty messages and not streaming", () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    expect(result.current.messages).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.currentStreamText).toBe("");
    expect(result.current.pendingActions).toEqual([]);
  });

  it("sendMessage calls API with correct params and adds user + assistant messages", async () => {
    mockSendMessage.mockResolvedValue("Hello! How can I help?");

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.sendMessage("Hello there");
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      "c1",
      "a1",
      "Hello there",
      undefined,
      undefined,
      undefined,
      "Page: Unknown",
      undefined,
    );
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].role).toBe("user");
    expect(result.current.messages[0].content).toBe("Hello there");
    expect(result.current.messages[1].role).toBe("assistant");
    expect(result.current.messages[1].content).toBe("Hello! How can I help?");
  });

  it("sets isStreaming during sendMessage and clears after", async () => {
    let resolveMsg: (v: string) => void;
    mockSendMessage.mockReturnValue(
      new Promise<string>((r) => {
        resolveMsg = r;
      }),
    );

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    act(() => {
      result.current.sendMessage("Hello");
    });

    expect(result.current.isStreaming).toBe(true);

    await act(async () => {
      resolveMsg!("Response");
    });

    expect(result.current.isStreaming).toBe(false);
  });

  it("sets error on API failure", async () => {
    mockSendMessage.mockRejectedValue({ message: "Network error" });

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.isStreaming).toBe(false);
  });

  it("endConversation calls API with correct params", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.endConversation();
    });

    expect(mockEndConversation).toHaveBeenCalledWith("c1", "a1");
  });

  it("loadHistory fetches and sets messages", async () => {
    const historyMessages = [
      {
        id: "m1",
        conversationId: "c1",
        role: "user" as const,
        content: "Hi",
        createdAt: "2026-02-27T12:00:00Z",
        tokenEstimate: 1,
      },
      {
        id: "m2",
        conversationId: "c1",
        role: "assistant" as const,
        content: "Hello!",
        createdAt: "2026-02-27T12:01:00Z",
        tokenEstimate: 2,
      },
    ];
    mockGetConversationHistory.mockResolvedValue(historyMessages);

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.loadHistory("c1");
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].content).toBe("Hi");
    expect(result.current.messages[1].content).toBe("Hello!");
  });

  it("retry re-sends the last user message", async () => {
    mockSendMessage.mockResolvedValue("First response");
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    expect(result.current.isStreaming).toBe(false);
    mockSendMessage.mockClear();
    mockSendMessage.mockResolvedValue("Retry response");

    await act(async () => {
      await result.current.retry();
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      "c1",
      "a1",
      "Hello",
      undefined,
      undefined,
      undefined,
      "Page: Unknown",
      undefined,
    );
  });

  it("guards sendMessage while streaming", async () => {
    mockSendMessage.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    // Fire first message — await lets listen() Promise resolve so the IPC
    // call starts and isStreamingRef is held true (never-resolving mock).
    await act(async () => {
      result.current.sendMessage("First");
    });

    expect(result.current.isStreaming).toBe(true);
    mockSendMessage.mockClear();

    await act(async () => {
      await result.current.sendMessage("Second");
    });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("guards retry while streaming", async () => {
    mockSendMessage.mockResolvedValueOnce("Response");
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    // Start a second message to enter streaming state
    mockSendMessage.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      result.current.sendMessage("Second");
    });

    expect(result.current.isStreaming).toBe(true);
    mockSendMessage.mockClear();

    await act(async () => {
      await result.current.retry();
    });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("adds assistant message from response and strips actions delimiter", async () => {
    mockSendMessage.mockResolvedValue(
      'Here are your RPGs sorted by most played!\n---ACTIONS---\n[{"actionId": "sort:playtime", "tier": 1}]',
    );

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.sendMessage("Show my RPGs");
    });

    expect(result.current.messages).toHaveLength(2);
    const assistantMsg = result.current.messages[1];
    expect(assistantMsg.content).toBe("Here are your RPGs sorted by most played!");
    expect(assistantMsg.content).not.toContain("ACTIONS");
    expect(assistantMsg.content).not.toContain("sort:playtime");
  });

  it("does not add assistant message for empty response (noop)", async () => {
    mockSendMessage.mockResolvedValue("");

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.sendMessage("Hello", { hidden: true });
    });

    // Hidden message + empty response = no messages added
    expect(result.current.messages).toHaveLength(0);
  });

  it("calls unlisten on unmount", async () => {
    const { unmount } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {});

    unmount();

    await act(async () => {});
    expect(mockUnlisten).toHaveBeenCalled();
  });

  // B10: Conversation-ended event sync
  it("sets isEnded and clears messages when ai-conversation-ended event matches", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {});

    const historyMessages = [
      {
        id: "m1",
        conversationId: "c1",
        role: "user" as const,
        content: "Hi",
        createdAt: "2026-02-27T12:00:00Z",
        tokenEstimate: 1,
      },
    ];
    mockGetConversationHistory.mockResolvedValue(historyMessages);
    await act(async () => {
      await result.current.loadHistory("c1");
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.isEnded).toBe(false);

    expect(conversationEndedCallback).not.toBeNull();
    act(() => {
      conversationEndedCallback!({ payload: { conversationId: "c1", reason: "manual" } });
    });

    expect(result.current.isEnded).toBe(true);
    expect(result.current.messages).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.currentStreamText).toBe("");
  });

  it("ignores ai-conversation-ended event with wrong conversationId", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {});

    const historyMessages = [
      {
        id: "m1",
        conversationId: "c1",
        role: "user" as const,
        content: "Hi",
        createdAt: "2026-02-27T12:00:00Z",
        tokenEstimate: 1,
      },
    ];
    mockGetConversationHistory.mockResolvedValue(historyMessages);
    await act(async () => {
      await result.current.loadHistory("c1");
    });

    expect(result.current.messages).toHaveLength(1);

    act(() => {
      conversationEndedCallback!({
        payload: { conversationId: "c-other", reason: "manual" },
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.isEnded).toBe(false);
  });

  it("sets isEnded to true when local endConversation succeeds", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {});

    await act(async () => {
      await result.current.endConversation();
    });

    expect(result.current.isEnded).toBe(true);
    expect(result.current.isCompacting).toBe(false);
  });

  // ── isCompacting tests ──────────────────────────────────────────

  it("isCompacting is false initially", () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );
    expect(result.current.isCompacting).toBe(false);
  });

  it("isCompacting is true during endConversation and false after", async () => {
    let resolveEnd: () => void;
    mockEndConversation.mockReturnValue(
      new Promise<void>((r) => {
        resolveEnd = r;
      }),
    );

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    act(() => {
      result.current.endConversation();
    });

    expect(result.current.isCompacting).toBe(true);

    await act(async () => {
      resolveEnd!();
    });

    expect(result.current.isCompacting).toBe(false);
    expect(result.current.isEnded).toBe(true);
  });

  it("isCompacting resets when conversationId changes", () => {
    const { result, rerender } = renderHook(
      ({ convId }) => useConversation({ avatarId: "a1", conversationId: convId }),
      { initialProps: { convId: "c1" as string | null } },
    );

    rerender({ convId: "c2" });
    expect(result.current.isCompacting).toBe(false);
  });

  it("isCompacting becomes false on endConversation error", async () => {
    mockEndConversation.mockRejectedValue({ message: "fail" });

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.endConversation();
    });

    expect(result.current.isCompacting).toBe(false);
  });

  it("isCompacting is included in the returned object", () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );
    expect("isCompacting" in result.current).toBe(true);
  });

  it("skips cross-window event during local endConversation, resets ref after", async () => {
    let resolveEnd: () => void;
    mockEndConversation.mockReturnValue(
      new Promise<void>((r) => {
        resolveEnd = r;
      }),
    );

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );
    await act(async () => {});

    act(() => {
      result.current.endConversation();
    });

    act(() => {
      conversationEndedCallback!({ payload: { conversationId: "c1", reason: "manual" } });
    });
    expect(result.current.isEnded).toBe(false);

    await act(async () => {
      resolveEnd!();
    });

    expect(result.current.isEnded).toBe(true);
  });

  it("sendMessage passes hidden=true to API when options.hidden is true", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.sendMessage("Hello", { hidden: true });
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      "c1",
      "a1",
      "Hello",
      true,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    // Hidden messages should not add a user message to local state
    expect(result.current.messages).toHaveLength(0);
  });

  it("sendMessage passes actionFeedback to API when provided", async () => {
    mockSendMessage.mockResolvedValue("Got it, sorting by name.");

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    const feedback = "[System] Previous actions:\n- sort:playtime → success";
    await act(async () => {
      await result.current.sendMessage("Sort by name instead", {
        actionFeedback: feedback,
      });
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      "c1",
      "a1",
      "Sort by name instead",
      undefined,
      feedback,
      undefined,
      "Page: Unknown",
      undefined,
    );
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].content).toBe("Sort by name instead");
    expect(result.current.messages[0].content).not.toContain("[System]");
  });

  it("sendMessage passes maxOutputTokens to API when provided", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1", maxOutputTokens: 4096 }),
    );

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      "c1",
      "a1",
      "Hello",
      undefined,
      undefined,
      4096,
      "Page: Unknown",
      undefined,
    );
  });

  // ── injectMessage tests ──────────────────────────────────────────

  it("injectMessage appends message to existing messages", async () => {
    mockSendMessage.mockResolvedValue("Hi there!");
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.sendMessage("Hello");
    });
    expect(result.current.messages).toHaveLength(2);

    act(() => {
      result.current.injectMessage({
        id: "injected-1",
        conversationId: "c1",
        role: "assistant",
        content: "Injected greeting",
        createdAt: new Date().toISOString(),
        tokenEstimate: 5,
      });
    });

    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[2].content).toBe("Injected greeting");
    expect(result.current.messages[2].role).toBe("assistant");
  });

  it("injectMessage does not affect streaming state", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    act(() => {
      result.current.injectMessage({
        id: "injected-1",
        conversationId: "c1",
        role: "assistant",
        content: "Hello!",
        createdAt: new Date().toISOString(),
        tokenEstimate: 2,
      });
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.messages).toHaveLength(1);
  });

  // ── Actions from response ──────────────────────────────────────

  it("extracts and validates actions from response", async () => {
    mockSendMessage.mockResolvedValue(
      'Sorting by playtime!\n---ACTIONS---\n[{"actionId": "sort:playtime", "tier": 1}]',
    );
    mockValidateAndResolveAiActions.mockResolvedValue({
      actions: [
        { actionId: "sort:playtime", originalActionId: "sort:playtime", tier: 1 },
      ],
      rejectedCount: 0,
    });

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.sendMessage("Sort by playtime");
    });

    // Wait for the IPC promise to resolve
    await act(async () => {});

    expect(mockValidateAndResolveAiActions).toHaveBeenCalledWith([
      { actionId: "sort:playtime", tier: 1 },
    ]);
  });

  it("sets pendingActions state after response with actions", async () => {
    const resolvedActions = [
      {
        actionId: "sort:playtime",
        originalActionId: "sort:playtime",
        tier: 1,
      },
    ];
    mockSendMessage.mockResolvedValue(
      'Sorting!\n---ACTIONS---\n[{"actionId": "sort:playtime", "tier": 1}]',
    );
    mockValidateAndResolveAiActions.mockResolvedValue({
      actions: resolvedActions,
      rejectedCount: 0,
    });

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.sendMessage("Sort");
    });

    // Wait for IPC resolution
    await act(async () => {});

    expect(result.current.pendingActions).toEqual(resolvedActions);
  });

  it("handles response with no delimiter (normal text-only behavior)", async () => {
    mockSendMessage.mockResolvedValue(
      "Based on your playtime, I'd recommend trying Elden Ring!",
    );

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.sendMessage("What should I play?");
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toBe(
      "Based on your playtime, I'd recommend trying Elden Ring!",
    );
    expect(mockValidateAndResolveAiActions).not.toHaveBeenCalled();
    expect(result.current.pendingActions).toEqual([]);
  });

  it("clearPendingActions resets to empty array", async () => {
    const resolvedActions = [
      {
        actionId: "nav:library",
        originalActionId: "nav:library",
        tier: 1,
      },
    ];
    mockSendMessage.mockResolvedValue(
      'Here you go!\n---ACTIONS---\n[{"actionId": "nav:library", "tier": 1}]',
    );
    mockValidateAndResolveAiActions.mockResolvedValue({
      actions: resolvedActions,
      rejectedCount: 0,
    });

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.sendMessage("Go to library");
    });
    await act(async () => {});

    expect(result.current.pendingActions).toEqual(resolvedActions);

    act(() => {
      result.current.clearPendingActions();
    });

    expect(result.current.pendingActions).toEqual([]);
  });

  // ── History load: action re-parsing ─────────────────────────────

  it("strips ---ACTIONS--- from loaded history messages for display", async () => {
    const historyWithActions = [
      {
        id: "m1",
        conversationId: "c1",
        role: "assistant" as const,
        content:
          'Here are your RPGs!\n---ACTIONS---\n[{"actionId":"sort:playtime","tier":1}]',
        createdAt: "2026-02-28T00:00:00Z",
        tokenEstimate: 10,
      },
    ];
    mockGetConversationHistory.mockResolvedValue(historyWithActions);

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    let loaded: AiMessage[] = [];
    await act(async () => {
      loaded = await result.current.loadHistory("c1");
    });

    expect(result.current.messages[0].content).toBe("Here are your RPGs!");
    expect(result.current.messages[0].content).not.toContain("ACTIONS");
    expect(loaded[0].content).toBe("Here are your RPGs!");
  });

  it("does not re-resolve actions from history (v1.12.1 auto-execute safety)", async () => {
    const historyWithActions = [
      {
        id: "m1",
        conversationId: "c1",
        role: "assistant" as const,
        content:
          'Here are your RPGs!\n---ACTIONS---\n[{"actionId":"sort:playtime","tier":1}]',
        createdAt: "2026-02-28T00:00:00Z",
        tokenEstimate: 10,
      },
    ];
    mockGetConversationHistory.mockResolvedValue(historyWithActions);

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.loadHistory("c1");
    });

    await act(async () => {});

    expect(mockValidateAndResolveAiActions).not.toHaveBeenCalled();
    expect(result.current.pendingActions).toEqual([]);
    expect(result.current.messages[0].content).toBe("Here are your RPGs!");
  });

  it("does not re-resolve actions if a user message follows the action message", async () => {
    const history = [
      {
        id: "m1",
        conversationId: "c1",
        role: "assistant" as const,
        content: 'Actions here\n---ACTIONS---\n[{"actionId":"sort:name","tier":1}]',
        createdAt: "2026-02-28T00:00:00Z",
        tokenEstimate: 10,
      },
      {
        id: "m2",
        conversationId: "c1",
        role: "user" as const,
        content: "Thanks!",
        createdAt: "2026-02-28T00:01:00Z",
        tokenEstimate: 2,
      },
    ];
    mockGetConversationHistory.mockResolvedValue(history);

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.loadHistory("c1");
    });

    await act(async () => {});

    expect(mockValidateAndResolveAiActions).not.toHaveBeenCalled();
    expect(result.current.pendingActions).toEqual([]);
    expect(result.current.messages[0].content).toBe("Actions here");
  });
});
