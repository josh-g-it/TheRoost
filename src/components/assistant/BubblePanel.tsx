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

/** Edge identifiers for resize. */
type ResizeEdge = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

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

const EDGES: ResizeEdge[] = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];

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

  const geo = geoRef.current;

  // ── Resize / drag state ──
  const panelRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{
    edge: ResizeEdge;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
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
  // Use geoRef (the user's intended position) as the source, NOT the DOM.
  // This way, when the window shrinks and the panel is clamped inward, the
  // intended position is preserved and restored when the window grows back.
  useEffect(() => {
    if (!shouldRender) return;
    const handleWindowResize = () => {
      const panel = panelRef.current;
      const g = geoRef.current;
      if (!panel || !g) return;
      const clamped = clampToViewport(g.x, g.y, g.w, g.h);
      panel.style.left = `${clamped.x}px`;
      panel.style.top = `${clamped.y}px`;
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
  const wasVisibleRef = useRef(false);
  useEffect(() => {
    if (isVisible) {
      wasVisibleRef.current = true;
    } else if (wasVisibleRef.current) {
      wasVisibleRef.current = false;
      aiconRef?.current?.focus();
    }
  }, [isVisible, aiconRef]);

  // ── Drag handlers ──
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

  /** Drag handler for the body area — skips if the target is interactive. */
  const handleBodyDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // Don't drag when clicking on interactive elements or message content
      if (
        target.closest(
          "textarea, button, a, .assistant-chat__message, .assistant-chat__input-bar",
        )
      )
        return;
      handleDragStart(e);
    },
    [handleDragStart],
  );

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

  // ── Edge resize handlers ──
  const handleEdgeResizeStart = useCallback(
    (edge: ResizeEdge) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setIsResizing(true);
      const g = geoRef.current!;
      const panel = panelRef.current!;
      resizeRef.current = {
        edge,
        startX: e.clientX,
        startY: e.clientY,
        origX: panel.offsetLeft,
        origY: panel.offsetTop,
        origW: g.w,
        origH: g.h,
      };
    },
    [],
  );

  const handleEdgeResizeMove = useCallback(
    (e: React.PointerEvent) => {
      const r = resizeRef.current;
      if (!isResizing || !r || !panelRef.current) return;
      const dx = e.clientX - r.startX;
      const dy = e.clientY - r.startY;

      let newW = r.origW;
      let newH = r.origH;
      let newX = r.origX;
      let newY = r.origY;

      if (r.edge.includes("e")) {
        newW = clamp(r.origW + dx, MIN_WIDTH, MAX_WIDTH);
      }
      if (r.edge.includes("w")) {
        const dw = clamp(r.origW - dx, MIN_WIDTH, MAX_WIDTH) - r.origW;
        newW = r.origW + dw;
        newX = r.origX - dw;
      }
      if (r.edge.includes("s")) {
        newH = clamp(r.origH + dy, MIN_HEIGHT, MAX_HEIGHT);
      }
      if (r.edge === "n" || r.edge === "nw" || r.edge === "ne") {
        const dh = clamp(r.origH - dy, MIN_HEIGHT, MAX_HEIGHT) - r.origH;
        newH = r.origH + dh;
        newY = r.origY - dh;
      }

      panelRef.current.style.width = `${newW}px`;
      panelRef.current.style.height = `${newH}px`;
      panelRef.current.style.left = `${newX}px`;
      panelRef.current.style.top = `${newY}px`;
    },
    [isResizing],
  );

  const handleEdgeResizeEnd = useCallback(
    (e: React.PointerEvent) => {
      if (!isResizing || !resizeRef.current || !panelRef.current) return;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      setIsResizing(false);

      const newW = panelRef.current.offsetWidth;
      const newH = panelRef.current.offsetHeight;
      const newX = panelRef.current.offsetLeft;
      const newY = panelRef.current.offsetTop;

      resizeRef.current = null;
      geoRef.current = { w: newW, h: newH, x: newX, y: newY };
      const s = useSettingsStore.getState().settings;
      if (s) {
        useSettingsStore.getState().saveSettings({
          ...s,
          assistantBubbleWidth: newW,
          assistantBubbleHeight: newH,
          assistantBubbleX: newX,
          assistantBubbleY: newY,
        });
      }
    },
    [isResizing],
  );

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
      {/* ── Edge resize zones (invisible hit areas) ── */}
      {EDGES.map((edge) => (
        <div
          key={edge}
          className={`bubble-panel__edge bubble-panel__edge--${edge}`}
          onPointerDown={handleEdgeResizeStart(edge)}
          onPointerMove={handleEdgeResizeMove}
          onPointerUp={handleEdgeResizeEnd}
          aria-hidden="true"
        />
      ))}

      {/* ── Floating sprite (top-center, draggable) ── */}
      <div
        className="bubble-panel__hero-sprite"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <SpriteRenderer
          spriteDataUrl={spriteDataUrl}
          expression={expression}
          size={128}
          fallbackText={activeAvatar.name}
        />
      </div>

      {/* ── Close button (top-right of panel) ── */}
      <button
        className="bubble-panel__close-btn"
        onClick={onToggle}
        title="Hide bubble"
        aria-label="Hide assistant bubble"
      >
        <AppIcon name="close" size={14} />
      </button>

      {/* ── Body — ChatCore with name labels and end button in input bar ── */}
      <div
        className="bubble-panel__body"
        onPointerDown={handleBodyDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <ChatCore
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
          avatarName={activeAvatar.name}
        />
      </div>
    </div>
  );
});
