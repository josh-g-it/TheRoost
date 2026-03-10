/**
 * Streaming delimiter parser for AI action extraction.
 *
 * The AI appends structured action data after a `\n---ACTIONS---\n` delimiter
 * at the end of its response. This parser intercepts the delimiter during streaming
 * so the action payload is never shown to the user.
 */

import { logger } from "./logger";

export const DELIMITER = "\n---ACTIONS---\n";

/** A raw action as parsed from the AI response JSON. */
export interface ParsedAiAction {
  actionId: string;
  tier: number;
  description?: string;
  payload?: Record<string, unknown>;
}

/** Mutable state maintained across streaming chunks. */
export interface StreamParserState {
  /** Whether the delimiter has been detected. */
  delimiterFound: boolean;
  /** Trailing buffer holding the last DELIMITER.length chars (for split detection). */
  trailingBuffer: string;
  /** Accumulates text after the delimiter (the action JSON). */
  actionsBuffer: string;
}

/** Create fresh state for each streaming response. */
export function createParserState(): StreamParserState {
  return {
    delimiterFound: false,
    trailingBuffer: "",
    actionsBuffer: "",
  };
}

/**
 * Process a single streaming chunk.
 * Returns safe display text (delimiter and actions are hidden from the user).
 * Mutates state in place for performance during rapid streaming.
 */
export function processChunk(state: StreamParserState, chunk: string): string {
  // After delimiter found, everything goes to actions buffer
  if (state.delimiterFound) {
    state.actionsBuffer += chunk;
    return "";
  }

  // Combine trailing buffer with new chunk for split-delimiter detection
  const combined = state.trailingBuffer + chunk;

  // Check for delimiter in the combined string
  const delimiterIndex = combined.indexOf(DELIMITER);

  if (delimiterIndex >= 0) {
    // Delimiter found — split display text from actions
    state.delimiterFound = true;
    const displayText = combined.substring(0, delimiterIndex);
    state.actionsBuffer = combined.substring(delimiterIndex + DELIMITER.length);
    state.trailingBuffer = "";
    return displayText;
  }

  // No delimiter found — hold back trailing chars for next chunk
  if (combined.length > DELIMITER.length) {
    const emitUpTo = combined.length - DELIMITER.length;
    state.trailingBuffer = combined.substring(emitUpTo);
    return combined.substring(0, emitUpTo);
  }

  // Entire combined string fits in the trailing buffer
  state.trailingBuffer = combined;
  return "";
}

/**
 * Strip the `---ACTIONS---` delimiter and everything after it from a message string.
 * Use when rendering messages that may contain unparsed action data.
 */
export function stripActions(content: string): string {
  const idx = content.indexOf("---ACTIONS---");
  return idx >= 0 ? content.substring(0, idx).trimEnd() : content;
}

/**
 * Parse actions from a complete (non-streaming) message string.
 * Used when loading history messages that may contain the delimiter.
 */
export function parseActionsFromContent(content: string): {
  displayText: string;
  actions: ParsedAiAction[];
} {
  const idx = content.indexOf("---ACTIONS---");
  if (idx < 0) return { displayText: content, actions: [] };

  const displayText = content.substring(0, idx).trimEnd();
  const actionSection = content.substring(idx + "---ACTIONS---".length).trim();

  if (!actionSection) return { displayText, actions: [] };

  try {
    const parsed: unknown = JSON.parse(actionSection);
    if (!Array.isArray(parsed)) {
      logger.warn(
        "actionParser",
        "ai",
        `Malformed action JSON: expected array, got ${typeof parsed}`,
      );
      return { displayText, actions: [] };
    }

    const actions: ParsedAiAction[] = parsed.filter(
      (item: unknown): item is ParsedAiAction =>
        typeof item === "object" &&
        item !== null &&
        "actionId" in item &&
        typeof (item as Record<string, unknown>).actionId === "string" &&
        "tier" in item &&
        typeof (item as Record<string, unknown>).tier === "number",
    );
    return { displayText, actions };
  } catch (e) {
    logger.warn(
      "actionParser",
      "ai",
      `Malformed action JSON from AI response: ${String(e)}`,
    );
    return { displayText, actions: [] };
  }
}

/**
 * Finalize the stream — flush the trailing buffer and parse action JSON.
 * Call this when the stream ends (final chunk received).
 *
 * Returns the remaining display text (from trailing buffer) and parsed actions.
 * Gracefully handles malformed JSON (returns empty actions array).
 */
export function finalizeStream(state: StreamParserState): {
  displayText: string;
  actions: ParsedAiAction[];
} {
  if (!state.delimiterFound) {
    // No delimiter — trailing buffer is just regular text
    // Log if the response looks like it might have intended actions
    const trail = state.trailingBuffer;
    if (trail.includes("ACTIONS") || trail.includes("actionId")) {
      logger.warn(
        "actionParser",
        "ai",
        "Delimiter not found but response mentions actions",
        {
          trailingSnippet: trail.slice(-200),
        },
      );
    }
    return { displayText: trail.trimEnd(), actions: [] };
  }

  // Delimiter found — parse the actions buffer
  const trimmed = state.actionsBuffer.trim();

  if (!trimmed) {
    return { displayText: "", actions: [] };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);

    if (!Array.isArray(parsed)) {
      logger.warn(
        "actionParser",
        "ai",
        `Malformed streamed action JSON: expected array, got ${typeof parsed}`,
      );
      return { displayText: "", actions: [] };
    }

    // Filter out entries missing required fields
    const actions: ParsedAiAction[] = parsed.filter(
      (item: unknown): item is ParsedAiAction =>
        typeof item === "object" &&
        item !== null &&
        "actionId" in item &&
        typeof (item as Record<string, unknown>).actionId === "string" &&
        "tier" in item &&
        typeof (item as Record<string, unknown>).tier === "number",
    );

    return { displayText: "", actions };
  } catch (e) {
    // Malformed JSON — log it for debugging, return empty actions
    logger.warn(
      "actionParser",
      "ai",
      `Malformed streamed action JSON from AI: ${String(e)}`,
      { rawBuffer: trimmed.slice(0, 500) },
    );
    return { displayText: "", actions: [] };
  }
}
