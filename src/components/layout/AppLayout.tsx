import { useCallback, useRef } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../../store/settingsSlice";
import { useTrayListener } from "../../hooks/useTrayListener";
import { useEventListener } from "../../hooks/useEventListener";
import { ConversationProvider } from "../assistant/ConversationProvider";
import { BubblePanel } from "../assistant/BubblePanel";
import { IconRail } from "./IconRail";
import { BackgroundTaskBanner } from "../library/BackgroundTaskBanner";
import { UpdateBanner } from "./UpdateBanner";
import "./AppLayout.css";

interface PostSessionReviewPayload {
  gameId: string;
  gameName: string;
  durationMinutes: number;
}

export function AppLayout() {
  useTrayListener();
  const navigate = useNavigate();
  const settings = useSettingsStore((s) => s.settings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const railMode = settings?.railMode ?? "dynamic";
  const bubbleEnabled = settings?.assistantBubbleEnabled !== false;
  const bubbleExpanded = settings?.assistantBubbleExpanded ?? false;
  const aiconRef = useRef<HTMLButtonElement>(null);

  const openOverlay = () => {
    invoke("toggle_overlay");
  };

  const toggleBubble = useCallback(() => {
    if (!settings) return;
    saveSettings({
      ...settings,
      assistantBubbleExpanded: !settings.assistantBubbleExpanded,
    });
  }, [settings, saveSettings]);

  const expandBubble = useCallback(() => {
    if (!settings) return;
    if (!settings.assistantBubbleExpanded) {
      saveSettings({
        ...settings,
        assistantBubbleExpanded: true,
      });
    }
  }, [settings, saveSettings]);

  // Global listener for post-session review prompts from process monitor.
  // Instead of navigating to /assistant, store the review payload and open
  // the bubble so the user can interact inline.
  useEventListener<PostSessionReviewPayload>(
    "post-session-review",
    (event) => {
      const { gameId, gameName, durationMinutes } = event.payload;
      sessionStorage.setItem(
        "pendingReview",
        JSON.stringify({ gameId, gameName, durationMinutes }),
      );
      // If bubble is enabled, open it instead of navigating away
      if (bubbleEnabled) {
        expandBubble();
      } else {
        navigate("/assistant");
      }
    },
    [navigate, bubbleEnabled, expandBubble],
  );

  return (
    <ConversationProvider>
      <div className="app-layout">
        <IconRail
          onCommandCenterToggle={openOverlay}
          railMode={railMode}
          bubbleExpanded={bubbleEnabled && bubbleExpanded}
          onToggleBubble={toggleBubble}
          aiconRef={aiconRef}
        />
        {bubbleEnabled && (
          <BubblePanel
            expanded={bubbleExpanded}
            onToggle={toggleBubble}
            aiconRef={aiconRef}
          />
        )}
        <main className="app-layout__content" data-rail-mode={railMode}>
          <UpdateBanner />
          <BackgroundTaskBanner />
          <Outlet />
        </main>
      </div>
    </ConversationProvider>
  );
}
