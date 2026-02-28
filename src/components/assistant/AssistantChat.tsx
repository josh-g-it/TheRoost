import type { ComponentPropsWithoutRef } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useConversation } from "../../hooks/useConversation";
import {
  useActionPipeline,
  serializeActionFeedback,
} from "../../hooks/useActionPipeline";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { assistantApi, ratingsApi, notesApi } from "../../services/tauri";
import { useFavoritesStore } from "../../store/favoritesSlice";
import { useHiddenGamesStore } from "../../store/hiddenGamesSlice";
import { useSettingsStore } from "../../store/settingsSlice";
import { resolveExecutor } from "../../utils/commandPalette";
import { parseReviewFromResponse } from "../../utils/reviewParser";
import { stripActions } from "../../utils/actionParser";
import { logger } from "../../utils/logger";
import type { ResolvedAction, ActionResult, PaletteContext } from "../../types";
import { AppIcon } from "../common/AppIcon";
import { ReviewConfirmation } from "./ReviewConfirmation";
import { ActionConfirmationCard } from "./ActionConfirmationCard";
import { ReviewConfirmationCard } from "./ReviewConfirmationCard";
import { NoteConfirmationCard } from "./NoteConfirmationCard";
import "./AssistantChat.css";
import "./ActionConfirmationCard.css";

interface PendingReview {
  gameId: string;
  gameName: string;
  durationMinutes: number;
}

interface AssistantChatProps {
  avatarId: string;
  conversationId: string | null;
  onConversationStart?: () => void;
  /** Called when a locally-triggered conversation end completes (compaction done). */
  onConversationEnd?: () => void;
  compact?: boolean;
  isFirstConversation?: boolean;
  hideEndButton?: boolean;
  onStaleReset?: () => void;
  pendingReview?: PendingReview | null;
  onPendingReviewConsumed?: () => void;
  /** Navigate function for action execution — provided by router-based parents. */
  navigate?: (path: string) => void;
}

