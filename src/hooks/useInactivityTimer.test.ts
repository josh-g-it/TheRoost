import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInactivityTimer } from "./useInactivityTimer";

let listenCallback: ((event: { payload: { type: string } }) => void) | null = null;

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    (eventName: string, callback: (event: { payload: { type: string } }) => void) => {
      if (eventName === "session-update") {
        listenCallback = callback;
      }
      return Promise.resolve(vi.fn());
    },
  ),
}));

describe("useInactivityTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listenCallback = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts inactive and does not count down until resetTimer is called", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useInactivityTimer({ onTimeout, timeoutSeconds: 60 }),
    );

    expect(result.current.remaining).toBe(60);
    expect(result.current.isActive).toBe(false);

    // Timer should NOT count down while inactive
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.remaining).toBe(60);
  });

  it("counts down after resetTimer activates it", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useInactivityTimer({ onTimeout, timeoutSeconds: 10 }),
    );

    // Activate
    act(() => {
      result.current.resetTimer();
    });

    expect(result.current.isActive).toBe(true);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.remaining).toBe(7);
  });

  it("fires callback when reaching zero", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useInactivityTimer({ onTimeout, timeoutSeconds: 3 }),
    );

    // Activate timer first
    act(() => {
      result.current.resetTimer();
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("pauses on session-start event", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useInactivityTimer({ onTimeout, timeoutSeconds: 60 }),
    );

    // Activate and let it count down
    act(() => {
      result.current.resetTimer();
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.remaining).toBe(58);

    act(() => {
      listenCallback?.({ payload: { type: "started" } });
    });

    expect(result.current.isPaused).toBe(true);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.remaining).toBe(58);
  });

  it("resets and unpauses on session-end event", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useInactivityTimer({ onTimeout, timeoutSeconds: 60 }),
    );

    // Activate
    act(() => {
      result.current.resetTimer();
    });

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    act(() => {
      listenCallback?.({ payload: { type: "started" } });
    });

    act(() => {
      listenCallback?.({ payload: { type: "ended" } });
    });

    expect(result.current.isPaused).toBe(false);
    expect(result.current.remaining).toBe(60);
  });

  it("resetTimer resets remaining and activates the timer", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useInactivityTimer({ onTimeout, timeoutSeconds: 60 }),
    );

    // Activate and let some time pass
    act(() => {
      result.current.resetTimer();
    });

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(result.current.remaining).toBe(50);

    // Reset should restore to full timeout
    act(() => {
      result.current.resetTimer();
    });

    expect(result.current.remaining).toBe(60);
    expect(result.current.isActive).toBe(true);
  });

  it("does not fire timeout while inactive even after full duration", () => {
    const onTimeout = vi.fn();
    renderHook(() => useInactivityTimer({ onTimeout, timeoutSeconds: 3 }));

    // Never activate — advance well past the timeout
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(onTimeout).not.toHaveBeenCalled();
  });
});
