import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInactivityTimer } from "./useInactivityTimer";

// Capture listen callbacks by event name
const listenCallbacks: Record<string, (event: unknown) => void> = {};

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((eventName: string, callback: (event: unknown) => void) => {
    listenCallbacks[eventName] = callback;
    return Promise.resolve(vi.fn());
  }),
}));

const mockStartConversationTimer = vi.fn().mockResolvedValue(undefined);
const mockGetConversationTimerState = vi.fn().mockResolvedValue(null);
const mockResetConversationTimer = vi.fn().mockResolvedValue(undefined);

vi.mock("../services/tauri", () => ({
  assistantApi: {
    startConversationTimer: (...args: unknown[]) => mockStartConversationTimer(...args),
    getConversationTimerState: (...args: unknown[]) =>
      mockGetConversationTimerState(...args),
    resetConversationTimer: (...args: unknown[]) => mockResetConversationTimer(...args),
  },
}));

describe("useInactivityTimer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(listenCallbacks).forEach((key) => delete listenCallbacks[key]);
    mockGetConversationTimerState.mockResolvedValue(null);
  });

  it("calls startConversationTimer on mount when conversationId and avatarId provided", () => {
    renderHook(() =>
      useInactivityTimer({
        conversationId: "conv-1",
        avatarId: "avatar-1",
      }),
    );

    expect(mockStartConversationTimer).toHaveBeenCalledWith("conv-1", "avatar-1");
  });

  it("calls getConversationTimerState on mount to sync initial state", () => {
    renderHook(() =>
      useInactivityTimer({
        conversationId: "conv-1",
        avatarId: "avatar-1",
      }),
    );

    expect(mockGetConversationTimerState).toHaveBeenCalled();
  });

  it("does not call startConversationTimer when conversationId is null", () => {
    renderHook(() =>
      useInactivityTimer({
        conversationId: null,
        avatarId: "avatar-1",
      }),
    );

    expect(mockStartConversationTimer).not.toHaveBeenCalled();
  });

  it("updates remaining and isPaused from conversation-timer-tick events", () => {
    const { result } = renderHook(() =>
      useInactivityTimer({
        conversationId: "conv-1",
        avatarId: "avatar-1",
      }),
    );

    act(() => {
      listenCallbacks["conversation-timer-tick"]?.({
        payload: { remainingSeconds: 1234, isPaused: true },
      });
    });

    expect(result.current.remaining).toBe(1234);
    expect(result.current.isPaused).toBe(true);
  });

  it("sets isActive to false on conversation-auto-ended matching conversationId", () => {
    const { result } = renderHook(() =>
      useInactivityTimer({
        conversationId: "conv-1",
        avatarId: "avatar-1",
      }),
    );

    // Should be active after mount with valid conversation
    expect(result.current.isActive).toBe(true);

    act(() => {
      listenCallbacks["conversation-auto-ended"]?.({
        payload: { conversationId: "conv-1" },
      });
    });

    expect(result.current.isActive).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it("ignores conversation-auto-ended for different conversationId", () => {
    const { result } = renderHook(() =>
      useInactivityTimer({
        conversationId: "conv-1",
        avatarId: "avatar-1",
      }),
    );

    act(() => {
      listenCallbacks["conversation-auto-ended"]?.({
        payload: { conversationId: "conv-other" },
      });
    });

    // Should still be active since the auto-ended was for a different conversation
    expect(result.current.isActive).toBe(true);
  });

  it("resetTimer calls resetConversationTimer API and sets remaining to 3600", () => {
    const { result } = renderHook(() =>
      useInactivityTimer({
        conversationId: "conv-1",
        avatarId: "avatar-1",
      }),
    );

    // Simulate some ticks reducing remaining
    act(() => {
      listenCallbacks["conversation-timer-tick"]?.({
        payload: { remainingSeconds: 500, isPaused: false },
      });
    });

    expect(result.current.remaining).toBe(500);

    act(() => {
      result.current.resetTimer();
    });

    expect(mockResetConversationTimer).toHaveBeenCalled();
    expect(result.current.remaining).toBe(3600);
    expect(result.current.isActive).toBe(true);
  });

  it("syncs initial state from getConversationTimerState when timer is already active", async () => {
    mockGetConversationTimerState.mockResolvedValue({
      remainingSeconds: 1800,
      isPaused: true,
    });

    const { result } = renderHook(() =>
      useInactivityTimer({
        conversationId: "conv-1",
        avatarId: "avatar-1",
      }),
    );

    await vi.waitFor(() => {
      expect(result.current.remaining).toBe(1800);
      expect(result.current.isPaused).toBe(true);
    });
  });

  it("does not call startConversationTimer when avatarId is null", () => {
    renderHook(() =>
      useInactivityTimer({
        conversationId: "conv-1",
        avatarId: null,
      }),
    );

    expect(mockStartConversationTimer).not.toHaveBeenCalled();
  });

  it("calls startConversationTimer again when conversationId changes", () => {
    const { rerender } = renderHook(
      ({
        conversationId,
        avatarId,
      }: {
        conversationId: string | null;
        avatarId: string | null;
      }) => useInactivityTimer({ conversationId, avatarId }),
      {
        initialProps: { conversationId: "conv-1", avatarId: "avatar-1" },
      },
    );

    expect(mockStartConversationTimer).toHaveBeenCalledWith("conv-1", "avatar-1");
    expect(mockStartConversationTimer).toHaveBeenCalledTimes(1);

    rerender({ conversationId: "conv-2", avatarId: "avatar-1" });

    expect(mockStartConversationTimer).toHaveBeenCalledWith("conv-2", "avatar-1");
    expect(mockStartConversationTimer).toHaveBeenCalledTimes(2);
  });
});
