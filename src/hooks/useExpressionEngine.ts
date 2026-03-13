import { useCallback, useEffect, useRef, useState } from "react";
import type { Expression } from "../types";

const IDLE_TIMEOUT_MS = 30_000;
const TYPING_DEBOUNCE_MS = 500;

/** AI-controllable expressions (T0 actions) */
export const AI_EXPRESSIONS: ReadonlySet<Expression> = new Set([
  "happy",
  "sad",
  "interested",
  "bored",
]);

interface UseExpressionEngineReturn {
  expression: Expression;
  onStreamStart: () => void;
  onStreamEnd: (t0Expression?: Expression) => void;
  onUserTyping: () => void;
  onUserSentMessage: () => void;
  onAvatarSwitched: () => void;
}

/**
 * Expression engine state machine for avatar sprites.
 *
 * Priority (highest first):
 *   1. Speaking (streaming always wins)
 *   2. Listening (user typing, only when not streaming)
 *   3. AI emotion (T0 action applied on stream_end, 30s idle timeout)
 *   4. Neutral (default)
 *
 * If `avatarHasSprite` is false, always returns 'neutral' (no-op optimization).
 */
export function useExpressionEngine(avatarHasSprite: boolean): UseExpressionEngineReturn {
  const [expression, setExpression] = useState<Expression>("neutral");
  const isStreamingRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (typingTimerRef.current !== null) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => clearTimers, [clearTimers]);

  // If no sprite, always neutral — reset if previously had sprite
  useEffect(() => {
    if (!avatarHasSprite) {
      clearTimers();
      setExpression("neutral");
    }
  }, [avatarHasSprite, clearTimers]);

  const onStreamStart = useCallback(() => {
    if (!avatarHasSprite) return;
    isStreamingRef.current = true;
    // Speaking is highest priority — clear all timers
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (typingTimerRef.current !== null) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    setExpression("speaking");
  }, [avatarHasSprite]);

  const onStreamEnd = useCallback(
    (t0Expression?: Expression) => {
      if (!avatarHasSprite) return;
      isStreamingRef.current = false;

      if (t0Expression && AI_EXPRESSIONS.has(t0Expression)) {
        setExpression(t0Expression);
        // Start 30s idle timeout back to neutral
        if (idleTimerRef.current !== null) {
          clearTimeout(idleTimerRef.current);
        }
        idleTimerRef.current = setTimeout(() => {
          idleTimerRef.current = null;
          setExpression("neutral");
        }, IDLE_TIMEOUT_MS);
      } else {
        setExpression("neutral");
      }
    },
    [avatarHasSprite],
  );

  const onUserTyping = useCallback(() => {
    if (!avatarHasSprite) return;
    // Speaking overrides listening
    if (isStreamingRef.current) return;

    setExpression("listening");

    // Reset 500ms debounce timer
    if (typingTimerRef.current !== null) {
      clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = setTimeout(() => {
      typingTimerRef.current = null;
      // Only go neutral if still listening (not streaming)
      if (!isStreamingRef.current) {
        setExpression((prev) => (prev === "listening" ? "neutral" : prev));
      }
    }, TYPING_DEBOUNCE_MS);
  }, [avatarHasSprite]);

  const onUserSentMessage = useCallback(() => {
    if (!avatarHasSprite) return;
    if (isStreamingRef.current) return;
    // Clear typing debounce
    if (typingTimerRef.current !== null) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    setExpression("neutral");
  }, [avatarHasSprite]);

  const onAvatarSwitched = useCallback(() => {
    isStreamingRef.current = false;
    clearTimers();
    setExpression("neutral");
  }, [clearTimers]);

  // No-op optimization: if no sprite, return stable neutral + no-ops
  if (!avatarHasSprite) {
    return {
      expression: "neutral",
      onStreamStart,
      onStreamEnd,
      onUserTyping,
      onUserSentMessage,
      onAvatarSwitched,
    };
  }

  return {
    expression,
    onStreamStart,
    onStreamEnd,
    onUserTyping,
    onUserSentMessage,
    onAvatarSwitched,
  };
}
