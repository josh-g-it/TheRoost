import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useConversationContext } from "./ConversationProvider";
import { useSettingsStore } from "../../store/settingsSlice";
import { ChatCore } from "./shared";
import { SpriteRenderer } from "./SpriteRenderer";
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

/** Movement threshold (px) to distinguish click from drag. */
const DRAG_THRESHOLD = 3;
/** Bottom-left default spacing from viewport edge. */
const DEFAULT_BOTTOM_SPACING = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Read the current rail width from CSS custom property. */
function getRailWidth(): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--rail-width")
    .trim();
  return parseInt(raw, 10) || 56;
}

/** Clamp position so the entire panel stays within the viewport. */
function clampToViewport(
  x: number,
  y: number,
  w: number,
  h: number,
): { x: number; y: number } {
  return {
    x: clamp(x, 0, Math.max(0, window.innerWidth - w)),
    y: clamp(y, 0, Math.max(0, window.innerHeight - h)),
  };
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
    handleConversationStart,
    handleConversationEnding,
    pendingReview,
    consumePendingReview,
    expression,
    spriteDataUrl,
    onStreamStart,
    onStreamEnd,
    onUserTyping,
    onUserSentMessage,
    setTimerViewing,
    // Conversation state from hub
    messages,
    isStreaming,
    conversationError,
    currentStreamText,
    isConversationCompacting,
    pendingActions,
    t0Expression,
    cloudAiEnabled,
    historyLoaded,
    sendMessage,
    retry,
    endActiveConversation,
    injectMessage,
    clearPendingActions,
    clearT0Expression,
  } = useConversationContext();

  const settings = useSettingsStore((s) => s.settings);
  const uiScale = (settings?.uiScale ?? "comfortable") as UIScaleId;
  const location = useLocation();

  // ── Panel geometry ref ──
  // Local ref survives across renders and async settings saves.
  // Initialized from settings on first mount, updated on drag/resize end.
  const defaults = SCALE_DEFAULTS[uiScale] ?? SCALE_DEFAULTS.comfortable;
  const geoRef = useRef<{ w: number; h: number; x: number; y: number } | null>(null);
  if (geoRef.current === null) {
    const w = settings?.assistantBubbleWidth ?? defaults.width;
    const h = settings?.assistantBubbleHeight ?? defaults.height;
    const rawX = settings?.assistantBubbleX ?? getRailWidth();
    const rawY =
      settings?.assistantBubbleY ?? window.innerHeight - h - DEFAULT_BOTTOM_SPACING;
    const clamped = clampToViewport(rawX, rawY, w, h);
    geoRef.current = { w, h, x: clamped.x, y: clamped.y };
  }

  // Expose current geometry for inline style (initial render)
  const geo = geoRef.current;

  // ── Resize / drag state ──
  const panelRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    left: number;
    top: number;
  } | null>(null);
  const dragExceededRef = useRef(false);

  // ── Animation state ──
  const [shouldRender, setShouldRender] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const prevExpandedRef = useRef(expanded);

  // ── Visibility rules ──
  const isOnAssistantPage = location.pathname.startsWith("/assistant");
  const isVisible = expanded && !isOnAssistantPage && activeAvatar != null;

  // ── Animation lifecycle ──
  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateIn(true));
      });
    } else if (prevExpandedRef.current && !isVisible) {
      setAnimateIn(false);
      const timer = setTimeout(() => setShouldRender(false), 200);
      return () => clearTimeout(timer);
    } else {
      setShouldRender(false);
      setAnimateIn(false);
    }
    prevExpandedRef.current = expanded;
  }, [isVisible, expanded]);

  // ── Pause timer while bubble is visible ──
  useEffect(() => {
    if (isVisible) {
      setTimerViewing(true);
      return () => setTimerViewing(false);
    }
  }, [isVisible, setTimerViewing]);

  // ── Clamp to viewport on window resize ──
  useEffect(() => {
    if (!shouldRender) return;
    const handleWindowResize = () => {
      const panel = panelRef.current;
      const g = geoRef.current;
      if (!panel || !g) return;
      const clamped = clampToViewport(
        panel.offsetLeft,
        panel.offsetTop,
        panel.offsetWidth,
        panel.offsetHeight,
      );
      panel.style.left = `${clamped.x}px`;
      panel.style.top = `${clamped.y}px`;
      geoRef.current = { ...g, x: clamped.x, y: clamped.y };
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [shouldRender]);

  // ── Focus management: focus input when bubble expands ──
  useEffect(() => {
    if (isVisible && animateIn) {
      const timer = setTimeout(() => {
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

  const wasVisibleRef = useRef(false);
  useEffect(() => {
    if (isVisible) {
      wasVisibleRef.current = true;
    } else if (wasVisibleRef.current) {
      wasVisibleRef.current = false;
      aiconRef?.current?.focus();
    }
  }, [isVisible, aiconRef]);

  // ── Drag handlers (header) ──
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const panel = panelRef.current;
    if (!panel) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragExceededRef.current = false;
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      left: panel.offsetLeft,
      top: panel.offsetTop,
    };
  }, []);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    const start = dragStartRef.current;
    if (!start || !panelRef.current) return;
    const dx = e.clientX - start.pointerX;
    const dy = e.clientY - start.pointerY;
    if (
      !dragExceededRef.current &&
      Math.abs(dx) < DRAG_THRESHOLD &&
      Math.abs(dy) < DRAG_THRESHOLD
    )
      return;
    if (!dragExceededRef.current) {
      dragExceededRef.current = true;
      setIsDragging(true);
    }
    const w = panelRef.current.offsetWidth;
    const h = panelRef.current.offsetHeight;
    const clamped = clampToViewport(start.left + dx, start.top + dy, w, h);
    panelRef.current.style.left = `${clamped.x}px`;
    panelRef.current.style.top = `${clamped.y}px`;
  }, []);

  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (dragExceededRef.current && panelRef.current) {
      const newLeft = panelRef.current.offsetLeft;
      const newTop = panelRef.current.offsetTop;
      geoRef.current = { ...geoRef.current!, x: newLeft, y: newTop };
      const s = useSettingsStore.getState().settings;
      if (s) {
        useSettingsStore.getState().saveSettings({
          ...s,
          assistantBubbleX: newLeft,
          assistantBubbleY: newTop,
        });
      }
    }
    dragStartRef.current = null;
    dragExceededRef.current = false;
    setIsDragging(false);
  }, []);

  // ── Resize handlers (bottom-right corner, grow right+down) ──
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsResizing(true);
    const g = geoRef.current!;
    resizeStartRef.current = { x: e.clientX, y: e.clientY, w: g.w, h: g.h };
  }, []);

  const handleResizeMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isResizing || !resizeStartRef.current || !panelRef.current) return;
      const dx = e.clientX - resizeStartRef.current.x;
      const dy = e.clientY - resizeStartRef.current.y;
      // Clamp size to both min/max and available viewport space
      const panelLeft = panelRef.current.offsetLeft;
      const panelTop = panelRef.current.offsetTop;
      const maxW = Math.min(MAX_WIDTH, window.innerWidth - panelLeft);
      const maxH = Math.min(MAX_HEIGHT, window.innerHeight - panelTop);
      const newW = clamp(resizeStartRef.current.w + dx, MIN_WIDTH, maxW);
      const newH = clamp(resizeStartRef.current.h + dy, MIN_HEIGHT, maxH);
      panelRef.current.style.width = `${newW}px`;
      panelRef.current.style.height = `${newH}px`;
    },
    [isResizing],
  );

  const handleResizeEnd = useCallback(
    (e: React.PointerEvent) => {
      if (!isResizing || !resizeStartRef.current) return;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      setIsResizing(false);
      const dx = e.clientX - resizeStartRef.current.x;
      const dy = e.clientY - resizeStartRef.current.y;
      const panelLeft = panelRef.current?.offsetLeft ?? 0;
      const panelTop = panelRef.current?.offsetTop ?? 0;
      const maxW = Math.min(MAX_WIDTH, window.innerWidth - panelLeft);
      const maxH = Math.min(MAX_HEIGHT, window.innerHeight - panelTop);
      const newW = clamp(resizeStartRef.current.w + dx, MIN_WIDTH, maxW);
      const newH = clamp(resizeStartRef.current.h + dy, MIN_HEIGHT, maxH);
      resizeStartRef.current = null;
      geoRef.current = { ...geoRef.current!, w: newW, h: newH };
      const s = useSettingsStore.getState().settings;
      if (s) {
        useSettingsStore.getState().saveSettings({
          ...s,
          assistantBubbleWidth: newW,
          assistantBubbleHeight: newH,
        });
      }
    },
    [isResizing],
  );

  const handleEndConversation = useCallback(() => {
    handleConversationEnding();
    endActiveConversation();
  }, [handleConversationEnding, endActiveConversation]);

  if (!shouldRender || !activeAvatar) return null;

  return (
    <div
      ref={panelRef}
      className={`bubble-panel ${animateIn ? "bubble-panel--visible" : ""} ${isResizing ? "bubble-panel--resizing" : ""} ${isDragging ? "bubble-panel--dragging" : ""}`}
      style={{
        left: `${geo.x}px`,
        top: `${geo.y}px`,
        width: `${geo.w}px`,
        height: `${geo.h}px`,
      }}
      role="complementary"
      aria-label={`Assistant chat with ${activeAvatar.name}`}
    >
      {/* ── Header (drag handle) — centered hero layout ── */}
      <div
        className="bubble-panel__header"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <SpriteRenderer
          spriteDataUrl={spriteDataUrl}
          expression={expression}
          size={72}
          fallbackText={activeAvatar.name}
          circular
          className="bubble-panel__sprite"
        />
        <span className="bubble-panel__name">{activeAvatar.name}</span>
        <button
          className="bubble-panel__close-btn"
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
          hideEndButton
          conversationId={conversationId}
          messages={messages}
          isStreaming={isStreaming}
          error={conversationError}
          currentStreamText={currentStreamText}
          isCompacting={isConversationCompacting}
          pendingActions={pendingActions}
          t0Expression={t0Expression}
          cloudAiEnabled={cloudAiEnabled}
          historyLoaded={historyLoaded}
          sendMessage={sendMessage}
          retry={retry}
          endConversation={endActiveConversation}
          injectMessage={injectMessage}
          clearPendingActions={clearPendingActions}
          clearT0Expression={clearT0Expression}
          onConversationStart={handleConversationStart}
          onConversationEnding={handleConversationEnding}
          pendingReview={pendingReview}
          onPendingReviewConsumed={consumePendingReview}
          onExpressionStreamStart={onStreamStart}
          onExpressionStreamEnd={onStreamEnd}
          onExpressionUserTyping={onUserTyping}
          onExpressionUserSentMessage={onUserSentMessage}
        />
      </div>

      {/* ── Footer: end conversation link ── */}
      {conversationId && !isConversationCompacting && (
        <div className="bubble-panel__footer">
          <button
            className="bubble-panel__end-btn"
            onClick={handleEndConversation}
            disabled={isStreaming}
          >
            End Conversation
          </button>
        </div>
      )}

      {/* ── Resize handle (bottom-right corner) ── */}
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
