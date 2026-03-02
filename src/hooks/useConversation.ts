import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AiMessage,
  ConversationEndedPayload,
  ResolvedAction,
  StreamChunk,
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
}

export function useConversation({
  avatarId,
  conversationId,
  maxOutputTokens,
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
  }, [conversationId]);

  useEventListener<StreamChunk>(
    "ai-stream-chunk",
    (event) => {
      const chunk = event.payload;
      if (chunk.conversationId !== convIdRef.current) return;

      if (chunk.isFinal) {
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
          let finalText = prev + safeText + result.displayText;
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
        setCurrentStreamText((prev) => prev + displayText);
      }
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
      setError(null);
      // Only track non-hidden messages for retry
      if (!options?.hidden) lastUserMessageRef.current = text;

      if (!options?.hidden) {
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
    setIsCompacting(true);
    try {
      await assistantApi.endConversation(conversationId, avatarId);
      logger.info("useConversation", "api", "Conversation ended", { conversationId });
      // Compaction is done — clear state immediately
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
