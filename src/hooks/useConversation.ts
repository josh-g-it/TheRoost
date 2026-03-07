import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AiMessage,
  CompactionEventPayload,
  ConversationEndedPayload,
  ResolvedAction,
  StreamChunk,
  UserMessagePayload,
} from "../types";
import { assistantApi } from "../services/tauri";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";
import {
  createParserState,
  processChunk,
  finalizeStream,
  stripActions,
  parseActionsFromContent,
} from "../utils/actionParser";
import type { StreamParserState } from "../utils/actionParser";
import { useEventListener } from "./useEventListener";

interface UseConversationOptions {
  avatarId: string;
  conversationId: string | null;
  maxOutputTokens?: number;
  /** When false, sendMessage() is blocked and returns a system-style warning. */
  cloudAiEnabled?: boolean;
}

export function useConversation({
  avatarId,
  conversationId,
  maxOutputTokens,
  cloudAiEnabled = true,
}: UseConversationOptions) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStreamText, setCurrentStreamText] = useState("");
  const [isEnded, setIsEnded] = useState(false);
  const [isCompacting, setIsCompacting] = useState(false);
  const [pendingActions, setPendingActions] = useState<ResolvedAction[]>([]);
  const lastUserMessageRef = useRef<string | null>(null);
  const isStreamingRef = useRef(false);
  const convIdRef = useRef(conversationId);
  const isLocalEndRef = useRef(false);
  const parserStateRef = useRef<StreamParserState | null>(null);
  const cloudAiEnabledRef = useRef(cloudAiEnabled);
  cloudAiEnabledRef.current = cloudAiEnabled;

  // Stream debounce: accumulate chunks in a ref and flush to state every 50ms (20 fps)
  const streamBufferRef = useRef("");
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dedup ref: stores the timestamp of the last user message sent from THIS window.
  // When the `ai-user-message` event arrives, we compare its timestamp against this
  // to avoid adding the same message twice (the sender already has it in local state).
  const lastSentTimestampRef = useRef<number | null>(null);

  useEffect(() => {
    convIdRef.current = conversationId;
    // Clear state for new conversation
    setMessages([]);
    setCurrentStreamText("");
    setError(null);
    setIsEnded(false);
    setIsCompacting(false);
    setPendingActions([]);
    parserStateRef.current = null;
    lastSentTimestampRef.current = null;
    // Clear any pending debounce timer
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    streamBufferRef.current = "";
  }, [conversationId]);

  useEventListener<StreamChunk>(
    "ai-stream-chunk",
    (event) => {
      const chunk = event.payload;
      if (chunk.conversationId !== convIdRef.current) return;

      if (chunk.isFinal) {
        // Flush any pending debounced text first
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        const pendingBuffer = streamBufferRef.current;
        streamBufferRef.current = "";

        // Initialize parser if not yet started (edge case: only final chunk)
        if (!parserStateRef.current) {
          parserStateRef.current = createParserState();
        }

        // Process the final chunk through the parser
        const safeText = processChunk(parserStateRef.current, chunk.text);

        // Finalize — get remaining display text and parsed actions
        const result = finalizeStream(parserStateRef.current);
        parserStateRef.current = null;

        setCurrentStreamText((prev) => {
          let finalText = prev + pendingBuffer + safeText + result.displayText;
          // Safety-strip delimiter if parser didn't fully catch it
          const delimIdx = finalText.indexOf("---ACTIONS---");
          if (delimIdx >= 0) finalText = finalText.substring(0, delimIdx).trimEnd();
          setMessages((msgs) => [
            ...msgs,
            {
              id: crypto.randomUUID(),
              conversationId: chunk.conversationId,
              role: "assistant",
              content: finalText,
              createdAt: new Date().toISOString(),
              tokenEstimate: Math.ceil(finalText.length / 4),
            },
          ]);
          return "";
        });

        setIsStreaming(false);
        isStreamingRef.current = false;

        // Validate and resolve actions via IPC
        if (result.actions.length > 0) {
          assistantApi
            .validateAndResolveAiActions(result.actions)
            .then((resolved) => {
              if (resolved.actions.length > 0) {
                setPendingActions(resolved.actions);
              }
              if (resolved.rejectedCount > 0) {
                logger.warn("useConversation", "ai", "Some actions rejected", {
                  rejectedCount: resolved.rejectedCount,
                });
              }
            })
            .catch((err) => {
              logger.warn("useConversation", "ai", "Failed to validate actions", {
                error: getErrorMessage(err),
              });
            });
        }
      } else {
        // Initialize parser on first non-final chunk
        if (!parserStateRef.current) {
          parserStateRef.current = createParserState();
        }
        const displayText = processChunk(parserStateRef.current, chunk.text);
        if (displayText) {
          streamBufferRef.current += displayText;
          // Debounce: flush accumulated text every 50ms (20 fps)
          if (!flushTimerRef.current) {
            flushTimerRef.current = setTimeout(() => {
              const buffered = streamBufferRef.current;
              streamBufferRef.current = "";
              flushTimerRef.current = null;
              if (buffered) {
                setCurrentStreamText((prev) => prev + buffered);
              }
            }, 50);
          }
        }
      }
    },
    [conversationId],
    { enabled: !!conversationId },
  );

  // Listen for cross-window user message sync (KI #9).
  // When the OTHER window sends a user message, the Rust backend emits
  // `ai-user-message` to all windows. The sender deduplicates by comparing
  // the event timestamp against lastSentTimestampRef.
  useEventListener<UserMessagePayload>(
    "ai-user-message",
    (event) => {
      const { conversationId: msgConvId, content, timestamp } = event.payload;
      if (msgConvId !== convIdRef.current) return;

      // Dedup: skip if this message originated from this window.
      // We match on timestamp (seconds precision) set just before the IPC call.
      if (
        lastSentTimestampRef.current !== null &&
        Math.abs(timestamp - lastSentTimestampRef.current) <= 2
      ) {
        // Clear the ref so the next event is not falsely deduped
        lastSentTimestampRef.current = null;
        return;
      }

      // Add the user message from the other window to local state
      const userMessage: AiMessage = {
        id: crypto.randomUUID(),
        conversationId: msgConvId,
        role: "user",
        content,
        createdAt: new Date(timestamp * 1000).toISOString(),
        tokenEstimate: Math.ceil(content.length / 4),
      };
      setMessages((prev) => [...prev, userMessage]);
    },
    [conversationId],
    { enabled: !!conversationId },
  );

  // Listen for cross-window compaction started event (KI #9).
  // When any window starts ending a conversation, the Rust backend emits
  // `ai-compaction-started`. The window that initiated the end already
  // has isCompacting=true, but this covers the OTHER window.
  useEventListener<CompactionEventPayload>(
    "ai-compaction-started",
    (event) => {
      if (event.payload.conversationId !== convIdRef.current) return;
      setIsCompacting(true);
    },
    [conversationId],
    { enabled: !!conversationId },
  );

  // Listen for cross-window compaction complete event (KI #9).
  // When compaction finishes, clear the splash on the OTHER window and
  // reload conversation history to pick up any compacted state.
  useEventListener<CompactionEventPayload>(
    "ai-compaction-complete",
    (event) => {
      if (event.payload.conversationId !== convIdRef.current) return;
      setIsCompacting(false);
    },
    [conversationId],
    { enabled: !!conversationId },
  );

  // Listen for cross-window conversation-ended events
  useEventListener<ConversationEndedPayload>(
    "ai-conversation-ended",
    (event) => {
      const endedConvId = event.payload.conversationId;
      if (endedConvId !== convIdRef.current) return;
      // Skip if we are the one who triggered the end
      if (isLocalEndRef.current) {
        isLocalEndRef.current = false;
        return;
      }
      setMessages([]);
      setCurrentStreamText("");
      setIsStreaming(false);
      isStreamingRef.current = false;
      setIsEnded(true);
      setPendingActions([]);
    },
    [conversationId],
    { enabled: !!conversationId },
  );

  const loadHistory = useCallback(async (convId: string): Promise<AiMessage[]> => {
    try {
      const history = await assistantApi.getConversationHistory(convId);

      // Strip ---ACTIONS--- from all messages for display, and re-parse
      // actions from the last assistant message if no user message follows it.
      let lastActionIdx = -1;
      const cleaned = history.map((msg, i) => {
        if (msg.role === "assistant" && msg.content.includes("---ACTIONS---")) {
          lastActionIdx = i;
          return { ...msg, content: stripActions(msg.content) };
        }
        return msg;
      });

      // If the last assistant message with actions has no subsequent user message,
      // re-resolve the actions so the "Run Actions" button reappears.
      if (lastActionIdx >= 0) {
        const hasUserAfter = history
          .slice(lastActionIdx + 1)
          .some((m) => m.role === "user");
        if (!hasUserAfter) {
          const { actions } = parseActionsFromContent(history[lastActionIdx].content);
          if (actions.length > 0) {
            assistantApi
              .validateAndResolveAiActions(actions)
              .then((resolved) => {
                if (resolved.actions.length > 0) {
                  setPendingActions(resolved.actions);
                }
              })
              .catch((err) => {
                logger.warn(
                  "useConversation",
                  "ai",
                  "Failed to re-resolve history actions",
                  {
                    error: getErrorMessage(err),
                  },
                );
              });
          }
        }
      }

      setMessages(cleaned);
      logger.info("useConversation", "api", "Loaded conversation history", {
        conversationId: convId,
        messageCount: history.length,
      });
      return cleaned;
    } catch (err) {
      logger.error("useConversation", "api", "Failed to load history", {
        error: getErrorMessage(err),
      });
      setError(getErrorMessage(err));
      return [];
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string, options?: { hidden?: boolean; actionFeedback?: string }) => {
      if (!conversationId) return;
      if (isStreamingRef.current) return;

      // Block all messages when Cloud AI is disabled
      if (!cloudAiEnabledRef.current) {
        if (!options?.hidden) {
          // Show the user's message in the chat
          const userMessage: AiMessage = {
            id: crypto.randomUUID(),
            conversationId,
            role: "user",
            content: text,
            createdAt: new Date().toISOString(),
            tokenEstimate: Math.ceil(text.length / 4),
          };
          setMessages((prev) => [...prev, userMessage]);
          // Add a system-style response explaining why it's blocked
          const systemMessage: AiMessage = {
            id: crypto.randomUUID(),
            conversationId,
            role: "assistant",
            content:
              "Cloud AI is currently disabled. You can enable it in Settings \u2192 Assistant to start chatting.",
            createdAt: new Date().toISOString(),
            tokenEstimate: 20,
          };
          setMessages((prev) => [...prev, systemMessage]);
        }
        return;
      }

      setError(null);
      // Only track non-hidden messages for retry
      if (!options?.hidden) lastUserMessageRef.current = text;

      if (!options?.hidden) {
        // Record timestamp for cross-window dedup BEFORE adding to local state
        lastSentTimestampRef.current = Math.floor(Date.now() / 1000);

        const userMessage: AiMessage = {
          id: crypto.randomUUID(),
          conversationId,
          role: "user",
          content: text,
          createdAt: new Date().toISOString(),
          tokenEstimate: Math.ceil(text.length / 4),
        };
        setMessages((prev) => [...prev, userMessage]);
      }
      setIsStreaming(true);
      isStreamingRef.current = true;
      setCurrentStreamText("");
      parserStateRef.current = null;

      try {
        await assistantApi.sendMessage(
          conversationId,
          avatarId,
          text,
          options?.hidden,
          options?.actionFeedback,
          maxOutputTokens,
        );
      } catch (err) {
        setIsStreaming(false);
        isStreamingRef.current = false;
        setError(getErrorMessage(err));
        logger.error("useConversation", "api", "Failed to send message", {
          error: getErrorMessage(err),
        });
      }
    },
    [conversationId, avatarId, maxOutputTokens],
  );

  const retry = useCallback(async () => {
    if (isStreamingRef.current) return;
    if (!lastUserMessageRef.current) return;
    setMessages((prev) => {
      const lastIdx = prev.length - 1;
      if (lastIdx >= 0 && prev[lastIdx].role === "user") {
        return prev.slice(0, lastIdx);
      }
      return prev;
    });
    await sendMessage(lastUserMessageRef.current);
  }, [sendMessage]);

  const endConversation = useCallback(async () => {
    if (!conversationId) return;
    if (isCompacting) return;
    isLocalEndRef.current = true;
    // Note: isCompacting is now set by the `ai-compaction-started` event (broadcast
    // from Rust), which fires before the actual compaction begins. This ensures both
    // windows show the journaling splash simultaneously. We still set it here as a
    // fast local fallback in case the event arrives slightly after the IPC call.
    setIsCompacting(true);
    try {
      await assistantApi.endConversation(conversationId, avatarId);
      logger.info("useConversation", "api", "Conversation ended", { conversationId });
      // Compaction is done — the `ai-compaction-complete` event will clear isCompacting
      // on both windows. For the local window, also clear immediately for snappy UX.
      isLocalEndRef.current = false;
      setIsCompacting(false);
      setIsEnded(true);
    } catch (err) {
      isLocalEndRef.current = false;
      setIsCompacting(false);
      setError(getErrorMessage(err));
      logger.error("useConversation", "api", "Failed to end conversation", {
        error: getErrorMessage(err),
      });
    }
  }, [conversationId, avatarId, isCompacting]);

  const injectMessage = useCallback((msg: AiMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const clearPendingActions = useCallback(() => {
    setPendingActions([]);
  }, []);

  return {
    messages,
    isStreaming,
    error,
    currentStreamText,
    isEnded,
    isCompacting,
    pendingActions,
    sendMessage,
    retry,
    endConversation,
    loadHistory,
    injectMessage,
    clearPendingActions,
  };
}
