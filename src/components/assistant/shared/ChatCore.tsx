import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import {
  useActionPipeline,
  serializeActionFeedback,
} from "../../../hooks/useActionPipeline";
import {
  ratingsApi,
  notesApi,
  favoritesApi,
  hiddenGamesApi,
} from "../../../services/tauri";
import { resolveExecutor } from "../../../utils/commandPalette";
import { parseReviewFromResponse } from "../../../utils/reviewParser";
import { stripActions } from "../../../utils/actionParser";
import { logger } from "../../../utils/logger";
import type {
  AiMessage,
  ResolvedAction,
  ActionResult,
  Expression,
  PaletteContext,
} from "../../../types";
import { ReviewConfirmation } from "../ReviewConfirmation";
import { ActionConfirmationCard } from "../ActionConfirmationCard";
import { ReviewConfirmationCard } from "../ReviewConfirmationCard";
import { NoteConfirmationCard } from "../NoteConfirmationCard";
import { MessageBubble, REMARK_PLUGINS, MARKDOWN_COMPONENTS } from "./MessageBubble";
import { ChatInputBar } from "./ChatInputBar";
import { MessageList } from "./MessageList";
import "./ChatCore.css";
import "../ActionConfirmationCard.css";

/** Fetches existing note content on mount so NoteConfirmationCard can show it. */
function NoteConfirmationWrapper({
  action,
  onConfirm,
  onDeny,
}: {
  action: ResolvedAction;
  onConfirm: (action: ResolvedAction, text: string) => void;
  onDeny: () => void;
}) {
  const [existingContent, setExistingContent] = useState<string | undefined>();
  const gameId = action.actionId.slice("note:".length);

  useEffect(() => {
    notesApi
      .getGameNote(gameId)
      .then((note) => {
        if (note?.content?.trim()) setExistingContent(note.content);
      })
      .catch(() => {});
  }, [gameId]);

  return (
    <NoteConfirmationCard
      gameName={action.resolvedName ?? action.originalActionId}
      noteText={(action.payload?.text as string) ?? ""}
      existingContent={existingContent}
      onConfirm={(text) => onConfirm(action, text)}
      onDeny={onDeny}
    />
  );
}

export interface PendingReview {
  gameId: string;
  gameName: string;
  durationMinutes: number;
}

export interface ChatCoreProps {
  conversationId: string | null;
  compact?: boolean;

  // ── Conversation state (from ConversationProvider hub) ──
  messages: AiMessage[];
  isStreaming: boolean;
  error: string | null;
  currentStreamText: string;
  isCompacting: boolean;
  pendingActions: ResolvedAction[];
  t0Expression: Expression | null;
  cloudAiEnabled: boolean;
  /** Whether conversation history has been loaded (gates review injection). */
  historyLoaded: boolean;

  // ── Conversation actions (from ConversationProvider hub) ──
  sendMessage: (
    text: string,
    options?: { hidden?: boolean; actionFeedback?: string },
  ) => Promise<void>;
  retry: () => Promise<void>;
  endConversation: () => Promise<void>;
  injectMessage: (msg: AiMessage) => void;
  clearPendingActions: () => void;
  clearT0Expression: () => void;

  // ── Lifecycle callbacks ──
  onConversationStart?: () => void;
  /** Called synchronously BEFORE the end-conversation IPC call starts. */
  onConversationEnding?: () => void;
  hideEndButton?: boolean;
  pendingReview?: PendingReview | null;
  onPendingReviewConsumed?: () => void;
  /** Navigate function for action execution — provided by router-based parents. */
  navigate?: (path: string) => void;
  /** Override Tier 1 action execution (overlay relays to main window via IPC). */
  executeTier1?: (action: ResolvedAction) => ActionResult;
  /** Avatar name shown as label next to assistant messages. */
  avatarName?: string;
  /** Expression engine callbacks — driven by stream/typing events. */
  onExpressionStreamStart?: () => void;
  onExpressionStreamEnd?: (t0Expression?: Expression) => void;
  onExpressionUserTyping?: () => void;
  onExpressionUserSentMessage?: () => void;
}

