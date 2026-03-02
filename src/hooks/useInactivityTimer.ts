import { useCallback, useEffect, useRef, useState } from "react";
import { assistantApi } from "../services/tauri";
import { useEventListener } from "./useEventListener";

interface TimerTickPayload {
  remainingSeconds: number;
  isPaused: boolean;
}

interface UseInactivityTimerOptions {
  conversationId: string | null;
  avatarId: string | null;
}

export function useInactivityTimer({
  conversationId,
  avatarId,
}: UseInactivityTimerOptions) {
  const [remaining, setRemaining] = useState(3600);
  const [isPaused, setIsPaused] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Start timer when conversation starts, stop when it ends
  useEffect(() => {
    if (conversationId && avatarId) {
      assistantApi.startConversationTimer(conversationId, avatarId).catch(() => {});
      setIsActive(true);

      // Load current state in case timer was already running
      assistantApi
        .getConversationTimerState()
        .then((state) => {
          if (state) {
            setRemaining(state.remainingSeconds);
            setIsPaused(state.isPaused);
          }
        })
        .catch(() => {});
    } else {
      setIsActive(false);
    }
  }, [conversationId, avatarId]);

  // Listen for tick events from backend
  useEventListener<TimerTickPayload>("conversation-timer-tick", (event) => {
    setRemaining(event.payload.remainingSeconds);
    setIsPaused(event.payload.isPaused);
  });

  // Listen for auto-ended events
  useEventListener<{ conversationId: string }>("conversation-auto-ended", (event) => {
    if (event.payload.conversationId === conversationIdRef.current) {
      setIsActive(false);
      setRemaining(0);
    }
  });

  // resetTimer now calls the backend
  const resetTimer = useCallback(() => {
    assistantApi.resetConversationTimer().catch(() => {});
    setRemaining(3600);
    setIsActive(true);
  }, []);

  return { remaining, isPaused, isActive, resetTimer };
}
