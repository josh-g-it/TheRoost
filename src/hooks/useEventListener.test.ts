import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEventListener } from "./useEventListener";

type EventCallback<T = unknown> = (event: { payload: T }) => void;

let mockUnlisten: Mock;
let mockListen: Mock;
let capturedCallbacks: Map<string, EventCallback>;
let resolvers: Map<string, (fn: () => void) => void>;

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  mockUnlisten = vi.fn();
  capturedCallbacks = new Map();
  resolvers = new Map();

  const { listen } = await import("@tauri-apps/api/event");
  mockListen = listen as Mock;

  // Default: auto-resolve immediately
  mockListen.mockImplementation((eventName: string, callback: EventCallback) => {
    capturedCallbacks.set(eventName, callback);
    return Promise.resolve(mockUnlisten);
  });
});

function fireEvent<T>(eventName: string, payload: T) {
  const cb = capturedCallbacks.get(eventName);
  if (cb) cb({ payload } as never);
}

/** Configure listen to return a manually-controlled promise */
function useDeferredListen() {
  mockListen.mockImplementation((eventName: string, callback: EventCallback) => {
    capturedCallbacks.set(eventName, callback);
    return new Promise<() => void>((resolve) => {
      resolvers.set(eventName, resolve);
    });
  });
}

describe("useEventListener", () => {
  it("calls listen with correct event name", async () => {
    renderHook(() => useEventListener("my-event", () => {}));
    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith("my-event", expect.any(Function));
    });
  });

  it("forwards events to handler", async () => {
    const handler = vi.fn();
    renderHook(() => useEventListener<string>("my-event", handler));
    await vi.waitFor(() => {
      expect(capturedCallbacks.has("my-event")).toBe(true);
    });

    act(() => fireEvent("my-event", "hello"));
    expect(handler).toHaveBeenCalledWith({ payload: "hello" });
  });

  it("calls unlisten on unmount", async () => {
    const { unmount } = renderHook(() => useEventListener("my-event", () => {}));
    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalled();
    });
    // Let promise resolve
    await act(async () => {});

    unmount();
    expect(mockUnlisten).toHaveBeenCalled();
  });

  it("handles unmount before listen resolves", async () => {
    useDeferredListen();
    const deferredUnlisten = vi.fn();

    const { unmount } = renderHook(() => useEventListener("my-event", () => {}));
    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalled();
    });

    // Unmount BEFORE resolving the listen promise
    unmount();

    // Now resolve — the hook should call fn() immediately since it's unmounted
    await act(async () => {
      resolvers.get("my-event")!(deferredUnlisten);
    });

    expect(deferredUnlisten).toHaveBeenCalled();
  });

  it("guards handler after unmount", async () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useEventListener<string>("my-event", handler));
    await vi.waitFor(() => {
      expect(capturedCallbacks.has("my-event")).toBe(true);
    });

    unmount();

    // Fire event after unmount — handler should NOT be called
    act(() => fireEvent("my-event", "late"));
    expect(handler).not.toHaveBeenCalled();
  });

  it("re-subscribes when deps change", async () => {
    const { rerender } = renderHook(
      ({ dep }) => useEventListener("my-event", () => {}, [dep]),
      { initialProps: { dep: "a" } },
    );
    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalledTimes(1);
    });
    // First listen resolved — unlisten should be stored
    await act(async () => {});

    rerender({ dep: "b" });
    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalledTimes(2);
    });
    // Old listener should have been cleaned up
    expect(mockUnlisten).toHaveBeenCalled();
  });

  it("does NOT re-subscribe when only handler changes", async () => {
    const { rerender } = renderHook(
      ({ handler }) => useEventListener("my-event", handler),
      { initialProps: { handler: vi.fn() } },
    );
    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalledTimes(1);
    });

    rerender({ handler: vi.fn() });
    // Should still be 1 — handler change alone doesn't re-subscribe
    expect(mockListen).toHaveBeenCalledTimes(1);
  });

  it("uses latest handler via ref", async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const { rerender } = renderHook(
      ({ handler }) => useEventListener<string>("my-event", handler),
      { initialProps: { handler: handler1 } },
    );
    await vi.waitFor(() => {
      expect(capturedCallbacks.has("my-event")).toBe(true);
    });

    // Update handler without re-subscribing
    rerender({ handler: handler2 });

    act(() => fireEvent("my-event", "test"));
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledWith({ payload: "test" });
  });

  it("does not call listen when enabled is false", () => {
    renderHook(() => useEventListener("my-event", () => {}, [], { enabled: false }));
    expect(mockListen).not.toHaveBeenCalled();
  });

  it("subscribes when enabled changes from false to true", async () => {
    const { rerender } = renderHook(
      ({ enabled }) => useEventListener("my-event", () => {}, [], { enabled }),
      { initialProps: { enabled: false } },
    );
    expect(mockListen).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalledTimes(1);
    });
  });

  it("unsubscribes when enabled changes from true to false", async () => {
    const { rerender } = renderHook(
      ({ enabled }) => useEventListener("my-event", () => {}, [], { enabled }),
      { initialProps: { enabled: true } },
    );
    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalledTimes(1);
    });
    await act(async () => {});

    rerender({ enabled: false });
    expect(mockUnlisten).toHaveBeenCalled();
  });
});
