import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type {
  AiAvatar,
  AiMessage,
  AiPersonality,
  Expression,
  ResolvedAction,
} from "../../types";
import { assistantApi, spriteApi } from "../../services/tauri";
import { useSettingsStore } from "../../store/settingsSlice";
import { useConversation } from "../../hooks/useConversation";
import { useAutoGreet } from "../../hooks/useAutoGreet";
import { useInactivityTimer } from "../../hooks/useInactivityTimer";
import { useExpressionEngine } from "../../hooks/useExpressionEngine";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";

export interface ConversationContextValue {
  /** Active avatar, or null if none exists yet (first-run). */
  activeAvatar: AiAvatar | null;
  /** All available personalities. */
  personalities: AiPersonality[];
  /** Current conversation ID. */
  conversationId: string | null;
  /** Whether a conversation is currently active. */
  hasConversation: boolean;
  /** @deprecated No longer used — first-conversation detection is now DB-driven in useAutoGreet. */
  isFirstConversation: boolean;
  /** Whether initial load is still in progress. */
  isLoading: boolean;

  /** Inactivity timer state. */
  timerRemaining: number;
  timerIsPaused: boolean;
  timerIsActive: boolean;

  /** Pending compaction state (previous conversation that failed compaction). */
  pendingCompactionConvId: string | null;
  pendingCompactionAvatarId: string | null;
  isCompacting: boolean;
  compactionError: string | null;

  /** Whether there's a pending review to show. */
  pendingReview: PendingReview | null;

  /** Base64 data URL of the active avatar's sprite sheet, or null. */
  spriteDataUrl: string | null;
  /** Current expression for the active avatar's sprite. */
  expression: Expression;
  /** Expression engine callbacks for ChatCore to call. */
  onStreamStart: () => void;
  onStreamEnd: (t0Expression?: Expression) => void;
  onUserTyping: () => void;
  onUserSentMessage: () => void;

  /** Whether there are unread messages (bubble was collapsed when AI responded). */
  hasUnread: boolean;
  /** Clear the unread flag (called when bubble expands). */
  clearUnread: () => void;
  /** Mark as unread (called when AI responds while bubble is collapsed). */
  markUnread: () => void;

  // ── Conversation state (from useConversation hub) ──
  messages: AiMessage[];
  isStreaming: boolean;
  conversationError: string | null;
  currentStreamText: string;
  /** Whether current conversation is being compacted (end-conversation in flight). */
  isConversationCompacting: boolean;
  pendingActions: ResolvedAction[];
  t0Expression: Expression | null;
  cloudAiEnabled: boolean;
  /** Whether conversation history has been loaded (gates review injection). */
  historyLoaded: boolean;

  // ── Conversation actions (from useConversation hub) ──
  sendMessage: (
    text: string,
    options?: { hidden?: boolean; actionFeedback?: string },
  ) => Promise<void>;
  retry: () => Promise<void>;
  endActiveConversation: () => Promise<void>;
  injectMessage: (msg: AiMessage) => void;
  clearPendingActions: () => void;
  clearT0Expression: () => void;

  // ── Lifecycle actions ──
  /** Called when first-run wizard completes. */
  handleFirstRunComplete: (avatarId: string, convId: string) => Promise<void>;
  /** Called synchronously BEFORE end-conversation IPC (for dedup). */
  handleConversationEnding: () => void;
  /** Called when a new message is sent (resets inactivity timer). */
  handleConversationStart: () => void;
  /** Tell Rust timer whether the user is viewing the conversation (bubble open or /assistant page). */
  setTimerViewing: (viewing: boolean) => void;

  // ── Avatar management ──
  handleAvatarSwitch: (avatarId: string) => Promise<void>;
  handleAvatarDeleted: () => Promise<void>;
  handleAvatarDataWiped: (avatarId: string) => Promise<void>;
  /** Re-fetch the active avatar from the backend (e.g. after sprite assignment). */
  refreshActiveAvatar: () => Promise<void>;

  // ── Compaction ──
  handleCompactNow: () => Promise<void>;
  handleCopyRawData: () => Promise<void>;
  handlePasteResponse: (pasteValue: string) => Promise<void>;

  // ── Post-session review ──
  consumePendingReview: () => void;
}

