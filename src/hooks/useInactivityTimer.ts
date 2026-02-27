import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

const DEFAULT_TIMEOUT = 3600;

interface SessionUpdatePayload {
  type: "started" | "ended";
}

interface UseInactivityTimerOptions {
  onTimeout: () => void;
  timeoutSeconds?: number;
}

export function useInactivityTimer({
  onTimeout,
  timeoutSeconds = DEFAULT_TIMEOUT,
}: UseInactivityTimerOptions) {
  const [remaining, setRemaining] = useState(timeoutSeconds);
  const [isPaused, setIsPaused] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const onTimeoutRef = useRef(onTimeout);
  const isPausedRef = useRef(isPaused);
  const isActiveRef = useRef(false);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isActiveRef.current || isPausedRef.current) return;
      setRemaining((prev) => {
        if (prev <= 0) return 0; // Already expired, no-op
        if (prev === 1) {
          onTimeoutRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unlisten = listen<SessionUpdatePayload>("session-update", (event) => {
      if (event.payload.type === "started") {
        setIsPaused(true);
      } else if (event.payload.type === "ended") {
        setIsPaused(false);
        setRemaining(timeoutSeconds);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [timeoutSeconds]);

  const resetTimer = useCallback(() => {
    setIsActive(true);
    setRemaining(timeoutSeconds);
  }, [timeoutSeconds]);

  return { remaining, isPaused, isActive, resetTimer };
}
