import { useEffect, useRef, useState } from "react";
import type { AiMessage } from "../types";
import { assistantApi } from "../services/tauri";
import { logger } from "../utils/logger";
import { getErrorMessage } from "../utils/errors";

interface UseAutoGreetOptions {
  conversationId: string | null;
  avatarId: string | null;
  loadHistory: (convId: string) => Promise<AiMessage[]>;
  sendMessage: (text: string, opts?: { hidden?: boolean }) => void;
  onStaleReset: () => void;
}

/**
 * Handles auto-greeting and stale-check logic for a conversation.
 * On a new conversationId:
 * 1. Checks if stale → abandons + resets if so
 * 2. Loads history
 * 3. If empty history, queries the DB to determine first-time vs returning greeting
 *
 * Returns `historyLoaded` so callers can gate review injection etc.
 */
export function useAutoGreet({
  conversationId,
  avatarId,
  loadHistory,
  sendMessage,
  onStaleReset,
}: UseAutoGreetOptions): { historyLoaded: boolean } {
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const introSentForRef = useRef<string | null>(null);

  // Ref-sync for values read inside async effect (avoids stale closures)
  const callbacksRef = useRef({ onStaleReset });
  callbacksRef.current = { onStaleReset };

  useEffect(() => {
    setHistoryLoaded(false);
    if (!conversationId || !avatarId) return;
    // Synchronous claim: if we've already handled this conversation, bail out
    // immediately. Prevents duplicate greetings from StrictMode double-mount,
    // sendMessage dep recreation, or other re-fires. (KI #8)
    if (introSentForRef.current === conversationId) return;
    introSentForRef.current = conversationId;

    async function loadAndGreet() {
      // Step 1: Check staleness (with error recovery)
      try {
        const isStale = await assistantApi.checkConversationStale(conversationId!);
        if (isStale) {
          await assistantApi.abandonConversation(conversationId!);
          callbacksRef.current.onStaleReset();
          return;
        }
      } catch {
        // Stale check failed — fall through to normal flow
      }

      // Step 2: Normal flow — load history and optionally send greeting
      const history = await loadHistory(conversationId!);
      setHistoryLoaded(true);
      if (history.length === 0) {
        // Ask the DB whether this avatar has ever completed a conversation
        const isFirst = await assistantApi.isAvatarFirstConversation(avatarId!);
        const prompt = isFirst
          ? "This is your very first conversation with the user. They just created you. Introduce yourself warmly — tell them your name, ask what they'd like to be called, and ask how they prefer conversations (casual, detailed, brief). Be yourself and be curious."
          : "A new conversation has started. This message is sent automatically by the system, not by the user. Greet the user warmly as someone you already know. Keep it brief and natural — maybe reference something from your memories or just say hello and ask what's on their mind.";
        sendMessage(prompt, { hidden: true });
      }
    }

    loadAndGreet().catch((err) => {
      logger.error("useAutoGreet", "ai", "Failed to load and greet", {
        error: getErrorMessage(err),
      });
    });
  }, [conversationId, avatarId, loadHistory, sendMessage]);

  return { historyLoaded };
}
