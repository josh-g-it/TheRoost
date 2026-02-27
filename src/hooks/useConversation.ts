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
  const lastUserMessageRef = useRef<string | null>(null);
  const isStreamingRef = useRef(false);
  const convIdRef = useRef(conversationId);

  useEffect(() => {
    convIdRef.current = conversationId;
    // Clear state for new conversation
    setMessages([]);
    setCurrentStreamText("");
    setError(null);
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

  const loadHistory = useCallback(async (convId: string) => {
    try {
      const history = await assistantApi.getConversationHistory(convId);
      setMessages(history);
      logger.info("useConversation", "api", "Loaded conversation history", {
        conversationId: convId,
        messageCount: history.length,
      });
    } catch (err) {
      logger.error("useConversation", "api", "Failed to load history", {
        error: getErrorMessage(err),
      });
      setError(getErrorMessage(err));
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!conversationId) return;
      if (isStreamingRef.current) return;
      setError(null);
      lastUserMessageRef.current = text;

      const userMessage: AiMessage = {
        id: crypto.randomUUID(),
        conversationId,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
        tokenEstimate: Math.ceil(text.length / 4),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      isStreamingRef.current = true;
      setCurrentStreamText("");

      try {
        await assistantApi.sendMessage(conversationId, avatarId, text);
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
    try {
      await assistantApi.endConversation(conversationId, avatarId);
      logger.info("useConversation", "api", "Conversation ended", { conversationId });
    } catch (err) {
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
    sendMessage,
    retry,
    endConversation,
    loadHistory,
  };
}