export function AssistantChat({
  avatarId,
  conversationId,
  onConversationStart,
  onConversationEnd,
  compact,
  isFirstConversation,
  hideEndButton,
  onStaleReset,
  pendingReview,
  onPendingReviewConsumed,
  navigate,
}: AssistantChatProps) {
  const settings = useSettingsStore((s) => s.settings);
  const maxOutputTokens = compact
    ? settings?.aiMaxTokensOverlay
    : settings?.aiMaxTokensMain;

  const {
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
  } = useConversation({ avatarId, conversationId, maxOutputTokens });

  const noop = useCallback(() => {}, []);
  const pipeline = useActionPipeline({ navigate: navigate ?? noop });

  const {
    transcript,
    isListening,
    isSupported,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition();

  const [inputValue, setInputValue] = useState("");
  const [stagedActions, setStagedActions] = useState<ResolvedAction[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const introSentRef = useRef(false);
  const isFirstConversationRef = useRef(isFirstConversation);
  isFirstConversationRef.current = isFirstConversation;
  const onStaleResetRef = useRef(onStaleReset);
  onStaleResetRef.current = onStaleReset;
  const onConversationEndRef = useRef(onConversationEnd);
  onConversationEndRef.current = onConversationEnd;
  const isEndedRef = useRef(isEnded);
  isEndedRef.current = isEnded;

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
    setStagedActions([]);
  }, [conversationId]);

  // Notify parent when a locally-triggered conversation end completes
  useEffect(() => {
    if (isEnded) {
      onConversationEndRef.current?.();
    }
  }, [isEnded]);

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

  // Phase 13: Stage resolved actions for user approval (no auto-execution)
  useEffect(() => {
    if (pendingActions.length > 0) {
      setStagedActions(pendingActions);
      clearPendingActions();
    }
  }, [pendingActions, clearPendingActions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, currentStreamText, pipeline.state.status]);

  useEffect(() => {
    if (!isListening && transcript) {
      setInputValue((prev) => (prev ? prev + " " + transcript : transcript));
    }
  }, [isListening, transcript]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;
    // Cancel any active pipeline (adds remaining actions as canceled to feedback ref)
    pipeline.cancelAll();
    // Consume results for feedback injection, then reset pipeline
    const pipelineResults = pipeline.consumeResults();
    // Create "skipped by user" results for any staged (not yet started) actions
    const skippedResults: ActionResult[] = stagedActions.map((a) => ({
      actionId: a.actionId,
      originalActionId: a.originalActionId,
      success: false,
      error: "Skipped by user (new message sent)",
      executedAt: new Date().toISOString(),
    }));
    const allResults = [...pipelineResults, ...skippedResults];
    const feedback = serializeActionFeedback(allResults);
    pipeline.reset();
    setStagedActions([]);
    sendMessage(text, feedback ? { actionFeedback: feedback } : undefined);
    setInputValue("");
    onConversationStart?.();
  }, [
    inputValue,
    isStreaming,
    sendMessage,
    onConversationStart,
    pipeline,
    stagedActions,
  ]);

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

  // ── Run/dismiss staged actions ──────────────────────────────────
  const handleRunActions = useCallback(() => {
    if (stagedActions.length === 0) return;
    pipeline.setActions(stagedActions);
    setStagedActions([]);
  }, [stagedActions, pipeline]);

  const handleDismissActions = useCallback(() => {
    setStagedActions([]);
  }, []);

  // ── Phase 13c: Tier 2 action execution helpers ─────────────────
  const makeResult = useCallback(
    (action: ResolvedAction, success: boolean, error?: string): ActionResult => ({
      actionId: action.actionId,
      originalActionId: action.originalActionId,
      success,
      error,
      executedAt: new Date().toISOString(),
    }),
    [],
  );

  const handleTier2Confirm = useCallback(
    async (action: ResolvedAction) => {
      const prefix = action.actionId.split(":")[0];
      const gameId = action.actionId.includes(":")
        ? action.actionId.slice(prefix.length + 1)
        : "";

      try {
        switch (prefix) {
          case "favorite":
            await useFavoritesStore.getState().toggleFavorite(gameId);
            break;
          case "hide":
            await useHiddenGamesStore.getState().toggleHidden(gameId);
            break;
          case "rate": {
            const stars = (action.payload?.stars as number) ?? 3;
            await ratingsApi.saveGameRating(gameId, Math.round(stars * 2), null);
            break;
          }
          case "action":
          default: {
            // action:refresh, action:scan-external, etc. — use command palette executor
            const executor = resolveExecutor(action.actionId);
            if (executor) {
              const ctx: PaletteContext = {
                navigate: navigate ?? (() => {}),
                closeCommandCenter: () => {},
                settings: {} as PaletteContext["settings"],
                saveSettings: () => {},
              };
              executor(ctx);
            }
            break;
          }
        }
        pipeline.confirmTier2(action, makeResult(action, true));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("AssistantChat", "ai", "Tier 2 action failed", {
          actionId: action.actionId,
          error: msg,
        });
        pipeline.confirmTier2(action, makeResult(action, false, msg));
      }
    },
    [navigate, pipeline, makeResult],
  );

  const handleReviewConfirmAction = useCallback(
    async (action: ResolvedAction, stars: number, reviewText: string) => {
      const gameId = action.actionId.slice("review:".length);
      try {
        await ratingsApi.saveGameRating(
          gameId,
          Math.round(stars * 2),
          reviewText || null,
        );
        pipeline.confirmTier2(action, makeResult(action, true));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("AssistantChat", "ai", "Review save failed", { error: msg });
        pipeline.confirmTier2(action, makeResult(action, false, msg));
      }
    },
    [pipeline, makeResult],
  );

  const handleNoteConfirmAction = useCallback(
    async (action: ResolvedAction, noteText: string) => {
      const gameId = action.actionId.slice("note:".length);
      try {
        await notesApi.saveGameNote(gameId, noteText);
        pipeline.confirmTier2(action, makeResult(action, true));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("AssistantChat", "ai", "Note save failed", { error: msg });
        pipeline.confirmTier2(action, makeResult(action, false, msg));
      }
    },
    [pipeline, makeResult],
  );

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
                        {stripActions(msg.content)}
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

            {/* Staged actions — user must click Run or Dismiss */}
            {stagedActions.length > 0 && pipeline.state.status === "idle" && (
              <div className="assistant-chat__run-actions">
                <div className="assistant-chat__run-actions-summary">
                  {stagedActions.map((a, i) => (
                    <span key={i} className="assistant-chat__run-actions-tag">
                      {a.description ?? a.originalActionId}
                    </span>
                  ))}
                </div>
                <div className="assistant-chat__run-actions-buttons">
                  <button
                    className="assistant-chat__run-actions-btn"
                    onClick={handleRunActions}
                  >
                    Run {stagedActions.length} action
                    {stagedActions.length !== 1 ? "s" : ""}
                  </button>
                  <button
                    className="assistant-chat__run-actions-dismiss"
                    onClick={handleDismissActions}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {isStreaming && (
              <div className="assistant-chat__streaming">
                {currentStreamText ? (
                  <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {stripActions(currentStreamText)}
                  </Markdown>
                ) : null}
                <span className="assistant-chat__streaming-cursor" />
              </div>
            )}

            {/* Phase 13c: Tier 2 confirmation cards */}
            {pipeline.state.status === "paused" &&
              (() => {
                const action = pipeline.state.actions[pipeline.state.currentIndex];
                if (!action) return null;
                const prefix = action.actionId.split(":")[0];

                if (prefix === "review") {
                  return (
                    <ReviewConfirmationCard
                      gameName={action.resolvedName ?? action.originalActionId}
                      stars={(action.payload?.stars as number) ?? 3}
                      reviewText={(action.payload?.text as string) ?? ""}
                      onConfirm={(stars, text) =>
                        handleReviewConfirmAction(action, stars, text)
                      }
                      onDeny={pipeline.denyTier2}
                    />
                  );
                }

                if (prefix === "note") {
                  return (
                    <NoteConfirmationCard
                      gameName={action.resolvedName ?? action.originalActionId}
                      noteText={(action.payload?.text as string) ?? ""}
                      onConfirm={(text) => handleNoteConfirmAction(action, text)}
                      onDeny={pipeline.denyTier2}
                    />
                  );
                }

                return (
                  <ActionConfirmationCard
                    description={
                      action.description ?? `Execute: ${action.originalActionId}`
                    }
                    onConfirm={() => handleTier2Confirm(action)}
                    onDeny={pipeline.denyTier2}
                  />
                );
              })()}

            {pipeline.state.status === "canceled" &&
              pipeline.state.actions.length > 0 && (
                <div className="action-canceled-text">Remaining actions canceled.</div>
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
              {messages.some((m) => m.role === "user") ? (
                <button className="assistant-chat__retry-btn" onClick={retry}>
                  Retry
                </button>
              ) : (
                <button className="assistant-chat__retry-btn" onClick={endConversation}>
                  New Conversation
                </button>
              )}
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