export interface PendingReview {
  gameId: string;
  gameName: string;
  durationMinutes: number;
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

export function useConversationContext(): ConversationContextValue {
  const ctx = useContext(ConversationContext);
  if (!ctx) {
    throw new Error("useConversationContext must be used within ConversationProvider");
  }
  return ctx;
}

interface ConversationProviderProps {
  children: ReactNode;
}

export function ConversationProvider({ children }: ConversationProviderProps) {
  const [activeAvatar, setActiveAvatar] = useState<AiAvatar | null>(null);
  const [personalities, setPersonalities] = useState<AiPersonality[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasConversation, setHasConversation] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  // Post-session review
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);

  // Compaction state (pending retry from previous failed compaction)
  const [pendingCompactionConvId, setPendingCompactionConvId] = useState<string | null>(
    null,
  );
  const [pendingCompactionAvatarId, setPendingCompactionAvatarId] = useState<
    string | null
  >(null);
  const [isCompacting, setIsCompacting] = useState(false);
  const [compactionError, setCompactionError] = useState<string | null>(null);

  const { remaining, isPaused, isActive, resetTimer } = useInactivityTimer({
    conversationId,
    avatarId: activeAvatar?.id ?? null,
  });

  // Sprite data URL — loaded when active avatar's imagePath changes
  const [spriteDataUrl, setSpriteDataUrl] = useState<string | null>(null);
  useEffect(() => {
    const imagePath = activeAvatar?.imagePath;
    if (!imagePath) {
      setSpriteDataUrl(null);
      return;
    }
    let canceled = false;
    spriteApi
      .readSprite(imagePath)
      .then((base64) => {
        if (!canceled) setSpriteDataUrl(base64);
      })
      .catch(() => {
        if (!canceled) {
          logger.warn("ConversationProvider", "api", "Failed to load active sprite", {
            imagePath,
          });
          setSpriteDataUrl(null);
        }
      });
    return () => {
      canceled = true;
    };
  }, [activeAvatar?.imagePath]);

  // Expression engine — driven by ChatCore stream/typing events
  const avatarHasSprite = activeAvatar?.imagePath != null;
  const expressionEngine = useExpressionEngine(avatarHasSprite);

  // ── useConversation hub — single instance for the main window ──
  const cloudAiEnabled = useSettingsStore((s) => s.settings?.cloudAiEnabled === true);
  const maxOutputTokens = useSettingsStore((s) => s.settings?.aiMaxTokensMain);

  const conversation = useConversation({
    avatarId: activeAvatar?.id ?? "",
    conversationId,
    maxOutputTokens,
    cloudAiEnabled,
  });

