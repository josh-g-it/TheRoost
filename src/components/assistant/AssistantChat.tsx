import type { ComponentPropsWithoutRef } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useConversation } from "../../hooks/useConversation";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { assistantApi, ratingsApi } from "../../services/tauri";
import { parseReviewFromResponse } from "../../utils/reviewParser";
import { AppIcon } from "../common/AppIcon";
import { ReviewConfirmation } from "./ReviewConfirmation";
import "./AssistantChat.css";

interface PendingReview {
  gameId: string;
  gameName: string;
  durationMinutes: number;
}

interface AssistantChatProps {
  avatarId: string;
  conversationId: string | null;
  onConversationStart?: () => void;
  compact?: boolean;
  isFirstConversation?: boolean;
  hideEndButton?: boolean;
  onStaleReset?: () => void;
  pendingReview?: PendingReview | null;
  onPendingReviewConsumed?: () => void;
}

export function AssistantChat({
  avatarId,
  conversationId,
  onConversationStart,
  compact,
  isFirstConversation,
  hideEndButton,
  onStaleReset,
  pendingReview,
  onPendingReviewConsumed,
}: AssistantChatProps) {
  const {
    messages,
    isStreaming,
    error,
    currentStreamText,
    isCompacting,
    sendMessage,
    retry,
    endConversation,
    loadHistory,
    injectMessage,
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
  const isFirstConversationRef = useRef(isFirstConversation);
  isFirstConversationRef.current = isFirstConversation;
  const onStaleResetRef = useRef(onStaleReset);
  onStaleResetRef.current = onStaleReset;

  // Phase 12: Review state
  const reviewInjectedRef = useRef(false);
  const [reviewContext, setReviewContext] = useState<PendingReview | null>(null);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [showReviewConfirm, setShowReviewConfirm] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const pendingReviewRef = useRef(pendingReview);
  pendingReviewRef.current = pendingReview;
  const onPendingReviewConsumedRef = useRef(onPendingReviewConsumed);
  onPendingReviewConsumedRef.current = onPendingReviewConsumed;

  useEffect(() => {
    introSentRef.current = false;
    reviewInjectedRef.current = false;
    setReviewContext(null);
    setReviewSaved(false);
    setReviewDismissed(false);
    setShowReviewConfirm(false);
    setHistoryLoaded(false);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    async function loadAndGreet() {
      // Step 1: Check staleness (with error recovery)
      try {
        const isStale = await assistantApi.checkConversationStale(conversationId!);
        if (isStale) {
          await assistantApi.abandonConversation(conversationId!);
          onStaleResetRef.current?.();
          return;
        }
      } catch {
        // Stale check failed — fall through to normal flow
      }

      // Step 2: Normal flow — load history and optionally send greeting
      const history = await loadHistory(conversationId!);
      setHistoryLoaded(true);
      if (history.length === 0 && !introSentRef.current) {
        introSentRef.current = true;
        const prompt = isFirstConversationRef.current
          ? "This is your very first conversation with the user. They just created you. Introduce yourself warmly — tell them your name, ask what they'd like to be called, and ask how they prefer conversations (casual, detailed, brief). Be yourself and be curious."
          : "A new conversation has started. This message is sent automatically by the system, not by the user. Greet the user warmly as someone you already know. Keep it brief and natural — maybe reference something from your memories or just say hello and ask what's on their mind.";
        sendMessage(prompt, { hidden: true });
      }
    }
    loadAndGreet();
  }, [conversationId, loadHistory, sendMessage]);

  // Phase 12: Handle pending review after conversation is ready
  useEffect(() => {
    if (!pendingReview || !conversationId || reviewInjectedRef.current || !historyLoaded)
      return;
    reviewInjectedRef.current = true;
    setReviewContext(pendingReview);

    const hasUserMessages = messages.some((m) => m.role === "user");

    if (hasUserMessages) {
      // Active conversation — show confirmation button instead of auto-injecting
      setShowReviewConfirm(true);
    } else {
      // Fresh conversation — inject a local greeting from the assistant
      const { gameName, durationMinutes } = pendingReview;
      const durationDisplay =
        durationMinutes >= 60
          ? `${(durationMinutes / 60).toFixed(1)} hours`
          : `${durationMinutes} minutes`;

      injectMessage({
        id: crypto.randomUUID(),
        conversationId,
        role: "assistant",
        content: `You just finished playing **${gameName}** for ${durationDisplay}! What did you think? Tell me about your session and I'll help you write a review.`,
        createdAt: new Date().toISOString(),
        tokenEstimate: 30,
      });
    }

    onPendingReviewConsumedRef.current?.();
  }, [pendingReview, conversationId, messages, injectMessage, historyLoaded]);

  // Phase 12: Handle review confirmation in active conversation
  const handleReviewConfirm = useCallback(() => {
    if (!reviewContext) return;
    setShowReviewConfirm(false);
    const { gameName, durationMinutes } = reviewContext;
    const durationDisplay =
      durationMinutes >= 60
        ? `${(durationMinutes / 60).toFixed(1)} hours`
        : `${durationMinutes} minutes`;
    sendMessage(
      `I've just finished my session of ${gameName} that lasted ${durationDisplay} and I'd like to tell you about it so you can help me leave a review.`,
    );
    onConversationStart?.();
  }, [reviewContext, sendMessage, onConversationStart]);

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
      {conversationId && !hideEndButton && !isCompacting && (
        <div className="assistant-chat__top-bar">
          <button
            className="assistant-chat__end-btn"
            onClick={endConversation}
            disabled={isStreaming}
          >
            <AppIcon name="close" size={14} />
            <span>End Conversation</span>
          </button>
        </div>
      )}

      <div className="assistant-chat__messages">
        {isCompacting ? (
          <div className="assistant-chat__compacting">
            <div className="assistant-chat__compacting-icon">
              <AppIcon name="assistant" size={48} />
            </div>
            <div className="assistant-chat__compacting-text">Storing memories...</div>
            <div className="assistant-chat__compacting-spinner" />
          </div>
        ) : (
          <>
            {messages.length === 0 && !isStreaming && (
              <div className="assistant-chat__empty">
                <AppIcon name="assistant" size={48} />
                <p>Start a conversation with your assistant.</p>
              </div>
            )}
            {(() => {
              // Find the last assistant message that contains a valid review
              const lastReviewMsgId =
                reviewContext && !reviewSaved && !reviewDismissed
                  ? ([...messages]
                      .reverse()
                      .find(
                        (m) =>
                          m.role === "assistant" &&
                          parseReviewFromResponse(m.content) !== null,
                      )?.id ?? null)
                  : null;

              return messages.map((msg) => {
                const parsed =
                  msg.id === lastReviewMsgId
                    ? parseReviewFromResponse(msg.content)
                    : null;
                return (
                  <div
                    key={msg.id}
                    className={`assistant-chat__message assistant-chat__message--${msg.role}`}
                  >
                    {msg.role === "assistant" ? (
                      <Markdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {msg.content}
                      </Markdown>
                    ) : (
                      msg.content
                    )}
                    {parsed && (
                      <ReviewConfirmation
                        gameId={reviewContext!.gameId}
                        gameName={reviewContext!.gameName}
                        stars={parsed.stars}
                        reviewText={parsed.reviewText}
                        onSave={async (gameId, stars, reviewText) => {
                          try {
                            await ratingsApi.saveGameRating(
                              gameId,
                              Math.round(stars * 2),
                              reviewText || null,
                            );
                            setReviewSaved(true);
                          } catch {
                            // Save failed — keep ReviewConfirmation visible so user can retry
                          }
                        }}
                        onSkip={() => setReviewDismissed(true)}
                      />
                    )}
                  </div>
                );
              });
            })()}

            {/* Phase 12: Review confirmation banner for active conversations */}
            {showReviewConfirm && reviewContext && (
              <div className="assistant-chat__review-confirm">
                <span className="assistant-chat__review-confirm-text">
                  You just finished playing <strong>{reviewContext.gameName}</strong>.
                  Want to leave a review?
                </span>
                <div className="assistant-chat__review-confirm-actions">
                  <button
                    className="assistant-chat__review-confirm-btn assistant-chat__review-confirm-btn--yes"
                    onClick={handleReviewConfirm}
                  >
                    Yes, let's review
                  </button>
                  <button
                    className="assistant-chat__review-confirm-btn"
                    onClick={() => setShowReviewConfirm(false)}
                  >
                    Not now
                  </button>
                </div>
              </div>
            )}

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
          </>
        )}
      </div>

      {!isCompacting && (
        <>
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
          </div>
        </>
      )}
    </div>
  );
}
