import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AiAvatar, AiPersonality } from "../../types";
import { assistantApi } from "../../services/tauri";
import { getAvatarColor } from "../../utils/avatarColors";
import { AssistantChat } from "../assistant/AssistantChat";
import "./OverlayAssistant.css";

export function OverlayAssistant() {
  const [activeAvatar, setActiveAvatar] = useState<AiAvatar | null>(null);
  const [personalities, setPersonalities] = useState<AiPersonality[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [hasCheckedAvatar, setHasCheckedAvatar] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const isEndingRef = useRef(false);

  // Load avatar + start conversation on mount
  useEffect(() => {
    mountedRef.current = true;
    async function load() {
      try {
        const avatar = await assistantApi.getActiveAvatar();
        if (!mountedRef.current) return;
        setActiveAvatar(avatar);
        if (avatar) {
          const [personalityList, convId] = await Promise.all([
            assistantApi.listPersonalities(),
            assistantApi.startConversation(avatar.id),
          ]);
          if (!mountedRef.current) return;
          setPersonalities(personalityList);
          setConversationId(convId);
        }
      } catch {
        // Load failed silently — will show no-avatar state
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
          setHasCheckedAvatar(true);
        }
      }
    }
    load();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Listen for cross-window conversation-ended events
  useEffect(() => {
    const unlisten = listen<string>("ai-conversation-ended", (event) => {
      const endedConvId = event.payload;
      if (endedConvId === conversationId) {
        setConversationId(null);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [conversationId]);

  // Close dropdown on click outside
  useEffect(() => {
    if (!showMore) return;
    const handler = (e: Event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [showMore]);

  // Close dropdown on Escape
  useEffect(() => {
    if (!showMore) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setShowMore(false);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [showMore]);

  const handleOpenFullAssistant = useCallback(() => {
    invoke("show_main_and_navigate", { route: "/assistant" }).catch(() => {});
  }, []);

  const handleEndConversation = useCallback(async () => {
    if (!conversationId || !activeAvatar) return;
    if (isEndingRef.current) return;
    isEndingRef.current = true;
    try {
      await assistantApi.endConversation(conversationId, activeAvatar.id);
      setConversationId(null);
      setShowMore(false);
    } catch {
      // End conversation failed silently
    } finally {
      isEndingRef.current = false;
    }
  }, [conversationId, activeAvatar]);

  if (isLoading) {
    return (
      <div className="overlay-assistant">
        <div className="overlay-assistant__loading">Loading...</div>
      </div>
    );
  }

  if (hasCheckedAvatar && !activeAvatar) {
    return (
      <div className="overlay-assistant">
        <div
          className="overlay-assistant__no-avatar"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p>Set up your assistant in the main window</p>
          <button
            className="overlay-assistant__open-btn"
            onClick={handleOpenFullAssistant}
          >
            Open Full Assistant
          </button>
        </div>
      </div>
    );
  }

  if (!activeAvatar) return null;

  const personalityName =
    personalities.find((p) => p.id === activeAvatar.personalityId)?.name ?? "";

  return (
    <div className="overlay-assistant">
      <div className="overlay-assistant__avatar-section">
        <div
          className="overlay-assistant__avatar-circle"
          style={{ background: getAvatarColor(activeAvatar.name) }}
        >
          {activeAvatar.name.charAt(0).toUpperCase()}
        </div>
        <div className="overlay-assistant__avatar-name">{activeAvatar.name}</div>
        {personalityName && (
          <div className="overlay-assistant__avatar-personality">{personalityName}</div>
        )}
      </div>

      <div
        className="overlay-assistant__chat-section"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <AssistantChat
          compact
          hideEndButton
          avatarId={activeAvatar.id}
          conversationId={conversationId}
        />
      </div>

      <div
        className="overlay-assistant__controls"
        onPointerDown={(e) => e.stopPropagation()}
        ref={dropdownRef}
      >
        {showMore && (
          <div className="overlay-assistant__dropdown">
            <button
              className="overlay-assistant__dropdown-item"
              disabled
              title="Coming soon"
            >
              TTS: Off
            </button>
            <button
              className="overlay-assistant__dropdown-item"
              disabled
              title="Coming soon"
            >
              Screenshot: Off
            </button>
            <div className="overlay-assistant__dropdown-sep" />
            <button
              className="overlay-assistant__dropdown-item"
              onClick={handleEndConversation}
            >
              End Conversation
            </button>
            <button
              className="overlay-assistant__dropdown-item"
              onClick={handleOpenFullAssistant}
            >
              Open Full Assistant
            </button>
          </div>
        )}
        <button
          className="overlay-assistant__more-btn"
          onClick={() => setShowMore((prev) => !prev)}
        >
          More
        </button>
        <button className="overlay-assistant__end-btn" onClick={handleEndConversation}>
          End
        </button>
      </div>
    </div>
  );
}