  // ── Initial load ──
  useEffect(() => {
    async function load() {
      try {
        const avatar = await assistantApi.getActiveAvatar();
        setActiveAvatar(avatar);
        if (avatar) {
          const personalityList = await assistantApi.listPersonalities();
          setPersonalities(personalityList);

          // Silently resume orphaned conversations
          const orphans = await assistantApi.checkOrphanedConversations(avatar.id);
          if (orphans.length > 0) {
            setConversationId(orphans[0]);
            setHasConversation(true);
            return;
          }

          // Check for pending compaction
          const pendingCompactions =
            await assistantApi.getCompactionPendingConversations();
          if (pendingCompactions.length > 0) {
            const [convId, avatarId] = pendingCompactions[0];
            setPendingCompactionConvId(convId);
            setPendingCompactionAvatarId(avatarId);
          }

          const convId = await assistantApi.startConversation(avatar.id);
          setConversationId(convId);
          setHasConversation(true);
        }
      } catch (err) {
        logger.error("ConversationProvider", "api", "Failed to load assistant", {
          error: getErrorMessage(err),
        });
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // ── Post-session review from sessionStorage ──
  useEffect(() => {
    const raw = sessionStorage.getItem("pendingReview");
    if (raw) {
      sessionStorage.removeItem("pendingReview");
      try {
        setPendingReview(JSON.parse(raw));
      } catch {
        // Invalid payload, ignore
      }
    }
  }, []);

  const consumePendingReview = useCallback(() => {
    setPendingReview(null);
  }, []);

  // ── Conversation lifecycle ──
  const handleConversationEnding = useCallback(() => {
    // no-op placeholder — previously used for dedup flag
  }, []);

  const handleConversationEnd = useCallback(async () => {
    if (!activeAvatar) return;
    try {
      const newConvId = await assistantApi.startConversation(activeAvatar.id);
      setConversationId(newConvId);
      setHasConversation(true);
    } catch (err) {
      logger.error(
        "ConversationProvider",
        "api",
        "Failed to start new conversation after end",
        { error: getErrorMessage(err) },
      );
      setConversationId(null);
      setHasConversation(false);
    }
  }, [activeAvatar]);

  // React to useConversation's isEnded — auto-restart on manual end, go idle on timer.
  useEffect(() => {
    if (!conversation.isEnded || !activeAvatar) return;
    if (conversation.endReason === "timer") {
      // Timer auto-end: go idle, don't restart
      setConversationId(null);
      setHasConversation(false);
    } else {
      // Manual end: auto-restart with a new conversation
      handleConversationEnd();
    }
  }, [conversation.isEnded, conversation.endReason, activeAvatar, handleConversationEnd]);

  const handleConversationStart = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  const handleStaleReset = useCallback(async () => {
    if (!activeAvatar) return;
    try {
      const convId = await assistantApi.startConversation(activeAvatar.id);
      setConversationId(convId);
      setHasConversation(true);
    } catch (err) {
      logger.error(
        "ConversationProvider",
        "api",
        "Failed to start fresh conversation after stale reset",
        { error: getErrorMessage(err) },
      );
    }
  }, [activeAvatar]);

  // ── Auto-greeting + stale check ──
  const autoGreetResult = useAutoGreet({
    conversationId,
    avatarId: activeAvatar?.id ?? null,
    loadHistory: conversation.loadHistory,
    sendMessage: conversation.sendMessage,
    onStaleReset: handleStaleReset,
  });

  const historyLoaded = autoGreetResult.historyLoaded;

  // ── First-run wizard ──
  const handleFirstRunComplete = useCallback(
    async (_avatarId: string, convId: string) => {
      try {
        const avatar = await assistantApi.getActiveAvatar();
        setActiveAvatar(avatar);
        setConversationId(convId);
        setHasConversation(true);
        const personalityList = await assistantApi.listPersonalities();
        setPersonalities(personalityList);
      } catch (err) {
        logger.error("ConversationProvider", "api", "Post-first-run init failed", {
          error: getErrorMessage(err),
        });
      }
    },
    [],
  );

  // ── Avatar management ──
  const handleAvatarSwitch = useCallback(
    async (avatarId: string) => {
      try {
        if (conversationId && activeAvatar) {
          await assistantApi.endConversation(conversationId, activeAvatar.id);
        }
        expressionEngine.onAvatarSwitched();
        const avatar = await assistantApi.getActiveAvatar();
        setActiveAvatar(avatar);
        const convId = await assistantApi.startConversation(avatarId);
        setConversationId(convId);
        setHasConversation(true);
      } catch (err) {
        logger.error("ConversationProvider", "api", "Failed after avatar switch", {
          error: getErrorMessage(err),
        });
      }
    },
    [conversationId, activeAvatar, expressionEngine],
  );

  const handleAvatarDeleted = useCallback(async () => {
    try {
      const avatar = await assistantApi.getActiveAvatar();
      setActiveAvatar(avatar);
      if (!avatar) {
        setConversationId(null);
        setHasConversation(false);
      }
    } catch (err) {
      logger.error(
        "ConversationProvider",
        "api",
        "Failed to refresh after avatar deletion",
        { error: getErrorMessage(err) },
      );
    }
  }, []);

  const handleAvatarDataWiped = useCallback(
    async (avatarId: string) => {
      if (avatarId === activeAvatar?.id) {
        if (conversationId) {
          await assistantApi.endConversation(conversationId, avatarId).catch(() => {});
        }
        try {
          const convId = await assistantApi.startConversation(avatarId);
          setConversationId(convId);
          setHasConversation(true);
        } catch (err) {
          logger.error(
            "ConversationProvider",
            "api",
            "Failed to restart after data wipe",
            { error: getErrorMessage(err) },
          );
          setConversationId(null);
          setHasConversation(false);
        }
      }
    },
    [activeAvatar, conversationId],
  );

  // ── Compaction ──
  const handleCompactNow = useCallback(async () => {
    if (!pendingCompactionConvId || !pendingCompactionAvatarId) return;
    setIsCompacting(true);
    setCompactionError(null);
    try {
      await assistantApi.retryCompaction(
        pendingCompactionConvId,
        pendingCompactionAvatarId,
      );
      setPendingCompactionConvId(null);
      setPendingCompactionAvatarId(null);
    } catch (err) {
      setCompactionError(getErrorMessage(err));
    } finally {
      setIsCompacting(false);
    }
  }, [pendingCompactionConvId, pendingCompactionAvatarId]);

  const handleCopyRawData = useCallback(async () => {
    if (!pendingCompactionConvId) return;
    try {
      const rawData = await assistantApi.getCompactionRawData(pendingCompactionConvId);
      await navigator.clipboard.writeText(rawData);
    } catch (err) {
      setCompactionError(getErrorMessage(err));
    }
  }, [pendingCompactionConvId]);

  const handlePasteResponse = useCallback(
    async (pasteValue: string) => {
      if (!pendingCompactionConvId || !pendingCompactionAvatarId || !pasteValue.trim())
        return;
      setIsCompacting(true);
      setCompactionError(null);
      try {
        await assistantApi.applyExternalCompaction(
          pendingCompactionConvId,
          pendingCompactionAvatarId,
          pasteValue.trim(),
        );
        setPendingCompactionConvId(null);
        setPendingCompactionAvatarId(null);
      } catch (err) {
        setCompactionError(getErrorMessage(err));
      } finally {
        setIsCompacting(false);
      }
    },
    [pendingCompactionConvId, pendingCompactionAvatarId],
  );

  // ── Refresh active avatar (e.g. after sprite assignment) ──
  const refreshActiveAvatar = useCallback(async () => {
    try {
      const avatar = await assistantApi.getActiveAvatar();
      setActiveAvatar(avatar);
    } catch (err) {
      logger.error("ConversationProvider", "api", "Failed to refresh active avatar", {
        error: getErrorMessage(err),
      });
    }
  }, []);

  // ── Timer viewing ──
  const setTimerViewing = useCallback((viewing: boolean) => {
    assistantApi.setConversationTimerViewing(viewing).catch((err) => {
      logger.warn("ConversationProvider", "api", "Failed to set timer viewing", {
        error: getErrorMessage(err),
      });
    });
  }, []);

  // ── Unread ──
  const clearUnread = useCallback(() => setHasUnread(false), []);
  const markUnread = useCallback(() => setHasUnread(true), []);

  const value: ConversationContextValue = {
    activeAvatar,
    personalities,
    conversationId,
    hasConversation,
    isFirstConversation: false,
    isLoading,
    spriteDataUrl,
    expression: conversation.isCompacting ? "sleepy" : expressionEngine.expression,
    onStreamStart: expressionEngine.onStreamStart,
    onStreamEnd: expressionEngine.onStreamEnd,
    onUserTyping: expressionEngine.onUserTyping,
    onUserSentMessage: expressionEngine.onUserSentMessage,
    timerRemaining: remaining,
    timerIsPaused: isPaused,
    timerIsActive: isActive,
    pendingCompactionConvId,
    pendingCompactionAvatarId,
    isCompacting,
    compactionError,
    pendingReview,
    hasUnread,
    clearUnread,
    markUnread,

    // Conversation state (from useConversation hub)
    messages: conversation.messages,
    isStreaming: conversation.isStreaming,
    conversationError: conversation.error,
    currentStreamText: conversation.currentStreamText,
    isConversationCompacting: conversation.isCompacting,
    pendingActions: conversation.pendingActions,
    t0Expression: conversation.t0Expression,
    cloudAiEnabled,
    historyLoaded,
    sendMessage: conversation.sendMessage,
    retry: conversation.retry,
    endActiveConversation: conversation.endConversation,
    injectMessage: conversation.injectMessage,
    clearPendingActions: conversation.clearPendingActions,
    clearT0Expression: conversation.clearT0Expression,

    handleFirstRunComplete,
    handleConversationEnding,
    handleConversationStart,
    setTimerViewing,
    handleAvatarSwitch,
    handleAvatarDeleted,
    handleAvatarDataWiped,
    refreshActiveAvatar,
    handleCompactNow,
    handleCopyRawData,
    handlePasteResponse,
    consumePendingReview,
  };

  return (
    <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>
  );
}
