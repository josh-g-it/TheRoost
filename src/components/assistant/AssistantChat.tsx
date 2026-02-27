import type { ComponentPropsWithoutRef } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useConversation } from "../../hooks/useConversation";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { AppIcon } from "../common/AppIcon";
import "./AssistantChat.css";

interface AssistantChatProps {
  avatarId: string;
  conversationId: string | null;
  onConversationStart?: () => void;
  compact?: boolean;
  isFirstConversation?: boolean;
}

export function AssistantChat({
  avatarId,
  conversationId,
  onConversationStart,
  compact,
  isFirstConversation,
}: AssistantChatProps) {
  const {
    messages,
    isStreaming,
    error,
    currentStreamText,
    sendMessage,
    retry,
    endConversation,
    loadHistory,
  } = useConversation({ avatarId, conversationId });

  const {
    transcript,
    isListening,
    isSupported,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition();

  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const introSentRef = useRef(false);

  useEffect(() => {
    introSentRef.current = false;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    async function loadAndGreet() {
      const history = await loadHistory(conversationId!);
      if (history.length === 0 && !introSentRef.current) {
        introSentRef.current = true;
        const prompt = isFirstConversation
          ? "This is your very first conversation with the user. They just created you. Introduce yourself warmly — tell them your name, ask what they'd like to be called, and ask how they prefer conversations (casual, detailed, brief). Be yourself and be curious."
          : "A new conversation has started. This message is sent automatically by the system, not by the user. Greet the user warmly as someone you already know. Keep it brief and natural — maybe reference something from your memories or just say hello and ask what's on their mind.";
        sendMessage(prompt, { hidden: true });
      }
    }
    loadAndGreet();
  }, [conversationId, loadHistory, sendMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, currentStreamText]);

  useEffect(() => {
    if (!isListening && transcript) {
      setInputValue((prev) => (prev ? prev + " " + transcript : transcript));
    }
  }, [isListening, transcript]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;
    sendMessage(text);
    setInputValue("");
    onConversationStart?.();
  }, [inputValue, isStreaming, sendMessage, onConversationStart]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleMicToggle = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const markdownComponents = {
    a: ({ href, children, ...props }: ComponentPropsWithoutRef<"a">) => {
      if (href && /^(javascript|vbscript|data):/i.test(href)) return <>{children}</>;
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      );
    },
    img: () => null,
  };

  return (
    <div className={`assistant-chat ${compact ? "assistant-chat--compact" : ""}`}>
      <div className="assistant-chat__messages">
        {messages.length === 0 && !isStreaming && (
          <div className="assistant-chat__empty">
            <AppIcon name="assistant" size={48} />
            <p>Start a conversation with your assistant.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`assistant-chat__message assistant-chat__message--${msg.role}`}
          >
            {msg.role === "assistant" ? (
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {msg.content}
              </Markdown>
            ) : (
              msg.content
            )}
          </div>
        ))}
        {isStreaming && (
          <div className="assistant-chat__streaming">
            {currentStreamText ? (
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {currentStreamText}
              </Markdown>
            ) : null}
            <span className="assistant-chat__streaming-cursor" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="assistant-chat__error">
          <span className="assistant-chat__error-text">{error}</span>
          <button className="assistant-chat__retry-btn" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      <div className="assistant-chat__input-bar">
        <input
          ref={inputRef}
          className="assistant-chat__input"
          type="text"
          placeholder="Type a message..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          maxLength={10000}
        />
        {isSupported && (
          <button
            className={`assistant-chat__mic-btn ${isListening ? "assistant-chat__mic-btn--active" : ""}`}
            onClick={handleMicToggle}
            title={isListening ? "Stop listening" : "Voice input"}
          >
            <AppIcon name={isListening ? "pause" : "music"} size={16} />
          </button>
        )}
        <button
          className="assistant-chat__send-btn"
          onClick={handleSend}
          disabled={isStreaming || !inputValue.trim()}
          title="Send message"
        >
          <AppIcon name="chevron-right" size={16} />
        </button>
        {conversationId && (
          <button
            className="assistant-chat__end-btn"
            onClick={endConversation}
            title="End conversation"
          >
            <AppIcon name="close" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
