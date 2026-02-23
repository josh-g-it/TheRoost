import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { LogEvent } from "../types";
import { useDebugStore } from "../store/debugSlice";
import { logger } from "../utils/logger";

/**
 * Listens for "log-event" emissions from the Rust backend
 * and pushes them into the debug store. Call once in App.
 */
export function useDebugListener() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<LogEvent>("log-event", (event) => {
      useDebugStore.getState().addEvent(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    logger.info("App", "system", "Debug listener initialized");

    return () => {
      unlisten?.();
    };
  }, []);
}
