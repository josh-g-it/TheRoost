import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConversation } from "./useConversation";
import type { AiMessage, StreamChunk } from "../types";

type EventCallback = (event: { payload: unknown }) => void;
let streamCallback: ((event: { payload: StreamChunk }) => void) | null = null;
let conversationEndedCallback:
  | ((event: { payload: { conversationId: string; reason: string } }) => void)
  | null = null;
const mockUnlisten = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((eventName: string, callback: EventCallback) => {
    if (eventName === "ai-stream-chunk") {
      streamCallback = callback as (event: { payload: StreamChunk }) => void;
    } else if (eventName === "ai-conversation-ended") {
      conversationEndedCallback = callback as (event: {
        payload: { conversationId: string; reason: string };
      }) => void;
    }
    return Promise.resolve(mockUnlisten);
  }),
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
    streamCallback = null;
    conversationEndedCallback = null;
    mockSendMessage.mockResolvedValue(undefined);
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

  it("sendMessage calls API with correct params and adds user message", async () => {
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
    );
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("user");
    expect(result.current.messages[0].content).toBe("Hello there");
  });

  it("sets isStreaming to true after sendMessage", async () => {
    mockSendMessage.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    act(() => {
      result.current.sendMessage("Hello");
    });

    expect(result.current.isStreaming).toBe(true);
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
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    // Wait for listen to register
    await act(async () => {});

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    // Complete the streaming cycle with a final chunk so isStreaming resets
    act(() => {
      streamCallback!({
        payload: { conversationId: "c1", text: "Response", isFinal: true },
      });
    });

    expect(result.current.isStreaming).toBe(false);
    mockSendMessage.mockClear();

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
    );
  });

  it("guards sendMessage while streaming", async () => {
    mockSendMessage.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    // Start first message (streaming starts)
    act(() => {
      result.current.sendMessage("First");
    });

    expect(result.current.isStreaming).toBe(true);
    mockSendMessage.mockClear();

    // Second call should be guarded
    await act(async () => {
      await result.current.sendMessage("Second");
    });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("guards retry while streaming", async () => {
    mockSendMessage.mockReturnValueOnce(Promise.resolve());
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    // Send initial message
    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    // Start a second message to enter streaming state
    mockSendMessage.mockReturnValue(new Promise(() => {}));
    act(() => {
      result.current.sendMessage("Second");
    });

    expect(result.current.isStreaming).toBe(true);
    mockSendMessage.mockClear();

    // Retry should be guarded
    await act(async () => {
      await result.current.retry();
    });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("accumulates streaming text from non-final chunks", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    // Wait for effect to register listen callback
    await act(async () => {});

    expect(streamCallback).not.toBeNull();

    // Send a message to start streaming
    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    // Fire non-final chunks (must be > 15 chars total to see emitted text due to parser buffering)
    act(() => {
      streamCallback!({
        payload: {
          conversationId: "c1",
          text: "Hello world, this is a streaming response. ",
          isFinal: false,
        },
      });
    });

    // Flush the 50ms debounce timer so buffered text is flushed to state
    act(() => {
      vi.advanceTimersByTime(50);
    });

    // Parser buffers last 15 chars, emits the rest
    expect(result.current.currentStreamText.length).toBeGreaterThan(0);
    expect(result.current.currentStreamText).toContain("Hello world");

    act(() => {
      streamCallback!({
        payload: {
          conversationId: "c1",
          text: "It continues with more text here.",
          isFinal: false,
        },
      });
    });

    // Flush debounce timer again
    act(() => {
      vi.advanceTimersByTime(50);
    });

    // More text accumulated
    expect(result.current.currentStreamText.length).toBeGreaterThan(
      "Hello world, this is a streaming response. ".length - 15,
    );

    vi.useRealTimers();
  });

  it("adds assistant message on final chunk and resets streaming", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {});

    // Send a message to start streaming
    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    expect(result.current.isStreaming).toBe(true);

    // Fire a non-final chunk
    act(() => {
      streamCallback!({ payload: { conversationId: "c1", text: "Hi ", isFinal: false } });
    });

    // Fire the final chunk
    act(() => {
      streamCallback!({
        payload: { conversationId: "c1", text: "there!", isFinal: true },
      });
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.currentStreamText).toBe("");
    // Messages should have: user message + assistant message
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].role).toBe("assistant");
    // Parser buffers short text but flushes on finalize — full content preserved
    expect(result.current.messages[1].content).toBe("Hi there!");
  });

  it("ignores chunks with wrong conversationId", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {});

    // Send a message to start streaming
    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    // Fire a chunk with wrong conversationId
    act(() => {
      streamCallback!({
        payload: { conversationId: "c-other", text: "Wrong!", isFinal: false },
      });
    });

    expect(result.current.currentStreamText).toBe("");
  });

  it("calls unlisten on unmount", async () => {
    const { unmount } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {});

    unmount();

    // The unlisten promise resolves to the mock fn, which then gets called
    await act(async () => {});
    expect(mockUnlisten).toHaveBeenCalled();
  });

  // B10: Conversation-ended event sync
  it("sets isEnded and clears messages when ai-conversation-ended event matches", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    // Wait for effects to register listen callbacks
    await act(async () => {});

    // Load some messages
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

    // Fire the conversation-ended event matching our conversationId
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

    // Wait for effects to register listen callbacks
    await act(async () => {});

    // Load some messages
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

    // Fire event with wrong conversationId
    act(() => {
      conversationEndedCallback!({
        payload: { conversationId: "c-other", reason: "manual" },
      });
    });

    // Messages should remain unchanged
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.isEnded).toBe(false);
  });

  it("sets isEnded to true when local endConversation succeeds", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    // Wait for effects to register listen callbacks
    await act(async () => {});

    // Call endConversation locally
    await act(async () => {
      await result.current.endConversation();
    });

    // isEnded should be true after successful compaction
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
    // Make endConversation hang so we can observe isCompacting=true
    let resolveEnd: () => void;
    mockEndConversation.mockReturnValue(
      new Promise<void>((r) => {
        resolveEnd = r;
      }),
    );

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    // Start end (don't await)
    act(() => {
      result.current.endConversation();
    });

    expect(result.current.isCompacting).toBe(true);

    // Resolve the backend call
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

    // Changing conversationId resets isCompacting (even if it was set)
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
    // Make endConversation hang so we can test mid-flight behavior
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

    // Start local end (don't await)
    act(() => {
      result.current.endConversation();
    });

    // Event arrives while compaction is in flight: should be skipped
    act(() => {
      conversationEndedCallback!({ payload: { conversationId: "c1", reason: "manual" } });
    });
    // isEnded is still false because event was skipped and endConversation hasn't resolved
    expect(result.current.isEnded).toBe(false);

    // Resolve the backend call
    await act(async () => {
      resolveEnd!();
    });

    // Now isEnded is true from the success path
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
    );
    // Hidden messages should not add a user message to local state
    expect(result.current.messages).toHaveLength(0);
  });

  it("sendMessage passes actionFeedback to API when provided", async () => {
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
    );
    // User message should show clean text, not the feedback
    expect(result.current.messages).toHaveLength(1);
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
    );
  });

  // ── injectMessage tests ──────────────────────────────────────────

  it("injectMessage appends message to existing messages", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    // Add a user message first
    await act(async () => {
      await result.current.sendMessage("Hello");
    });
    expect(result.current.messages).toHaveLength(1);

    // Inject an assistant message
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

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toBe("Injected greeting");
    expect(result.current.messages[1].role).toBe("assistant");
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

  // ── Delimiter safety strip ───────────────────────────────────────

  it("safety-strips ---ACTIONS--- delimiter from stored message content", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );
    await act(async () => {});
    await act(async () => {
      await result.current.sendMessage("Test");
    });

    // Simulate a final chunk where delimiter leaked through parser
    act(() => {
      streamCallback!({
        payload: {
          conversationId: "c1",
          text: "Some text---ACTIONS---leftover",
          isFinal: true,
        },
      });
    });

    const assistantMsg = result.current.messages[1];
    expect(assistantMsg.content).toBe("Some text");
    expect(assistantMsg.content).not.toContain("ACTIONS");
  });

  // ── Streaming with action parser (Phase 13a) ──────────────────────

  it("displays only text before delimiter during streaming", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );
    await act(async () => {});
    await act(async () => {
      await result.current.sendMessage("Show my RPGs");
    });

    // Stream text + delimiter + actions in final chunk
    act(() => {
      streamCallback!({
        payload: {
          conversationId: "c1",
          text: 'Here are your RPGs sorted by most played!\n---ACTIONS---\n[{"actionId": "sort:playtime", "tier": 1}]',
          isFinal: true,
        },
      });
    });

    // Assistant message should only contain display text
    expect(result.current.messages).toHaveLength(2);
    const assistantMsg = result.current.messages[1];
    expect(assistantMsg.content).toBe("Here are your RPGs sorted by most played!");
    expect(assistantMsg.content).not.toContain("ACTIONS");
    expect(assistantMsg.content).not.toContain("sort:playtime");
  });

  it("extracts actions on stream completion", async () => {
    mockValidateAndResolveAiActions.mockResolvedValue({
      actions: [
        { actionId: "sort:playtime", originalActionId: "sort:playtime", tier: 1 },
      ],
      rejectedCount: 0,
    });

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );
    await act(async () => {});
    await act(async () => {
      await result.current.sendMessage("Sort by playtime");
    });

    await act(async () => {
      streamCallback!({
        payload: {
          conversationId: "c1",
          text: 'Sorting by playtime!\n---ACTIONS---\n[{"actionId": "sort:playtime", "tier": 1}]',
          isFinal: true,
        },
      });
    });

    // Wait for the IPC promise to resolve
    await act(async () => {});

    expect(mockValidateAndResolveAiActions).toHaveBeenCalledWith([
      { actionId: "sort:playtime", tier: 1 },
    ]);
  });

  it("sets pendingActions state after stream finishes", async () => {
    const resolvedActions = [
      {
        actionId: "sort:playtime",
        originalActionId: "sort:playtime",
        tier: 1,
      },
    ];
    mockValidateAndResolveAiActions.mockResolvedValue({
      actions: resolvedActions,
      rejectedCount: 0,
    });

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );
    await act(async () => {});
    await act(async () => {
      await result.current.sendMessage("Sort");
    });

    await act(async () => {
      streamCallback!({
        payload: {
          conversationId: "c1",
          text: 'Sorting!\n---ACTIONS---\n[{"actionId": "sort:playtime", "tier": 1}]',
          isFinal: true,
        },
      });
    });

    // Wait for IPC resolution
    await act(async () => {});

    expect(result.current.pendingActions).toEqual(resolvedActions);
  });

  it("handles stream with no delimiter (normal text-only behavior)", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );
    await act(async () => {});
    await act(async () => {
      await result.current.sendMessage("What should I play?");
    });

    act(() => {
      streamCallback!({
        payload: {
          conversationId: "c1",
          text: "Based on your playtime, I'd recommend trying Elden Ring!",
          isFinal: true,
        },
      });
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toBe(
      "Based on your playtime, I'd recommend trying Elden Ring!",
    );
    // No IPC call should have been made
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
    mockValidateAndResolveAiActions.mockResolvedValue({
      actions: resolvedActions,
      rejectedCount: 0,
    });

    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );
    await act(async () => {});
    await act(async () => {
      await result.current.sendMessage("Go to library");
    });

    await act(async () => {
      streamCallback!({
        payload: {
          conversationId: "c1",
          text: 'Here you go!\n---ACTIONS---\n[{"actionId": "nav:library", "tier": 1}]',
          isFinal: true,
        },
      });
    });
    await act(async () => {});

    expect(result.current.pendingActions).toEqual(resolvedActions);

    act(() => {
      result.current.clearPendingActions();
    });

    expect(result.current.pendingActions).toEqual([]);
  });

  it("initializes parser state on stream start", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );
    await act(async () => {});
    await act(async () => {
      await result.current.sendMessage("Test");
    });

    // Stream some text — parser should be initialized
    act(() => {
      streamCallback!({
        payload: {
          conversationId: "c1",
          text: "This is a longer response that should partially display during streaming.",
          isFinal: false,
        },
      });
    });

    // Flush the 50ms debounce timer so buffered text is flushed to state
    act(() => {
      vi.advanceTimersByTime(50);
    });

    // Parser buffers last 15 chars, rest is displayed
    expect(result.current.currentStreamText.length).toBeGreaterThan(0);

    // Finalize the stream
    act(() => {
      streamCallback!({
        payload: { conversationId: "c1", text: "", isFinal: true },
      });
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages[1].content).toContain(
      "This is a longer response that should partially display during streaming.",
    );

    vi.useRealTimers();
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

    // Displayed message should have actions stripped
    expect(result.current.messages[0].content).toBe("Here are your RPGs!");
    expect(result.current.messages[0].content).not.toContain("ACTIONS");
    // Return value should also be stripped
    expect(loaded[0].content).toBe("Here are your RPGs!");
  });

  it("re-resolves actions from last assistant message on history load", async () => {
    const resolvedActions = [
      {
        actionId: "sort:playtime",
        originalActionId: "sort:playtime",
        tier: 1,
        description: "Sort by playtime",
      },
    ];
    mockValidateAndResolveAiActions.mockResolvedValue({
      actions: resolvedActions,
      rejectedCount: 0,
    });

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

    // Wait for the async validateAndResolveAiActions to complete
    await act(async () => {});

    expect(mockValidateAndResolveAiActions).toHaveBeenCalled();
    expect(result.current.pendingActions).toEqual(resolvedActions);
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

    // Should NOT re-resolve actions since user already replied
    expect(mockValidateAndResolveAiActions).not.toHaveBeenCalled();
    expect(result.current.pendingActions).toEqual([]);
    // But the message content should still be stripped for display
    expect(result.current.messages[0].content).toBe("Actions here");
  });
});
