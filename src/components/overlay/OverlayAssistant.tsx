import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  AiAvatar,
  AiPersonality,
  ActionResult,
  ConversationEndedPayload,
  ResolvedAction,
} from "../../types";
import { assistantApi } from "../../services/tauri";
import { actionNeedsMainWindow } from "../../utils/commandPalette";
import { getAvatarColor } from "../../utils/avatarColors";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
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
  // Ref to track current conversationId for use in focus handler (avoids stale closures)
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  // Ref to track current avatar for use in focus handler
  const activeAvatarRef = useRef(activeAvatar);
  activeAvatarRef.current = activeAvatar;
  // Guard to prevent concurrent sync operations
  const isSyncingRef = useRef(false);

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
      } catch (err) {
        logger.warn("OverlayAssistant", "ui", "Failed to load assistant data", {
          error: getErrorMessage(err),
        });
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

  // Sync conversation state when the overlay window gains focus.
  // This prevents stale state when the main window ends/starts a conversation
  // while the overlay is hidden.
  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (!focused || !mountedRef.current) return;

      const avatar = activeAvatarRef.current;
      if (!avatar) return;
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      assistantApi
        .getActiveConversationId(avatar.id)
        .then((rustConvId) => {
          if (!mountedRef.current) return;
          const localConvId = conversationIdRef.current;

          if (rustConvId !== localConvId) {
            logger.info("OverlayAssistant", "ai", "Conversation state synced on focus", {
              from: localConvId,
              to: rustConvId,
            });
            if (rustConvId) {
              // Rust has an active conversation — adopt it
              setConversationId(rustConvId);
            } else {
              // No active conversation on Rust side — start a fresh one
              assistantApi
                .startConversation(avatar.id)
                .then((newId) => {
                  if (mountedRef.current) {
                    setConversationId(newId);
                  }
                })
                .catch(() => {
                  if (mountedRef.current) {
                    setConversationId(null);
                  }
                });
            }
          }
        })
        .catch(() => {
          // Sync failed silently — will retry on next focus
        })
        .finally(() => {
          isSyncingRef.current = false;
        });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for cross-window conversation-ended events — auto-restart on manual end
  useEffect(() => {
    let isMounted = true;
    let unlistenFn: (() => void) | null = null;

    listen<ConversationEndedPayload>("ai-conversation-ended", async (event) => {
      if (!isMounted) return;
      const { conversationId: endedConvId, reason } = event.payload;
      if (endedConvId !== conversationId) return;
      if (reason === "manual" && activeAvatar) {
        try {
          const newConvId = await assistantApi.startConversation(activeAvatar.id);
          if (isMounted) {
            setConversationId(newConvId);
          }
        } catch (err) {
          logger.warn("OverlayAssistant", "ui", "Auto-restart after end failed", {
            error: getErrorMessage(err),
          });
          if (isMounted) {
            setConversationId(null);
          }
        }
      } else {
        if (isMounted) {
          setConversationId(null);
        }
      }
    }).then((fn) => {
      if (isMounted) {
        unlistenFn = fn;
      } else {
        fn(); // Unmounted during setup — clean up immediately
      }
    });

    return () => {
      isMounted = false;
      unlistenFn?.();
    };
  }, [conversationId, activeAvatar]);

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

  const handleStaleReset = useCallback(async () => {
    if (!activeAvatar) return;
    try {
      const convId = await assistantApi.startConversation(activeAvatar.id);
      if (mountedRef.current) {
        setConversationId(convId);
      }
    } catch (err) {
      logger.warn("OverlayAssistant", "ui", "Stale reset failed", {
        error: getErrorMessage(err),
      });
    }
  }, [activeAvatar]);

  const handleNavigate = useCallback((path: string) => {
    invoke("show_main_and_navigate", { route: path }).catch((err: unknown) => {
      logger.warn("OverlayAssistant", "ui", "Navigate to main failed", {
        route: path,
        error: getErrorMessage(err),
      });
    });
  }, []);

  // Relay Tier 1 AI actions to the main window via IPC.
  // The overlay has isolated Zustand stores, so actions that modify UI state
  // (sort, filter, search, game selection) must execute in the main window.
  const executeTier1 = useCallback((action: ResolvedAction): ActionResult => {
    invoke("overlay_execute_palette_action", {
      actionId: action.actionId,
      gameId: null,
      showMain: actionNeedsMainWindow(action.actionId),
    }).catch((err: unknown) => {
      logger.warn("OverlayAssistant", "ai", "Failed to relay Tier 1 action", {
        actionId: action.actionId,
        error: getErrorMessage(err),
      });
    });
    return {
      actionId: action.actionId,
      originalActionId: action.originalActionId,
      success: true,
      executedAt: new Date().toISOString(),
    };
  }, []);

  const handleOpenFullAssistant = useCallback(() => {
    invoke("show_main_and_navigate", { route: "/assistant" }).catch((err: unknown) => {
      logger.warn("OverlayAssistant", "ui", "Failed to open full assistant", {
        error: getErrorMessage(err),
      });
    });
  }, []);

  const handleEndConversation = useCallback(async () => {
    if (!conversationId || !activeAvatar) return;
    if (isEndingRef.current) return;
    isEndingRef.current = true;
    try {
      await assistantApi.endConversation(conversationId, activeAvatar.id);
      setShowMore(false);
    } catch (err) {
      logger.warn("OverlayAssistant", "ui", "Failed to end conversation", {
        error: getErrorMessage(err),
      });
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
          onStaleReset={handleStaleReset}
          navigate={handleNavigate}
          executeTier1={executeTier1}
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