export function ChatCore({
  conversationId,
  compact,
  messages,
  isStreaming,
  error,
  currentStreamText,
  isCompacting,
  pendingActions,
  t0Expression,
  cloudAiEnabled,
  historyLoaded,
  sendMessage,
  retry,
  endConversation,
  injectMessage,
  clearPendingActions,
  clearT0Expression,
  onConversationStart,
  onConversationEnding,
  hideEndButton,
  pendingReview,
  onPendingReviewConsumed,
  navigate,
  executeTier1,
  avatarName,
  onExpressionStreamStart,
  onExpressionStreamEnd,
  onExpressionUserTyping,
  onExpressionUserSentMessage,
}: ChatCoreProps) {
  const noop = useCallback(() => {}, []);
  const pipeline = useActionPipeline({ navigate: navigate ?? noop, executeTier1 });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Stable end-conversation callback for ChatInputBar memo
  const stableEndConversation = useCallback(() => {
    onConversationEnding?.();
    endConversation();
  }, [onConversationEnding, endConversation]);

  // Ref-sync for props/callbacks read inside async effects (avoids stale closures)
  const callbacksRef = useRef({
    onPendingReviewConsumed,
  });
  callbacksRef.current = {
    onPendingReviewConsumed,
  };

  // Phase 12: Review state
  const reviewInjectedRef = useRef(false);
  const [reviewContext, setReviewContext] = useState<PendingReview | null>(null);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [showReviewConfirm, setShowReviewConfirm] = useState(false);

  useEffect(() => {
    reviewInjectedRef.current = false;
    setReviewContext(null);
    setReviewSaved(false);
    setReviewDismissed(false);
    setShowReviewConfirm(false);
  }, [conversationId]);

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

    callbacksRef.current.onPendingReviewConsumed?.();
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

  // v1.12.1: Auto-execute actions — feed directly to pipeline (T1 auto-fires, T2 pauses)
  // Destructure stable callbacks to avoid re-running when pipeline.state changes.
  const pipelineSetActions = pipeline.setActions;
  useEffect(() => {
    if (pendingActions.length > 0) {
      pipelineSetActions(pendingActions);
      clearPendingActions();
    }
  }, [pendingActions, clearPendingActions, pipelineSetActions]);

  // Expression engine: detect stream start/end transitions
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (isStreaming && !wasStreamingRef.current) {
      // Stream just started
      onExpressionStreamStart?.();
    } else if (!isStreaming && wasStreamingRef.current) {
      // Stream just ended — apply T0 expression if present
      onExpressionStreamEnd?.(t0Expression ?? undefined);
      if (t0Expression) clearT0Expression();
    }
    wasStreamingRef.current = isStreaming;
  }, [
    isStreaming,
    t0Expression,
    clearT0Expression,
    onExpressionStreamStart,
    onExpressionStreamEnd,
  ]);

  // Scroll when messages change (new message added) or pipeline status changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, pipeline.state.status]);

  // During streaming, keep scrolled to bottom using a lightweight interval
  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      messagesEndRef.current?.scrollIntoView?.({ behavior: "instant" });
    }, 200);
    return () => clearInterval(interval);
  }, [isStreaming]);

  // Stable onSend callback — uses ref to avoid recreating on every render,
  // which would cause the memoized ChatInputBar to re-render on every parent update.
  const onSendRef = useRef<(text: string) => void>(() => {});
  onSendRef.current = (text: string) => {
    if (isStreaming) return;
    onExpressionUserSentMessage?.();
    pipeline.cancelAll();
    const pipelineResults = pipeline.consumeResults();
    const feedback = serializeActionFeedback(pipelineResults);
    pipeline.reset();
    sendMessage(text, feedback ? { actionFeedback: feedback } : undefined);
    onConversationStart?.();
  };
  const stableOnSend = useCallback((text: string) => {
    onSendRef.current(text);
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
          case "favorite": {
            // Use direct Tauri API instead of Zustand store (overlay stores are unhydrated)
            const allFavorites = await favoritesApi.getAllFavorites();
            const isFav = allFavorites.includes(gameId);
            await favoritesApi.toggleFavorite(gameId, !isFav);
            break;
          }
          case "hide": {
            // Use direct Tauri API instead of Zustand store (overlay stores are unhydrated)
            const allHidden = await hiddenGamesApi.getAllHidden();
            const isHid = allHidden.includes(gameId);
            await hiddenGamesApi.toggleHidden(gameId, !isHid);
            break;
          }
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
        logger.error("ChatCore", "ai", "Tier 2 action failed", {
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
        logger.error("ChatCore", "ai", "Review save failed", { error: msg });
        pipeline.confirmTier2(action, makeResult(action, false, msg));
      }
    },
    [pipeline, makeResult],
  );

  const handleNoteConfirmAction = useCallback(
    async (action: ResolvedAction, noteText: string) => {
      const gameId = action.actionId.slice("note:".length);
      try {
        // Fetch existing note content to append instead of replace
        const existing = await notesApi.getGameNote(gameId);
        let finalContent = noteText;
        if (existing && existing.content.trim()) {
          const timestamp = new Date().toLocaleString();
          finalContent =
            existing.content + `\n\n---\n[AI Note — ${timestamp}]\n` + noteText;
        }
        await notesApi.saveGameNote(gameId, finalContent);
        pipeline.confirmTier2(action, makeResult(action, true));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("ChatCore", "ai", "Note save failed", { error: msg });
        pipeline.confirmTier2(action, makeResult(action, false, msg));
      }
    },
    [pipeline, makeResult],
  );

  // Memoize review detection — avoids array copy+reverse+regex on every render
  const lastReviewMsgId = useMemo(() => {
    if (!reviewContext || reviewSaved || reviewDismissed) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && parseReviewFromResponse(m.content) !== null) {
        return m.id;
      }
    }
    return null;
  }, [messages, reviewContext, reviewSaved, reviewDismissed]);

  // Stable callbacks for ReviewConfirmation (Fix #6)
  const handleReviewSave = useCallback(
    async (gameId: string, stars: number, reviewText: string) => {
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
    },
    [],
  );

  const handleReviewSkip = useCallback(() => setReviewDismissed(true), []);

  return (
    <div className={`assistant-chat ${compact ? "assistant-chat--compact" : ""}`}>
      <MessageList
        isCompacting={isCompacting}
        isStreaming={isStreaming}
        cloudAiEnabled={cloudAiEnabled}
        messagesEmpty={messages.length === 0}
        messagesEndRef={messagesEndRef}
      >
        {messages.map((msg) => {
          const parsed =
            msg.id === lastReviewMsgId ? parseReviewFromResponse(msg.content) : null;
          return (
            <div
              key={msg.id}
              className={`assistant-chat__message-row assistant-chat__message-row--${msg.role}`}
            >
              {msg.role === "assistant" && !compact && (
                <span className="assistant-chat__msg-label">
                  {avatarName ?? "Assistant"}
                </span>
              )}
              <div
                className={`assistant-chat__message assistant-chat__message--${msg.role}`}
              >
                <MessageBubble id={msg.id} role={msg.role} content={msg.content} />
                {parsed && (
                  <ReviewConfirmation
                    gameId={reviewContext!.gameId}
                    gameName={reviewContext!.gameName}
                    stars={parsed.stars}
                    reviewText={parsed.reviewText}
                    onSave={handleReviewSave}
                    onSkip={handleReviewSkip}
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* Phase 12: Review confirmation banner for active conversations */}
        {showReviewConfirm && reviewContext && (
          <div className="assistant-chat__review-confirm">
            <span className="assistant-chat__review-confirm-text">
              You just finished playing <strong>{reviewContext.gameName}</strong>. Want to
              leave a review?
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
          <div className="assistant-chat__message-row assistant-chat__message-row--assistant">
            {!compact && (
              <span className="assistant-chat__msg-label">
                {avatarName ?? "Assistant"}
              </span>
            )}
            <div className="assistant-chat__streaming">
              {currentStreamText ? (
                <Markdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
                  {stripActions(currentStreamText)}
                </Markdown>
              ) : null}
              <span className="assistant-chat__streaming-cursor" />
            </div>
          </div>
        )}

        {/* Phase 13c: Tier 2 confirmation cards */}
        {pipeline.state.status === "paused" &&
          (() => {
            const action = pipeline.state.actions[pipeline.state.currentIndex];
            if (!action) return null;
            const prefix = action.actionId.split(":")[0];

            if (prefix === "review") {
              const desc = action.description ?? "";
              const fallbackStars = desc.match(/(\d+(?:\.\d+)?)\s*(?:\/\s*5|[-\s]star)/i);
              const fallbackText = desc.match(/['"\u201C](.{10,500})['"\u201D]/);
              const reviewStars =
                (action.payload?.stars as number) ??
                (fallbackStars ? parseFloat(fallbackStars[1]) : 3);
              const reviewText =
                (action.payload?.text as string) ?? (fallbackText ? fallbackText[1] : "");
              return (
                <ReviewConfirmationCard
                  gameName={action.resolvedName ?? action.originalActionId}
                  stars={reviewStars}
                  reviewText={reviewText}
                  onConfirm={(stars, text) =>
                    handleReviewConfirmAction(action, stars, text)
                  }
                  onDeny={pipeline.denyTier2}
                />
              );
            }

            if (prefix === "note") {
              return (
                <NoteConfirmationWrapper
                  action={action}
                  onConfirm={handleNoteConfirmAction}
                  onDeny={pipeline.denyTier2}
                />
              );
            }

            return (
              <ActionConfirmationCard
                description={action.description ?? `Execute: ${action.originalActionId}`}
                onConfirm={() => handleTier2Confirm(action)}
                onDeny={pipeline.denyTier2}
              />
            );
          })()}

        {pipeline.state.status === "canceled" && pipeline.state.actions.length > 0 && (
          <div className="action-canceled-text">Remaining actions canceled.</div>
        )}
      </MessageList>

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

          <ChatInputBar
            onSend={stableOnSend}
            isStreaming={isStreaming}
            cloudAiEnabled={cloudAiEnabled}
            onInput={onExpressionUserTyping}
            showEndButton={!!conversationId && !hideEndButton && !isCompacting}
            onEndConversation={conversationId ? stableEndConversation : undefined}
          />
        </>
      )}
    </div>
  );
}
