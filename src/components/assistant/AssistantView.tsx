import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useConversationContext } from "./ConversationProvider";
import { getAvatarColor } from "../../utils/avatarColors";
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
  const {
    activeAvatar,
    personalities,
    conversationId,
    hasConversation,
    isFirstConversation,
    isLoading,
    timerRemaining,
    timerIsPaused,
    timerIsActive,
    pendingCompactionConvId,
    isCompacting,
    compactionError,
    pendingReview,
    consumePendingReview,
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
  } = useConversationContext();

  const [activeTab, setActiveTab] = useState<TabId>("chat");
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteValue, setPasteValue] = useState("");

  // Wrap avatar switch to also switch to chat tab locally
  const onAvatarSwitch = useCallback(
    async (avatarId: string) => {
      await handleAvatarSwitch(avatarId);
      setActiveTab("chat");
    },
    [handleAvatarSwitch],
  );

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
          {hasConversation &&
            timerIsActive &&
            !(timerIsPaused && timerRemaining === 3600) && (
              <div className="assistant-view__timer">
                {timerIsPaused
                  ? "Timer paused (game active)"
                  : `Timeout: ${formatTimer(timerRemaining)}`}
              </div>
            )}
        </aside>

        <div className="assistant-view__content">
          {/* Compaction retry banner */}
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
                onPendingReviewConsumed={consumePendingReview}
                navigate={navigate}
              />
            )}
            {activeTab === "memories" && <AssistantMemories avatarId={activeAvatar.id} />}
            {activeTab === "journals" && <AssistantJournals avatarId={activeAvatar.id} />}
            {activeTab === "avatar" && (
              <AssistantAvatars
                activeAvatarId={activeAvatar.id}
                onAvatarSwitch={onAvatarSwitch}
                onAvatarDeleted={handleAvatarDeleted}
                onAvatarDataWiped={handleAvatarDataWiped}
              />
            )}
          </div>
        </div>
      </div>

      {/* Paste Response Modal */}
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
                onClick={() => handlePasteResponse(pasteValue)}
                disabled={isCompacting || !pasteValue.trim()}
              >
                {isCompacting ? "Processing..." : "Apply"}
              </button>
              <button
                className="assistant-view__recovery-btn"
                onClick={() => {
                  setShowPasteModal(false);
                  setPasteValue("");
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
