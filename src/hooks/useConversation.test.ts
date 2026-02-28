import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConversation } from "./useConversation";
import type { StreamChunk } from "../types";

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

vi.mock("../services/tauri", () => ({
  assistantApi: {
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    endConversation: (...args: unknown[]) => mockEndConversation(...args),
    getConversationHistory: (...args: unknown[]) => mockGetConversationHistory(...args),
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
  });

  it("starts with empty messages and not streaming", () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    expect(result.current.messages).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.currentStreamText).toBe("");
  });

  it("sendMessage calls API with correct params and adds user message", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.sendMessage("Hello there");
    });

    expect(mockSendMessage).toHaveBeenCalledWith("c1", "a1", "Hello there", undefined);
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

    expect(mockSendMessage).toHaveBeenCalledWith("c1", "a1", "Hello", undefined);
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

    // Fire non-final chunks
    act(() => {
      streamCallback!({
        payload: { conversationId: "c1", text: "Hello ", isFinal: false },
      });
    });

    expect(result.current.currentStreamText).toBe("Hello ");

    act(() => {
      streamCallback!({
        payload: { conversationId: "c1", text: "world", isFinal: false },
      });
    });

    expect(result.current.currentStreamText).toBe("Hello world");
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

  it("does not trigger isEnded when local endConversation is called", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    // Wait for effects to register listen callbacks
    await act(async () => {});

    // Call endConversation locally — this sets isLocalEndRef to true
    await act(async () => {
      await result.current.endConversation();
    });

    // Simulate the event arriving (as it would from the backend)
    act(() => {
      conversationEndedCallback!({ payload: { conversationId: "c1", reason: "manual" } });
    });

    // isEnded should be false because we triggered the end locally
    expect(result.current.isEnded).toBe(false);
  });

  // ── isCompacting tests ──────────────────────────────────────────

  it("isCompacting is false initially", () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );
    expect(result.current.isCompacting).toBe(false);
  });

  it("isCompacting becomes true when endConversation is called", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.endConversation();
    });

    expect(result.current.isCompacting).toBe(true);
  });

  it("isCompacting becomes false when conversationId changes", async () => {
    const { result, rerender } = renderHook(
      ({ convId }) => useConversation({ avatarId: "a1", conversationId: convId }),
      { initialProps: { convId: "c1" as string | null } },
    );

    await act(async () => {
      await result.current.endConversation();
    });
    expect(result.current.isCompacting).toBe(true);

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

  it("resets isLocalEndRef after skipping one event, allowing the next event through", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {});

    // Local end sets isLocalEndRef = true
    await act(async () => {
      await result.current.endConversation();
    });

    // First event: skipped (local end)
    act(() => {
      conversationEndedCallback!({ payload: { conversationId: "c1", reason: "manual" } });
    });
    expect(result.current.isEnded).toBe(false);

    // Second event: should NOT be skipped -- ref was reset
    act(() => {
      conversationEndedCallback!({ payload: { conversationId: "c1", reason: "manual" } });
    });
    expect(result.current.isEnded).toBe(true);
    expect(result.current.messages).toEqual([]);
  });

  it("sendMessage passes hidden=true to API when options.hidden is true", async () => {
    const { result } = renderHook(() =>
      useConversation({ avatarId: "a1", conversationId: "c1" }),
    );

    await act(async () => {
      await result.current.sendMessage("Hello", { hidden: true });
    });

    expect(mockSendMessage).toHaveBeenCalledWith("c1", "a1", "Hello", true);
    // Hidden messages should not add a user message to local state
    expect(result.current.messages).toHaveLength(0);
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
});
