import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useExpressionEngine, AI_EXPRESSIONS } from "./useExpressionEngine";

describe("useExpressionEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at neutral", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    expect(result.current.expression).toBe("neutral");
  });

  it("transitions to speaking on stream start", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onStreamStart());
    expect(result.current.expression).toBe("speaking");
  });

  it("transitions to listening on user typing (when not streaming)", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onUserTyping());
    expect(result.current.expression).toBe("listening");
  });

  it("speaking overrides listening", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onStreamStart());
    act(() => result.current.onUserTyping());
    expect(result.current.expression).toBe("speaking");
  });

  it("applies T0 expression on stream end", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onStreamStart());
    act(() => result.current.onStreamEnd("happy"));
    expect(result.current.expression).toBe("happy");
  });

  it("falls back to neutral on stream end without T0", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onStreamStart());
    act(() => result.current.onStreamEnd());
    expect(result.current.expression).toBe("neutral");
  });

  it("falls back to neutral on stream end with undefined T0", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onStreamStart());
    act(() => result.current.onStreamEnd(undefined));
    expect(result.current.expression).toBe("neutral");
  });

  it("returns to neutral after 30s idle", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onStreamStart());
    act(() => result.current.onStreamEnd("sad"));
    expect(result.current.expression).toBe("sad");

    act(() => vi.advanceTimersByTime(29_999));
    expect(result.current.expression).toBe("sad");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.expression).toBe("neutral");
  });

  it("returns to neutral after 500ms typing debounce", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onUserTyping());
    expect(result.current.expression).toBe("listening");

    act(() => vi.advanceTimersByTime(499));
    expect(result.current.expression).toBe("listening");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.expression).toBe("neutral");
  });

  it("resets typing debounce on continued typing", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onUserTyping());
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.onUserTyping());
    act(() => vi.advanceTimersByTime(300));
    // Should still be listening (debounce was reset)
    expect(result.current.expression).toBe("listening");

    act(() => vi.advanceTimersByTime(200));
    expect(result.current.expression).toBe("neutral");
  });

  it("resets to neutral on avatar switch", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onStreamStart());
    act(() => result.current.onStreamEnd("interested"));
    expect(result.current.expression).toBe("interested");

    act(() => result.current.onAvatarSwitched());
    expect(result.current.expression).toBe("neutral");
  });

  it("clears idle timer on avatar switch", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onStreamStart());
    act(() => result.current.onStreamEnd("happy"));
    act(() => result.current.onAvatarSwitched());

    // Advancing past idle timeout should NOT change expression
    act(() => vi.advanceTimersByTime(31_000));
    expect(result.current.expression).toBe("neutral");
  });

  it("uses last T0 expression when multiple stream ends occur", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onStreamStart());
    act(() => result.current.onStreamEnd("happy"));
    expect(result.current.expression).toBe("happy");

    act(() => result.current.onStreamStart());
    act(() => result.current.onStreamEnd("bored"));
    expect(result.current.expression).toBe("bored");
  });

  it("always returns neutral when avatarHasSprite is false", () => {
    const { result } = renderHook(() => useExpressionEngine(false));
    expect(result.current.expression).toBe("neutral");

    act(() => result.current.onStreamStart());
    expect(result.current.expression).toBe("neutral");

    act(() => result.current.onStreamEnd("happy"));
    expect(result.current.expression).toBe("neutral");

    act(() => result.current.onUserTyping());
    expect(result.current.expression).toBe("neutral");
  });

  it("ignores invalid T0 expression names", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onStreamStart());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    act(() => result.current.onStreamEnd("speaking" as any));
    // "speaking" is not an AI expression, should fall to neutral
    expect(result.current.expression).toBe("neutral");
  });

  it("resets to neutral on user sent message (when not streaming)", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onStreamStart());
    act(() => result.current.onStreamEnd("happy"));
    expect(result.current.expression).toBe("happy");

    act(() => result.current.onUserSentMessage());
    expect(result.current.expression).toBe("neutral");
  });

  it("does not override speaking on user sent message", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onStreamStart());
    act(() => result.current.onUserSentMessage());
    expect(result.current.expression).toBe("speaking");
  });

  it("transitions to listening after stream ends if user is typing", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onStreamStart());
    // User types while streaming — speaking wins
    act(() => result.current.onUserTyping());
    expect(result.current.expression).toBe("speaking");

    // Stream ends without T0 — goes neutral
    act(() => result.current.onStreamEnd());
    expect(result.current.expression).toBe("neutral");

    // User continues typing — now goes to listening
    act(() => result.current.onUserTyping());
    expect(result.current.expression).toBe("listening");
  });

  it("clears idle timer when new stream starts", () => {
    const { result } = renderHook(() => useExpressionEngine(true));
    act(() => result.current.onStreamStart());
    act(() => result.current.onStreamEnd("happy"));

    // Start new stream before idle timeout fires
    act(() => vi.advanceTimersByTime(15_000));
    act(() => result.current.onStreamStart());
    expect(result.current.expression).toBe("speaking");

    act(() => result.current.onStreamEnd());
    // Should be neutral, not have the old idle timer fire
    act(() => vi.advanceTimersByTime(16_000));
    expect(result.current.expression).toBe("neutral");
  });

  it("exports AI_EXPRESSIONS set with correct values", () => {
    expect(AI_EXPRESSIONS.has("happy")).toBe(true);
    expect(AI_EXPRESSIONS.has("sad")).toBe(true);
    expect(AI_EXPRESSIONS.has("interested")).toBe(true);
    expect(AI_EXPRESSIONS.has("bored")).toBe(true);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    expect(AI_EXPRESSIONS.has("neutral" as any)).toBe(false);
    expect(AI_EXPRESSIONS.has("speaking" as any)).toBe(false);
    expect(AI_EXPRESSIONS.has("listening" as any)).toBe(false);
    expect(AI_EXPRESSIONS.has("sleepy" as any)).toBe(false);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    expect(AI_EXPRESSIONS.size).toBe(4);
  });
});
