import type { ComponentPropsWithoutRef } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useConversation } from "../../hooks/useConversation";
import {
  useActionPipeline,
  serializeActionFeedback,
} from "../../hooks/useActionPipeline";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import {
  assistantApi,
  ratingsApi,
  notesApi,
  favoritesApi,
  hiddenGamesApi,
} from "../../services/tauri";
import { useSettingsStore } from "../../store/settingsSlice";
import { resolveExecutor } from "../../utils/commandPalette";
import { parseReviewFromResponse } from "../../utils/reviewParser";
import { stripActions } from "../../utils/actionParser";
import { logger } from "../../utils/logger";
import type { ResolvedAction, ActionResult, PaletteContext } from "../../types";
import type { AiMessage } from "../../types/assistant";
import { AppIcon } from "../common/AppIcon";
import { ReviewConfirmation } from "./ReviewConfirmation";
import { ActionConfirmationCard } from "./ActionConfirmationCard";
import { ReviewConfirmationCard } from "./ReviewConfirmationCard";
import { NoteConfirmationCard } from "./NoteConfirmationCard";
import "./AssistantChat.css";
import "./ActionConfirmationCard.css";

// Module-scope constants — stable references prevent react-markdown re-processing
const REMARK_PLUGINS = [remarkGfm];

const MARKDOWN_COMPONENTS = {
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

/** Memoized message bubble — skips re-render when id/role/content are unchanged. */
const MessageBubble = memo(function MessageBubble({
  role,
  content,
}: {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}) {
  return role === "assistant" ? (
    <Markdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
      {stripActions(content)}
    </Markdown>
  ) : (
    <>{content}</>
  );
});

/** Isolated input bar — zero JS runs during typing. Auto-grow via CSS field-sizing. */
const ChatInputBar = memo(function ChatInputBar({
  onSend,
  isStreaming,
  cloudAiEnabled,
}: {
  onSend: (text: string) => void;
  isStreaming: boolean;
  cloudAiEnabled: boolean;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    transcript,
    isListening,
    isSupported,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition();

  // Inject speech recognition transcript directly into the DOM element
  useEffect(() => {
    if (!isListening && transcript && inputRef.current) {
      const prev = inputRef.current.value;
      inputRef.current.value = prev ? prev + " " + transcript : transcript;
    }
  }, [isListening, transcript]);

  const disabled = isStreaming || !cloudAiEnabled;

  const handleSend = useCallback(() => {
    const text = inputRef.current?.value.trim() ?? "";
    if (!text || disabled) return;
    onSend(text);
    if (inputRef.current) inputRef.current.value = "";
  }, [disabled, onSend]);

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
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  return (
    <div
      className={`assistant-chat__input-bar ${!cloudAiEnabled ? "assistant-chat__input-bar--disabled" : ""}`}
    >
      <textarea
        ref={inputRef}
        className="assistant-chat__input"
        rows={1}
        placeholder={cloudAiEnabled ? "Type a message..." : "Cloud AI is disabled"}
        defaultValue=""
        onKeyDown={handleKeyDown}
        disabled={disabled}
        maxLength={10000}
      />
      {isSupported && cloudAiEnabled && (
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
        disabled={disabled}
        title={cloudAiEnabled ? "Send message" : "Cloud AI is disabled"}
      >
        <AppIcon name="chevron-right" size={16} />
      </button>
    </div>
  );
});

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

interface PendingReview {
  gameId: string;
  gameName: string;
  durationMinutes: number;
}

interface AssistantChatProps {
  avatarId: string;
  conversationId: string | null;
  onConversationStart?: () => void;
  /** Called synchronously BEFORE the end-conversation IPC call starts.
   *  Used to set dedup flags before Rust emits ai-conversation-ended. */
  onConversationEnding?: () => void;
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
  /** Override Tier 1 action execution (overlay relays to main window via IPC). */
  executeTier1?: (action: ResolvedAction) => ActionResult;
}

export function AssistantChat({
  avatarId,
  conversationId,
  onConversationStart,
  onConversationEnding,
  onConversationEnd,
  compact,
  isFirstConversation,
  hideEndButton,
  onStaleReset,
  pendingReview,
  onPendingReviewConsumed,
  navigate,
  executeTier1,
}: AssistantChatProps) {
  const cloudAiEnabled = useSettingsStore((s) => s.settings?.cloudAiEnabled === true);
  const maxOutputTokens = useSettingsStore((s) =>
    compact ? s.settings?.aiMaxTokensOverlay : s.settings?.aiMaxTokensMain,
  );

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
  } = useConversation({ avatarId, conversationId, maxOutputTokens, cloudAiEnabled });

  const noop = useCallback(() => {}, []);
  const pipeline = useActionPipeline({ navigate: navigate ?? noop, executeTier1 });

  const [stagedActions, setStagedActions] = useState<ResolvedAction[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Track which conversationId has been greeted — prevents duplicate greetings
  // from StrictMode double-mount, sendMessage dep changes, etc. (KI #8)
  const introSentForRef = useRef<string | null>(null);

  // Ref-sync for props/callbacks read inside async effects (avoids stale closures)
  const callbacksRef = useRef({
    isFirstConversation,
    onStaleReset,
    onConversationEnd,
    onPendingReviewConsumed,
  });
  callbacksRef.current = {
    isFirstConversation,
    onStaleReset,
    onConversationEnd,
    onPendingReviewConsumed,
  };

  // Phase 12: Review state
  const reviewInjectedRef = useRef(false);
  const [reviewContext, setReviewContext] = useState<PendingReview | null>(null);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [showReviewConfirm, setShowReviewConfirm] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
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
      callbacksRef.current.onConversationEnd?.();
    }
  }, [isEnded]);

  useEffect(() => {
    if (!conversationId) return;
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
          callbacksRef.current.onStaleReset?.();
          return;
        }
      } catch {
        // Stale check failed — fall through to normal flow
      }

      // Step 2: Normal flow — load history and optionally send greeting
      const history = await loadHistory(conversationId!);
      setHistoryLoaded(true);
      if (history.length === 0) {
        const prompt = callbacksRef.current.isFirstConversation
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

  // Phase 13: Stage resolved actions for user approval (no auto-execution)
  useEffect(() => {
    if (pendingActions.length > 0) {
      setStagedActions(pendingActions);
      clearPendingActions();
    }
  }, [pendingActions, clearPendingActions]);

  // Clear staged actions when a cross-window user message arrives.
  // Local sends already clear via onSendRef; this catches the other window's messages.
  // We skip history-load events (prevMessages.length === 0) so that action cards
  // restored from the last assistant message aren't immediately cleared.
  const prevMessagesRef = useRef<AiMessage[]>([]);
  useEffect(() => {
    const prev = prevMessagesRef.current;
    if (messages.length > prev.length && prev.length > 0) {
      const newMsgs = messages.slice(prev.length);
      if (newMsgs.some((m) => m.role === "user")) {
        setStagedActions([]);
      }
    }
    prevMessagesRef.current = messages;
  }, [messages]);

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
    pipeline.cancelAll();
    const pipelineResults = pipeline.consumeResults();
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
    onConversationStart?.();
  };
  const stableOnSend = useCallback((text: string) => {
    onSendRef.current(text);
  }, []);

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
        logger.error("AssistantChat", "ai", "Note save failed", { error: msg });
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
      {conversationId && !hideEndButton && !isCompacting && (
        <div className="assistant-chat__top-bar">
          <button
            className="assistant-chat__end-btn"
            onClick={() => {
              onConversationEnding?.();
              endConversation();
            }}
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
            {!cloudAiEnabled && (
              <div className="assistant-chat__disabled-banner">
                <AppIcon name="assistant" size={32} />
                <p>
                  Cloud AI is disabled. Enable it in{" "}
                  <strong>Settings &rarr; Assistant</strong> to chat with your assistant.
                </p>
              </div>
            )}
            {cloudAiEnabled && messages.length === 0 && !isStreaming && (
              <div className="assistant-chat__empty">
                <AppIcon name="assistant" size={48} />
                <p>Start a conversation with your assistant.</p>
              </div>
            )}
            {messages.map((msg) => {
              const parsed =
                msg.id === lastReviewMsgId ? parseReviewFromResponse(msg.content) : null;
              return (
                <div
                  key={msg.id}
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
              );
            })}

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
                  <Markdown
                    remarkPlugins={REMARK_PLUGINS}
                    components={MARKDOWN_COMPONENTS}
                  >
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
                  const desc = action.description ?? "";
                  const fallbackStars = desc.match(
                    /(\d+(?:\.\d+)?)\s*(?:\/\s*5|[-\s]star)/i,
                  );
                  const fallbackText = desc.match(/['"\u201C](.{10,500})['"\u201D]/);
                  const reviewStars =
                    (action.payload?.stars as number) ??
                    (fallbackStars ? parseFloat(fallbackStars[1]) : 3);
                  const reviewText =
                    (action.payload?.text as string) ??
                    (fallbackText ? fallbackText[1] : "");
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

          <ChatInputBar
            onSend={stableOnSend}
            isStreaming={isStreaming}
            cloudAiEnabled={cloudAiEnabled}
          />
        </>
      )}
    </div>
  );
}
