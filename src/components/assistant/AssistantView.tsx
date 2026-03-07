import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AiAvatar, AiPersonality, ConversationEndedPayload } from "../../types";
import { assistantApi } from "../../services/tauri";
import { useInactivityTimer } from "../../hooks/useInactivityTimer";
import { useEventListener } from "../../hooks/useEventListener";
import { getAvatarColor } from "../../utils/avatarColors";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { Header } from "../layout/Header";
import { AssistantFirstRun } from "./AssistantFirstRun";
import { AssistantChat } from "./AssistantChat";
import { AssistantMemories } from "./AssistantMemories";
import { AssistantJournals } from "./AssistantJournals";
import { AssistantAvatars } from "./AssistantAvatars";
import "./AssistantView.css";

type TabId = "chat" | "memories" | "journals" | "avatar";

const TABS: { id: TabId; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "memories", label: "Memories" },
  { id: "journals", label: "Journals" },
  { id: "avatar", label: "Avatar" },
];

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AssistantView() {
  const navigate = useNavigate();
  const [activeAvatar, setActiveAvatar] = useState<AiAvatar | null>(null);
  const [personalities, setPersonalities] = useState<AiPersonality[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("chat");
  const [isLoading, setIsLoading] = useState(true);
  const [hasConversation, setHasConversation] = useState(false);
  const [isFirstConversation, setIsFirstConversation] = useState(false);

  // Phase 12: Post-session review
  const [pendingReview, setPendingReview] = useState<{
    gameId: string;
    gameName: string;
    durationMinutes: number;
  } | null>(null);

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

  // Phase 10: Error recovery state
  const [pendingCompactionConvId, setPendingCompactionConvId] = useState<string | null>(
    null,
  );
  const [pendingCompactionAvatarId, setPendingCompactionAvatarId] = useState<
    string | null
  >(null);
  const [isCompacting, setIsCompacting] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [compactionError, setCompactionError] = useState<string | null>(null);

  const { remaining, isPaused, isActive, resetTimer } = useInactivityTimer({
    conversationId,
    avatarId: activeAvatar?.id ?? null,
  });

  useEffect(() => {
    async function load() {
      try {
        const avatar = await assistantApi.getActiveAvatar();
        setActiveAvatar(avatar);
        if (avatar) {
          const personalityList = await assistantApi.listPersonalities();
          setPersonalities(personalityList);

          // Phase 10: Silently resume orphaned conversations
          const orphans = await assistantApi.checkOrphanedConversations(avatar.id);
          if (orphans.length > 0) {
            setConversationId(orphans[0]);
            setHasConversation(true);
            return; // Resume the existing conversation
          }

          // Phase 10: Check for pending compaction
          const pendingCompactions =
            await assistantApi.getCompactionPendingConversations();
          if (pendingCompactions.length > 0) {
            const [convId, avatarId] = pendingCompactions[0];
            setPendingCompactionConvId(convId);
            setPendingCompactionAvatarId(avatarId);
            // Still start a normal new conversation — compaction banner is non-blocking
          }

          const convId = await assistantApi.startConversation(avatar.id);
          setConversationId(convId);
          setHasConversation(true);
        }
      } catch (err) {
        logger.error("AssistantView", "api", "Failed to load assistant", {
          error: getErrorMessage(err),
        });
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // Track local manual ends to prevent event handler from double-acting.
  // Set BEFORE the IPC call via onConversationEnding so the flag is true
  // when the ai-conversation-ended event arrives during the IPC. (KI #8)
  const localManualEndRef = useRef(false);

  const handleConversationEnding = useCallback(() => {
    localManualEndRef.current = true;
  }, []);

  // Handle locally-triggered conversation end (called after compaction completes)
  const handleConversationEnd = useCallback(async () => {
    if (!activeAvatar) return;
    try {
      const newConvId = await assistantApi.startConversation(activeAvatar.id);
      setConversationId(newConvId);
      setHasConversation(true);
    } catch (err) {
      logger.error("AssistantView", "api", "Failed to start new conversation after end", {
        error: getErrorMessage(err),
      });
      setConversationId(null);
      setHasConversation(false);
    }
  }, [activeAvatar]);

  // Listen for conversation-ended events (cross-window manual ends + timer auto-ends)
  useEventListener<ConversationEndedPayload>(
    "ai-conversation-ended",
    async (event) => {
      const { conversationId: endedConvId, reason } = event.payload;
      if (endedConvId !== conversationId) return;

      // Skip if this was a locally-triggered manual end (handled by onConversationEnd)
      if (reason === "manual" && localManualEndRef.current) {
        localManualEndRef.current = false;
        return;
      }

      if (reason === "manual" && activeAvatar) {
        // Cross-window manual end — auto-restart
        try {
          const newConvId = await assistantApi.startConversation(activeAvatar.id);
          setConversationId(newConvId);
          setHasConversation(true);
        } catch (err) {
          logger.error("AssistantView", "api", "Failed to auto-restart conversation", {
            error: getErrorMessage(err),
          });
          setConversationId(null);
          setHasConversation(false);
        }
      } else {
        // Timer auto-end or other — go idle
        setConversationId(null);
        setHasConversation(false);
      }
    },
    [conversationId, activeAvatar],
  );

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
        logger.error("AssistantView", "api", "Post-first-run init failed", {
          error: getErrorMessage(err),
        });
      }
    },
    [],
  );

  const handleStaleReset = useCallback(async () => {
    if (!activeAvatar) return;
    try {
      const convId = await assistantApi.startConversation(activeAvatar.id);
      setConversationId(convId);
      setHasConversation(true);
    } catch (err) {
      logger.error(
        "AssistantView",
        "api",
        "Failed to start fresh conversation after stale reset",
        {
          error: getErrorMessage(err),
        },
      );
    }
  }, [activeAvatar]);

  const handleConversationStart = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  const handleAvatarSwitch = useCallback(
    async (avatarId: string) => {
      try {
        // End current conversation before switching
        // (endConversation already stops the timer internally via stop_timer)
        if (conversationId && activeAvatar) {
          await assistantApi.endConversation(conversationId, activeAvatar.id);
        }
        const avatar = await assistantApi.getActiveAvatar();
        setActiveAvatar(avatar);
        const convId = await assistantApi.startConversation(avatarId);
        setConversationId(convId);
        setHasConversation(true);
        setActiveTab("chat");
      } catch (err) {
        logger.error("AssistantView", "api", "Failed after avatar switch", {
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
        // Last avatar was deleted — clear conversation state so timer stops
        setConversationId(null);
        setHasConversation(false);
      }
    } catch (err) {
      logger.error("AssistantView", "api", "Failed to refresh after avatar deletion", {
        error: getErrorMessage(err),
      });
    }
  }, []);

  const handleAvatarDataWiped = useCallback(
    async (avatarId: string) => {
      // If the wiped avatar is the active one, the current conversation is stale
      if (avatarId === activeAvatar?.id) {
        // End the now-stale conversation gracefully (ignore errors — data is already gone)
        if (conversationId) {
          await assistantApi.endConversation(conversationId, avatarId).catch(() => {});
        }
        // Start a fresh conversation
        try {
          const convId = await assistantApi.startConversation(avatarId);
          setConversationId(convId);
          setHasConversation(true);
        } catch (err) {
          logger.error("AssistantView", "api", "Failed to restart after data wipe", {
            error: getErrorMessage(err),
          });
          setConversationId(null);
          setHasConversation(false);
        }
      }
    },
    [activeAvatar, conversationId],
  );

  // Phase 10: Compaction banner handlers
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

  const handlePasteResponse = useCallback(async () => {
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
      setShowPasteModal(false);
      setPasteValue("");
    } catch (err) {
      setCompactionError(getErrorMessage(err));
    } finally {
      setIsCompacting(false);
    }
  }, [pendingCompactionConvId, pendingCompactionAvatarId, pasteValue]);

  if (isLoading) {
    return (
      <div className="assistant-view">
        <Header title="Assistant" />
        <div className="assistant-view__body">
          <p style={{ padding: "2rem", color: "var(--color-text-tertiary)" }}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  if (!activeAvatar) {
    return (
      <div className="assistant-view">
        <Header title="Assistant" />
        <div className="assistant-view__body">
          <AssistantFirstRun onComplete={handleFirstRunComplete} />
        </div>
      </div>
    );
  }

  const personalityName =
    personalities.find((p) => p.id === activeAvatar.personalityId)?.name ?? "Unknown";

  return (
    <div className="assistant-view">
      <Header title="Assistant" subtitle={activeAvatar.name} />
      <div className="assistant-view__body">
        <aside className="assistant-view__avatar-panel">
          <div
            className="assistant-view__avatar-circle"
            style={{ background: getAvatarColor(activeAvatar.name) }}
          >
            {activeAvatar.name.charAt(0).toUpperCase()}
          </div>
          <div className="assistant-view__avatar-name">{activeAvatar.name}</div>
          <div className="assistant-view__avatar-personality">{personalityName}</div>
          <div className="assistant-view__avatar-status">
            <span
              className={`assistant-view__status-dot ${hasConversation ? "assistant-view__status-dot--active" : "assistant-view__status-dot--idle"}`}
            />
            {hasConversation ? "In conversation" : "Idle"}
          </div>
          {hasConversation && isActive && !(isPaused && remaining === 3600) && (
            <div className="assistant-view__timer">
              {isPaused
                ? "Timer paused (game active)"
                : `Timeout: ${formatTimer(remaining)}`}
            </div>
          )}
        </aside>

        <div className="assistant-view__content">
          {/* Phase 10: Compaction retry banner */}
          {pendingCompactionConvId && (
            <div className="assistant-view__recovery-banner assistant-view__recovery-banner--compaction">
              <span className="assistant-view__recovery-text">
                A previous conversation needs to be processed.
              </span>
              {compactionError && (
                <span className="assistant-view__recovery-error">{compactionError}</span>
              )}
              <div className="assistant-view__recovery-actions">
                <button
                  className="assistant-view__recovery-btn assistant-view__recovery-btn--primary"
                  onClick={handleCompactNow}
                  disabled={isCompacting}
                >
                  {isCompacting ? "Processing..." : "Compact Now"}
                </button>
                <button
                  className="assistant-view__recovery-btn"
                  onClick={handleCopyRawData}
                  title="Copy the full compaction request to clipboard for use with an external AI"
                >
                  Copy Raw Data
                </button>
                <button
                  className="assistant-view__recovery-btn"
                  onClick={() => setShowPasteModal(true)}
                  title="Paste a compaction response generated by an external AI (advanced)"
                >
                  Paste Response
                </button>
              </div>
            </div>
          )}

          <div className="assistant-view__tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`assistant-view__tab ${activeTab === tab.id ? "assistant-view__tab--active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="assistant-view__tab-content">
            {activeTab === "chat" && (
              <AssistantChat
                avatarId={activeAvatar.id}
                conversationId={conversationId}
                onConversationStart={handleConversationStart}
                onConversationEnding={handleConversationEnding}
                onConversationEnd={handleConversationEnd}
                isFirstConversation={isFirstConversation}
                onStaleReset={handleStaleReset}
                pendingReview={pendingReview}
                onPendingReviewConsumed={() => setPendingReview(null)}
                navigate={navigate}
              />
            )}
            {activeTab === "memories" && <AssistantMemories avatarId={activeAvatar.id} />}
            {activeTab === "journals" && <AssistantJournals avatarId={activeAvatar.id} />}
            {activeTab === "avatar" && (
              <AssistantAvatars
                activeAvatarId={activeAvatar.id}
                onAvatarSwitch={handleAvatarSwitch}
                onAvatarDeleted={handleAvatarDeleted}
                onAvatarDataWiped={handleAvatarDataWiped}
              />
            )}
          </div>
        </div>
      </div>

      {/* Phase 10: Paste Response Modal */}
      {showPasteModal && (
        <div
          className="assistant-view__paste-modal-backdrop"
          onClick={() => setShowPasteModal(false)}
        >
          <div
            className="assistant-view__paste-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="assistant-view__paste-modal-title">
              Paste Compaction Response
            </h3>
            <p className="assistant-view__paste-modal-desc">
              Paste the JSON response from an external AI. It must have this structure:
            </p>
            <pre className="assistant-view__paste-modal-example">
              {`{
  "summary": "...",
  "memories": [
    { "content": "...", "importance": 1-10, "category": "preference|opinion|fact|general" }
  ],
  "supersededMemories": ["memory-id-1", ...]
}`}
            </pre>
            <textarea
              className="assistant-view__paste-modal-textarea"
              value={pasteValue}
              onChange={(e) => setPasteValue(e.target.value)}
              placeholder="Paste JSON here..."
              rows={10}
            />
            {compactionError && (
              <div className="assistant-view__paste-modal-error">{compactionError}</div>
            )}
            <div className="assistant-view__paste-modal-actions">
              <button
                className="assistant-view__recovery-btn assistant-view__recovery-btn--primary"
                onClick={handlePasteResponse}
                disabled={isCompacting || !pasteValue.trim()}
              >
                {isCompacting ? "Processing..." : "Apply"}
              </button>
              <button
                className="assistant-view__recovery-btn"
                onClick={() => {
                  setShowPasteModal(false);
                  setPasteValue("");
                  setCompactionError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
