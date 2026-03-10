import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useConversationContext } from "./ConversationProvider";
import { useSettingsStore } from "../../store/settingsSlice";
import { ChatCore } from "./shared";
import { getAvatarColor } from "../../utils/avatarColors";
import { AppIcon } from "../common/AppIcon";
import type { UIScaleId } from "../../types/theme";
import "./BubblePanel.css";

/** Default bubble dimensions per UI scale when user hasn't set a custom size. */
const SCALE_DEFAULTS: Record<UIScaleId, { width: number; height: number }> = {
  minimal: { width: 320, height: 400 },
  comfortable: { width: 340, height: 440 },
  expanded: { width: 380, height: 500 },
  large: { width: 380, height: 500 },
};

const MIN_WIDTH = 280;
const MIN_HEIGHT = 300;
const MAX_WIDTH = 600;
const MAX_HEIGHT = 800;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface BubblePanelProps {
  expanded: boolean;
  onToggle: () => void;
  /** Ref to the aicon button for returning focus on collapse. */
  aiconRef?: React.RefObject<HTMLButtonElement>;
}

export const BubblePanel = memo(function BubblePanel({
  expanded,
  onToggle,
  aiconRef,
}: BubblePanelProps) {
  const {
    activeAvatar,
    conversationId,
    isFirstConversation,
    handleConversationStart,
    handleConversationEnding,
    handleConversationEnd,
    handleStaleReset,
    pendingReview,
    consumePendingReview,
  } = useConversationContext();

  const settings = useSettingsStore((s) => s.settings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const railMode = settings?.railMode ?? "dynamic";
  const uiScale = (settings?.uiScale ?? "comfortable") as UIScaleId;
  const navigate = useNavigate();
  const location = useLocation();

  // ── Resize state ──
  const panelRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );

  // Compute effective dimensions
  const defaults = SCALE_DEFAULTS[uiScale] ?? SCALE_DEFAULTS.comfortable;
  const effectiveWidth = settings?.assistantBubbleWidth ?? defaults.width;
  const effectiveHeight = settings?.assistantBubbleHeight ?? defaults.height;

  // ── Animation state ──
  // Track whether component should render (for exit animation)
  const [shouldRender, setShouldRender] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const prevExpandedRef = useRef(expanded);

  const handleMaximize = useCallback(() => {
    navigate("/assistant");
    onToggle();
  }, [navigate, onToggle]);

  // ── Visibility rules ──
  const isOnAssistantPage = location.pathname.startsWith("/assistant");
  const isVisible = expanded && !isOnAssistantPage && activeAvatar != null;

  // ── Animation lifecycle ──
  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      // Trigger enter animation on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateIn(true));
      });
    } else if (prevExpandedRef.current && !isVisible) {
      // Trigger exit animation
      setAnimateIn(false);
      const timer = setTimeout(() => setShouldRender(false), 200);
      return () => clearTimeout(timer);
    } else {
      setShouldRender(false);
      setAnimateIn(false);
    }
    prevExpandedRef.current = expanded;
  }, [isVisible, expanded]);

  // ── Focus management: focus input when bubble expands ──
  useEffect(() => {
    if (isVisible && animateIn) {
      // Small delay to let animation start and DOM settle
      const timer = setTimeout(() => {
        // Try to find the textarea inside the bubble via the panel ref
        const textarea = panelRef.current?.querySelector<HTMLTextAreaElement>(
          ".assistant-chat__input",
        );
        textarea?.focus();
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [isVisible, animateIn]);

  // ── Focus management: return focus to aicon on collapse ──
  useEffect(() => {
    if (!isVisible && prevExpandedRef.current === false && aiconRef?.current) {
      // Only return focus if the bubble was previously showing
    }
  }, [isVisible, aiconRef]);

  // Use a separate effect to return focus when bubble disappears
  const wasVisibleRef = useRef(false);
  useEffect(() => {
    if (isVisible) {
      wasVisibleRef.current = true;
    } else if (wasVisibleRef.current) {
      wasVisibleRef.current = false;
      aiconRef?.current?.focus();
    }
  }, [isVisible, aiconRef]);

  // ── Resize handlers ──
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setIsResizing(true);
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        w: effectiveWidth,
        h: effectiveHeight,
      };
    },
    [effectiveWidth, effectiveHeight],
  );

  const handleResizeMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isResizing || !resizeStartRef.current || !panelRef.current) return;
      const dx = e.clientX - resizeStartRef.current.x;
      const dy = resizeStartRef.current.y - e.clientY; // top-right: drag up = taller
      const newW = clamp(resizeStartRef.current.w + dx, MIN_WIDTH, MAX_WIDTH);
      const newH = clamp(resizeStartRef.current.h + dy, MIN_HEIGHT, MAX_HEIGHT);
      panelRef.current.style.width = `${newW}px`;
      panelRef.current.style.height = `${newH}px`;
    },
    [isResizing],
  );

  const handleResizeEnd = useCallback(
    (e: React.PointerEvent) => {
      if (!isResizing || !resizeStartRef.current || !settings) return;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      setIsResizing(false);
      const dx = e.clientX - resizeStartRef.current.x;
      const dy = resizeStartRef.current.y - e.clientY; // top-right: drag up = taller
      const newW = clamp(resizeStartRef.current.w + dx, MIN_WIDTH, MAX_WIDTH);
      const newH = clamp(resizeStartRef.current.h + dy, MIN_HEIGHT, MAX_HEIGHT);
      resizeStartRef.current = null;
      // Save to settings on resize end
      saveSettings({
        ...settings,
        assistantBubbleWidth: newW,
        assistantBubbleHeight: newH,
      });
    },
    [isResizing, settings, saveSettings],
  );

  if (!shouldRender || !activeAvatar) return null;

  const avatarColor = getAvatarColor(activeAvatar.name);
  const monogram = activeAvatar.name.charAt(0).toUpperCase();

  return (
    <div
      ref={panelRef}
      className={`bubble-panel ${animateIn ? "bubble-panel--visible" : ""} ${isResizing ? "bubble-panel--resizing" : ""}`}
      data-rail-mode={railMode}
      style={{
        width: `${effectiveWidth}px`,
        height: `${effectiveHeight}px`,
      }}
      role="complementary"
      aria-label={`Assistant chat with ${activeAvatar.name}`}
    >
      {/* ── Header ── */}
      <div className="bubble-panel__header">
        <div
          className="bubble-panel__avatar-circle"
          style={{ backgroundColor: avatarColor }}
        >
          {monogram}
        </div>
        <span className="bubble-panel__name">{activeAvatar.name}</span>
        <div className="bubble-panel__spacer" />
        <button
          className="bubble-panel__btn"
          onClick={handleMaximize}
          title="Open full assistant"
          aria-label="Open full assistant view"
        >
          <AppIcon name="chevron-right" size={14} />
        </button>
        <button
          className="bubble-panel__btn"
          onClick={onToggle}
          title="Hide bubble"
          aria-label="Hide assistant bubble"
        >
          <AppIcon name="close" size={14} />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="bubble-panel__body">
        <ChatCore
          compact
          avatarId={activeAvatar.id}
          conversationId={conversationId}
          isFirstConversation={isFirstConversation}
          onConversationStart={handleConversationStart}
          onConversationEnding={handleConversationEnding}
          onConversationEnd={handleConversationEnd}
          onStaleReset={handleStaleReset}
          pendingReview={pendingReview}
          onPendingReviewConsumed={consumePendingReview}
          navigate={navigate}
        />
      </div>

      {/* ── Resize handle ── */}
      <div
        className="bubble-panel__resize-handle"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        aria-hidden="true"
      />
    </div>
  );
});
