import { create } from "zustand";
import type { LogEvent, LogLevel, LogCategory } from "../types";
import { MAX_LOG_EVENTS } from "../constants";

interface DebugState {
  events: LogEvent[];
  isCapturing: boolean;
  startTime: number;
  addEvent: (event: LogEvent) => void;
  clearEvents: () => void;
  setCapturing: (on: boolean) => void;
}

// Batching: accumulate events during a single animation frame, flush once.
// This prevents hundreds of individual Zustand updates + React re-renders
// during burst logging (e.g. metadata batch fetch).
let pendingEvents: LogEvent[] = [];
let flushScheduled = false;

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    flushScheduled = false;
    if (pendingEvents.length === 0) return;
    const batch = pendingEvents;
    pendingEvents = [];
    useDebugStore.setState((state) => {
      if (!state.isCapturing) return state;
      const combined = [...state.events, ...batch];
      const events =
        combined.length > MAX_LOG_EVENTS
          ? combined.slice(combined.length - MAX_LOG_EVENTS)
          : combined;
      return { events };
    });
  });
}

export const useDebugStore = create<DebugState>((set) => ({
  events: [],
  isCapturing: true,
  startTime: Date.now(),

  addEvent: (event) => {
    pendingEvents.push(event);
    scheduleFlush();
  },

  clearEvents: () => set({ events: [] }),

  setCapturing: (isCapturing) => set({ isCapturing }),
}));

/** Get filtered events by level and/or category. */
export function filterEvents(
  events: LogEvent[],
  levels?: Set<LogLevel>,
  categories?: Set<LogCategory>,
  search?: string,
): LogEvent[] {
  return events.filter((e) => {
    if (levels && !levels.has(e.level)) return false;
    if (categories && !categories.has(e.category)) return false;
    if (search) {
      const q = search.toLowerCase();
      const inMessage = e.message.toLowerCase().includes(q);
      const inSource = e.source.toLowerCase().includes(q);
      const inMeta = e.metadata
        ? JSON.stringify(e.metadata).toLowerCase().includes(q)
        : false;
      if (!inMessage && !inSource && !inMeta) return false;
    }
    return true;
  });
}
