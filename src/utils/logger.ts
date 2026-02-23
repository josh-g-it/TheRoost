import type { LogLevel, LogCategory } from "../types";
import { useDebugStore } from "../store/debugSlice";

function emit(
  level: LogLevel,
  source: string,
  category: LogCategory,
  message: string,
  metadata?: Record<string, unknown>,
) {
  useDebugStore.getState().addEvent({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    source,
    category,
    message,
    origin: "frontend",
    metadata,
  });
}

export const logger = {
  debug: (
    source: string,
    category: LogCategory,
    message: string,
    metadata?: Record<string, unknown>,
  ) => emit("debug", source, category, message, metadata),

  info: (
    source: string,
    category: LogCategory,
    message: string,
    metadata?: Record<string, unknown>,
  ) => emit("info", source, category, message, metadata),

  warn: (
    source: string,
    category: LogCategory,
    message: string,
    metadata?: Record<string, unknown>,
  ) => emit("warn", source, category, message, metadata),

  error: (
    source: string,
    category: LogCategory,
    message: string,
    metadata?: Record<string, unknown>,
  ) => emit("error", source, category, message, metadata),
};
