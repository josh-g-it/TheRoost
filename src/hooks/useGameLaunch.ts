import { useState, useRef, useEffect, useCallback } from "react";
import { gameApi } from "../services/tauri";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

export function useGameLaunch() {
  const [launching, setLaunching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const launch = useCallback(async (gameId: string) => {
    logger.info("useGameLaunch", "launch", "Launching game", { gameId });
    setLaunching(gameId);
    setError(null);
    try {
      await gameApi.launch(gameId);
      logger.info("useGameLaunch", "launch", "Game launch invoked", { gameId });
    } catch (e) {
      const msg = getErrorMessage(e);
      logger.error("useGameLaunch", "launch", "Game launch failed", {
        gameId,
        error: msg,
      });
      setError(msg);
    } finally {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setLaunching(null), 1000);
    }
  }, []);

  return { launch, launching, error };
}
