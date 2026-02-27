import { useCallback, useEffect, useRef, useState } from "react";
import type { AiAvatar, AiPersonality } from "../../types";
import { assistantApi } from "../../services/tauri";
import { useInactivityTimer } from "../../hooks/useInactivityTimer";
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
  const [activeAvatar, setActiveAvatar] = useState<AiAvatar | null>(null);
  const [personalities, setPersonalities] = useState<AiPersonality[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("chat");
  const [isLoading, setIsLoading] = useState(true);
  const [hasConversation, setHasConversation] = useState(false);

  const isEndingRef = useRef(false);
  const handleTimeout = useCallback(async () => {
    if (isEndingRef.current) return;
    if (conversationId && activeAvatar) {
      isEndingRef.current = true;
      try {
        await assistantApi.endConversation(conversationId, activeAvatar.id);
        logger.info("AssistantView", "api", "Conversation ended due to inactivity");
        setConversationId(null);
        setHasConversation(false);
      } catch (err) {
        logger.error("AssistantView", "api", "Failed to end conversation on timeout", {
          error: getErrorMessage(err),
        });
      } finally {
        isEndingRef.current = false;
      }
    }
  }, [conversationId, activeAvatar]);

  const { remaining, isPaused, resetTimer } = useInactivityTimer({
    onTimeout: handleTimeout,
  });

  useEffect(() => {
    async function load() {
      try {
        const avatar = await assistantApi.getActiveAvatar();
        setActiveAvatar(avatar);
        if (avatar) {
          const personalityList = await assistantApi.listPersonalities();
          setPersonalities(personalityList);
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
        logger.error("AssistantView", "api", "Post-first-run init failed", {
          error: getErrorMessage(err),
        });
      }
    },
    [],
  );

  const handleConversationStart = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  const handleAvatarSwitch = useCallback(
    async (avatarId: string) => {
      try {
        // End current conversation before switching
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
          {hasConversation && (
            <div className="assistant-view__timer">
              {isPaused
                ? "Timer paused (game active)"
                : `Timeout: ${formatTimer(remaining)}`}
            </div>
          )}
        </aside>

        <div className="assistant-view__content">
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
              />
            )}
            {activeTab === "memories" && <AssistantMemories avatarId={activeAvatar.id} />}
            {activeTab === "journals" && <AssistantJournals avatarId={activeAvatar.id} />}
            {activeTab === "avatar" && (
              <AssistantAvatars
                activeAvatarId={activeAvatar.id}
                onAvatarSwitch={handleAvatarSwitch}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
