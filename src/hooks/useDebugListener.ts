import type { LogEvent } from "../types";
import { useDebugStore } from "../store/debugSlice";
import { useEventListener } from "./useEventListener";

/**
 * Listens for "log-event" emissions from the Rust backend
 * and pushes them into the debug store. Call once in App.
 */
export function useDebugListener() {
  useEventListener<LogEvent>("log-event", (event) => {
    useDebugStore.getState().addEvent(event.payload);
  });
}
