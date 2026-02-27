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

  it("starts at the specified timeout value", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useInactivityTimer({ onTimeout, timeoutSeconds: 60 }),
    );

    expect(result.current.remaining).toBe(60);
    expect(result.current.isPaused).toBe(false);
  });

  it("counts down each second", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useInactivityTimer({ onTimeout, timeoutSeconds: 10 }),
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.remaining).toBe(7);
  });

  it("fires callback when reaching zero", () => {
    const onTimeout = vi.fn();
    renderHook(() => useInactivityTimer({ onTimeout, timeoutSeconds: 3 }));

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

  it("resetTimer resets remaining to timeout value", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useInactivityTimer({ onTimeout, timeoutSeconds: 60 }),
    );

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(result.current.remaining).toBe(50);

    act(() => {
      result.current.resetTimer();
    });

    expect(result.current.remaining).toBe(60);
  });
});
