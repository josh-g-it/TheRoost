import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { AiMessage, StreamChunk } from "../types";
import { assistantApi } from "../services/tauri";
import { getErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

interface UseConversationOptions {
  avatarId: string;
  conversationId: string | null;
}

export function useConversation({ avatarId, conversationId }: UseConversationOptions) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStreamText, setCurrentStreamText] = useState("");
  const [isEnded, setIsEnded] = useState(false);
  const lastUserMessageRef = useRef<string | null>(null);
  const isStreamingRef = useRef(false);
  const convIdRef = useRef(conversationId);
  const isLocalEndRef = useRef(false);

  useEffect(() => {
    convIdRef.current = conversationId;
    // Clear state for new conversation
    setMessages([]);
    setCurrentStreamText("");
    setError(null);
    setIsEnded(false);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;

    const unlisten = listen<StreamChunk>("ai-stream-chunk", (event) => {
      const chunk = event.payload;
      if (chunk.conversationId !== convIdRef.current) return;

      if (chunk.isFinal) {
        setCurrentStreamText((prev) => {
          const finalText = prev + chunk.text;
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
      } else {
        setCurrentStreamText((prev) => prev + chunk.text);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [conversationId]);

  // Listen for cross-window conversation-ended events
  useEffect(() => {
    if (!conversationId) return;

    const unlisten = listen<string>("ai-conversation-ended", (event) => {
      const endedConvId = event.payload;
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
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [conversationId]);

  const loadHistory = useCallback(async (convId: string): Promise<AiMessage[]> => {
    try {
      const history = await assistantApi.getConversationHistory(convId);
      setMessages(history);
      logger.info("useConversation", "api", "Loaded conversation history", {
        conversationId: convId,
        messageCount: history.length,
      });
      return history;
    } catch (err) {
      logger.error("useConversation", "api", "Failed to load history", {
        error: getErrorMessage(err),
      });
      setError(getErrorMessage(err));
      return [];
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string, options?: { hidden?: boolean }) => {
      if (!conversationId) return;
      if (isStreamingRef.current) return;
      setError(null);
      lastUserMessageRef.current = text;

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

      try {
        await assistantApi.sendMessage(conversationId, avatarId, text, options?.hidden);
      } catch (err) {
        setIsStreaming(false);
        isStreamingRef.current = false;
        setError(getErrorMessage(err));
        logger.error("useConversation", "api", "Failed to send message", {
          error: getErrorMessage(err),
        });
      }
    },
    [conversationId, avatarId],
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
    isLocalEndRef.current = true;
    try {
      await assistantApi.endConversation(conversationId, avatarId);
      logger.info("useConversation", "api", "Conversation ended", { conversationId });
    } catch (err) {
      isLocalEndRef.current = false;
      setError(getErrorMessage(err));
      logger.error("useConversation", "api", "Failed to end conversation", {
        error: getErrorMessage(err),
      });
    }
  }, [conversationId, avatarId]);

  return {
    messages,
    isStreaming,
    error,
    currentStreamText,
    isEnded,
    sendMessage,
    retry,
    endConversation,
    loadHistory,
  };
}
