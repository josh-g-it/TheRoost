import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { AiAvatar, AiPersonality, ConversationEndedPayload } from "../../types";
import { assistantApi } from "../../services/tauri";
import { useInactivityTimer } from "../../hooks/useInactivityTimer";
import { useEventListener } from "../../hooks/useEventListener";
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
  /** Whether the very first conversation just started (for greeting). */
  isFirstConversation: boolean;
  /** Whether initial load is still in progress. */
  isLoading: boolean;

  /** Inactivity timer state. */
  timerRemaining: number;
  timerIsPaused: boolean;
  timerIsActive: boolean;

  /** Pending compaction state. */
  pendingCompactionConvId: string | null;
  pendingCompactionAvatarId: string | null;
  isCompacting: boolean;
  compactionError: string | null;

  /** Whether there's a pending review to show. */
  pendingReview: PendingReview | null;

  /** Whether there are unread messages (bubble was collapsed when AI responded). */
  hasUnread: boolean;
  /** Clear the unread flag (called when bubble expands). */
  clearUnread: () => void;
  /** Mark as unread (called when AI responds while bubble is collapsed). */
  markUnread: () => void;

  // ── Lifecycle actions ──
  /** Called when first-run wizard completes. */
  handleFirstRunComplete: (avatarId: string, convId: string) => Promise<void>;
  /** Called synchronously BEFORE end-conversation IPC (for dedup). */
  handleConversationEnding: () => void;
  /** Called when a locally-triggered conversation end completes. */
  handleConversationEnd: () => Promise<void>;
  /** Called when a new message is sent (resets inactivity timer). */
  handleConversationStart: () => void;
  /** Called to reset stale conversation. */
  handleStaleReset: () => Promise<void>;

  // ── Avatar management ──
  handleAvatarSwitch: (avatarId: string) => Promise<void>;
  handleAvatarDeleted: () => Promise<void>;
  handleAvatarDataWiped: (avatarId: string) => Promise<void>;

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

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [activeAvatar, setActiveAvatar] = useState<AiAvatar | null>(null);
  const [personalities, setPersonalities] = useState<AiPersonality[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasConversation, setHasConversation] = useState(false);
  const [isFirstConversation, setIsFirstConversation] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  // Post-session review
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);

  // Compaction state
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

  // Track local manual ends to prevent event handler from double-acting (KI #8)
  const localManualEndRef = useRef(false);

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
    localManualEndRef.current = true;
  }, []);

  const handleConversationEnd = useCallback(async () => {
    if (!activeAvatar) return;
    // After the first conversation ends, subsequent ones are not "first"
    setIsFirstConversation(false);
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

  // Cross-window conversation-ended events
  useEventListener<ConversationEndedPayload>(
    "ai-conversation-ended",
    async (event) => {
      const { conversationId: endedConvId, reason } = event.payload;
      if (endedConvId !== conversationId) return;

      if (reason === "manual" && localManualEndRef.current) {
        localManualEndRef.current = false;
        return;
      }

      setIsFirstConversation(false);

      if (reason === "manual" && activeAvatar) {
        try {
          const newConvId = await assistantApi.startConversation(activeAvatar.id);
          setConversationId(newConvId);
          setHasConversation(true);
        } catch (err) {
          logger.error(
            "ConversationProvider",
            "api",
            "Failed to auto-restart conversation",
            { error: getErrorMessage(err) },
          );
          setConversationId(null);
          setHasConversation(false);
        }
      } else {
        setConversationId(null);
        setHasConversation(false);
      }
    },
    [conversationId, activeAvatar],
  );

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

  // ── First-run wizard ──
  const handleFirstRunComplete = useCallback(
    async (_avatarId: string, convId: string) => {
      try {
        const avatar = await assistantApi.getActiveAvatar();
        setActiveAvatar(avatar);
        setConversationId(convId);
        setHasConversation(true);
        setIsFirstConversation(true);
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
    [conversationId, activeAvatar],
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

  // ── Unread ──
  const clearUnread = useCallback(() => setHasUnread(false), []);
  const markUnread = useCallback(() => setHasUnread(true), []);

  const value: ConversationContextValue = {
    activeAvatar,
    personalities,
    conversationId,
    hasConversation,
    isFirstConversation,
    isLoading,
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
    handleFirstRunComplete,
    handleConversationEnding,
    handleConversationEnd,
    handleConversationStart,
    handleStaleReset,
    handleAvatarSwitch,
    handleAvatarDeleted,
    handleAvatarDataWiped,
    handleCompactNow,
    handleCopyRawData,
    handlePasteResponse,
    consumePendingReview,
  };

  return (
    <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>
  );
}
