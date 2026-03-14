import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type {
  AiMessage,
  CompactionEventPayload,
  ConversationEndedPayload,
  Expression,
  ImageAttachment,
  ResolvedAction,
  StreamChunkPayload,
  UserMessagePayload,
} from "../types";
import { assistantApi } from "../services/tauri";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";
import { stripActions, extractT0Expression } from "../utils/actionParser";
import { buildPageContext } from "../utils/pageContext";
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
  const [endReason, setEndReason] = useState<"manual" | "timer" | null>(null);
  const [isCompacting, setIsCompacting] = useState(false);
  const [pendingActions, setPendingActions] = useState<ResolvedAction[]>([]);
  const [t0Expression, setT0Expression] = useState<Expression | null>(null);
  const lastUserMessageRef = useRef<string | null>(null);
  const isStreamingRef = useRef(false);
  const convIdRef = useRef(conversationId);
  const isLocalEndRef = useRef(false);
  const cloudAiEnabledRef = useRef(cloudAiEnabled);
  cloudAiEnabledRef.current = cloudAiEnabled;

  // Dedup ref: stores the timestamp of the last user message sent from THIS window.
  const lastSentTimestampRef = useRef<number | null>(null);

  useEffect(() => {
    convIdRef.current = conversationId;
    setMessages([]);
    setCurrentStreamText("");
    setError(null);
    setIsEnded(false);
    setEndReason(null);
    setIsCompacting(false);
    setPendingActions([]);
    setT0Expression(null);
    lastSentTimestampRef.current = null;
  }, [conversationId]);

  // ── Cross-window event listeners ──

  // Listen for cross-window user message sync.
  useEventListener<UserMessagePayload>(
    "ai-user-message",
    (event) => {
      const { conversationId: msgConvId, content, timestamp } = event.payload;
      if (msgConvId !== convIdRef.current) return;

      // Dedup: skip if this message originated from this window.
      if (
        lastSentTimestampRef.current !== null &&
        Math.abs(timestamp - lastSentTimestampRef.current) <= 2
      ) {
        lastSentTimestampRef.current = null;
        return;
      }

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

  useEventListener<CompactionEventPayload>(
    "ai-compaction-started",
    (event) => {
      if (event.payload.conversationId !== convIdRef.current) return;
      setIsCompacting(true);
    },
    [conversationId],
    { enabled: !!conversationId },
  );

  useEventListener<CompactionEventPayload>(
    "ai-compaction-complete",
    (event) => {
      if (event.payload.conversationId !== convIdRef.current) return;
      setIsCompacting(false);
    },
    [conversationId],
    { enabled: !!conversationId },
  );

  useEventListener<ConversationEndedPayload>(
    "ai-conversation-ended",
    (event) => {
      const endedConvId = event.payload.conversationId;
      if (endedConvId !== convIdRef.current) return;
      if (isLocalEndRef.current) {
        isLocalEndRef.current = false;
        return;
      }
      setMessages([]);
      setCurrentStreamText("");
      setIsStreaming(false);
      isStreamingRef.current = false;
      setEndReason(event.payload.reason ?? "manual");
      setIsEnded(true);
      setPendingActions([]);
    },
    [conversationId],
    { enabled: !!conversationId },
  );

  /** Process a full AI response: strip actions for display, parse actions, validate. */
  const processFullResponse = useCallback((convId: string, fullResponse: string) => {
    if (!fullResponse) return;

    // Strip actions delimiter for display
    const displayText = stripActions(fullResponse);

    if (displayText) {
      const assistantMessage: AiMessage = {
        id: crypto.randomUUID(),
        conversationId: convId,
        role: "assistant",
        content: displayText,
        createdAt: new Date().toISOString(),
        tokenEstimate: Math.ceil(displayText.length / 4),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    }

    // Parse actions from the raw response (JSON array after delimiter)
    if (fullResponse.includes("---ACTIONS---")) {
      const actionsBlock = fullResponse.split("---ACTIONS---")[1]?.trim();
      if (actionsBlock) {
        try {
          const parsed = JSON.parse(actionsBlock);
          const actions = Array.isArray(parsed)
            ? parsed.filter(
                (a: unknown): a is { actionId: string; tier: number } =>
                  typeof a === "object" &&
                  a !== null &&
                  "actionId" in a &&
                  typeof (a as Record<string, unknown>).actionId === "string",
              )
            : [];

          if (actions.length > 0) {
            const { expression: t0Expr, remaining: nonT0Actions } =
              extractT0Expression(actions);
            if (t0Expr) setT0Expression(t0Expr);

            if (nonT0Actions.length > 0) {
              assistantApi
                .validateAndResolveAiActions(nonT0Actions)
                .then((resolved) => {
                  logger.info("useConversation", "ai", "Actions validated", {
                    validCount: resolved.actions.length,
                    rejectedCount: resolved.rejectedCount,
                    actions: resolved.actions.map(
                      (a) => `${a.originalActionId} → ${a.actionId} (T${a.tier})`,
                    ),
                  });
                  if (resolved.actions.length > 0) {
                    setPendingActions(resolved.actions);
                  }
                })
                .catch((err) => {
                  logger.warn("useConversation", "ai", "Failed to validate actions", {
                    error: getErrorMessage(err),
                  });
                });
            }
          }
        } catch {
          logger.warn("useConversation", "ai", "Failed to parse actions JSON");
        }
      }
    }
  }, []);

  const loadHistory = useCallback(async (convId: string): Promise<AiMessage[]> => {
    try {
      const history = await assistantApi.getConversationHistory(convId);
      const cleaned = history.map((msg) => {
        const patched = { ...msg };
        if (msg.role === "assistant" && msg.content.includes("---ACTIONS---")) {
          patched.content = stripActions(msg.content);
        }
        // Attachments arrive as a JSON string from Rust — parse into array
        if (typeof patched.attachments === "string") {
          try {
            patched.attachments = JSON.parse(patched.attachments);
          } catch {
            patched.attachments = undefined;
          }
        }
        return patched;
      });
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

  // ── Send message — streams chunks via events, awaits full response as commit ──
  const sendMessage = useCallback(
    async (
      text: string,
      options?: {
        hidden?: boolean;
        actionFeedback?: string;
        imageAttachments?: ImageAttachment[];
      },
    ) => {
      if (!conversationId) return;
      if (isStreamingRef.current) return;

      // Block all messages when Cloud AI is disabled
      if (!cloudAiEnabledRef.current) {
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
      if (!options?.hidden) lastUserMessageRef.current = text;

      if (!options?.hidden) {
        lastSentTimestampRef.current = Math.floor(Date.now() / 1000);
        const userMessage: AiMessage = {
          id: crypto.randomUUID(),
          conversationId,
          role: "user",
          content: text,
          createdAt: new Date().toISOString(),
          tokenEstimate: Math.ceil(text.length / 4),
          attachments: options?.imageAttachments,
        };
        setMessages((prev) => [...prev, userMessage]);
      }
      setIsStreaming(true);
      isStreamingRef.current = true;
      setCurrentStreamText("");

      // Set up stream chunk listener for progressive rendering
      // (hidden messages skip streaming emission on the Rust side)
      const convIdForStream = conversationId;
      const unlisten = await listen<StreamChunkPayload>("ai-stream-chunk", (event) => {
        if (event.payload.conversationId !== convIdForStream) return;
        setCurrentStreamText((prev) => prev + event.payload.text);
      });

      try {
        const pageContext = options?.hidden ? undefined : buildPageContext();

        // Serialize image attachments for IPC (only mimeType + data, no previewUrl)
        const imageAttachmentsJson = options?.imageAttachments?.length
          ? JSON.stringify(
              options.imageAttachments.map((a) => ({
                mimeType: a.mimeType,
                data: a.data,
              })),
            )
          : undefined;

        // Rust streams chunks via events AND returns the full response when done.
        const fullResponse = await assistantApi.sendMessage(
          conversationId,
          avatarId,
          text,
          options?.hidden,
          options?.actionFeedback,
          maxOutputTokens,
          pageContext,
          imageAttachmentsJson,
        );

        unlisten();
        setCurrentStreamText("");
        processFullResponse(conversationId, fullResponse);
        setIsStreaming(false);
        isStreamingRef.current = false;
      } catch (err) {
        unlisten();
        setCurrentStreamText("");
        setIsStreaming(false);
        isStreamingRef.current = false;
        setError(getErrorMessage(err));
        logger.error("useConversation", "api", "Failed to send message", {
          error: getErrorMessage(err),
        });
      }
    },
    [conversationId, avatarId, maxOutputTokens, processFullResponse],
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
      isLocalEndRef.current = false;
      setIsCompacting(false);
      setEndReason("manual");
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

  const clearT0Expression = useCallback(() => {
    setT0Expression(null);
  }, []);

  return {
    messages,
    isStreaming,
    error,
    currentStreamText,
    isEnded,
    endReason,
    isCompacting,
    pendingActions,
    t0Expression,
    sendMessage,
    retry,
    endConversation,
    loadHistory,
    injectMessage,
    clearPendingActions,
    clearT0Expression,
  };
}
