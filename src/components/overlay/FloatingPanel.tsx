import { useCallback, useRef, useState } from "react";
import type { OverlayPanelId, OverlayPanelPosition } from "../../types/settings";
import type { Rect } from "./panelCollision";
import { resolveCollision, resolveResizeCollision } from "./panelCollision";
import { AppIcon } from "../common/AppIcon";
import "./FloatingPanel.css";

const PANEL_HEADER_HEIGHT = 36;

interface FloatingPanelProps {
  panelId: OverlayPanelId;
  title: string;
  defaultPosition: { x: number; y: number };
  pinned?: boolean;
  onPositionChange: (pos: OverlayPanelPosition) => void;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  width?: number;
  resizable?: boolean;
  minWidth?: number;
  minHeight?: number;
  defaultHeight?: number;
  otherPanelRects?: Rect[];
}

export function FloatingPanel({
  title,
  defaultPosition,
  pinned: initialPinned = false,
  onPositionChange,
  onClose,
  children,
  className,
  width: defaultWidth = 560,
  resizable = false,
  minWidth,
  minHeight,
  defaultHeight,
  otherPanelRects = [],
}: FloatingPanelProps) {
  const [pos, setPos] = useState(defaultPosition);
  const [pinned, setPinned] = useState(initialPinned);
  const [size, setSize] = useState<{ width: number; height: number | undefined }>({
    width: defaultWidth,
    height: defaultHeight,
  });
  const dragState = useRef({ startX: 0, startY: 0, dragging: false });
  const resizeState = useRef({
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
    resizing: false,
  });
  const panelRef = useRef<HTMLDivElement>(null);

  const effectiveMinWidth = minWidth ?? defaultWidth;
  const effectiveMinHeight = minHeight ?? 200;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (pinned) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragState.current = {
        startX: e.clientX - pos.x,
        startY: e.clientY - pos.y,
        dragging: true,
      };
    },
    [pinned, pos],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState.current.dragging) return;
      let newX = e.clientX - dragState.current.startX;
      let newY = e.clientY - dragState.current.startY;

      // Clamp to viewport
      newX = Math.max(0, Math.min(window.innerWidth - size.width, newX));
      newY = Math.max(0, Math.min(window.innerHeight - PANEL_HEADER_HEIGHT, newY));

      // Collision detection
      const panelHeight = panelRef.current?.offsetHeight ?? size.height ?? 400;
      const resolved = resolveCollision(
        { x: newX, y: newY, width: size.width, height: panelHeight },
        otherPanelRects,
      );

      setPos({ x: resolved.x, y: resolved.y });
    },
    [size.width, size.height, otherPanelRects],
  );

  const handlePointerUp = useCallback(() => {
    if (!dragState.current.dragging) return;
    dragState.current.dragging = false;
    onPositionChange({
      ...pos,
      width: size.width,
      height: size.height,
      pinned,
      visible: true,
    });
  }, [pos, pinned, size, onPositionChange]);

  const handlePinToggle = useCallback(() => {
    const next = !pinned;
    setPinned(next);
    onPositionChange({
      ...pos,
      width: size.width,
      height: size.height,
      pinned: next,
      visible: true,
    });
  }, [pinned, pos, size, onPositionChange]);

  // Resize handlers
  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (pinned) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const panelHeight = panelRef.current?.offsetHeight ?? size.height ?? 400;
      resizeState.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: size.width,
        startH: panelHeight,
        resizing: true,
      };
    },
    [pinned, size],
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeState.current.resizing) return;
      const deltaX = e.clientX - resizeState.current.startX;
      const deltaY = e.clientY - resizeState.current.startY;
      const newW = Math.max(effectiveMinWidth, resizeState.current.startW + deltaX);
      const newH = Math.max(effectiveMinHeight, resizeState.current.startH + deltaY);

      // Collision during resize
      const resolved = resolveResizeCollision(
        { x: pos.x, y: pos.y, width: newW, height: newH },
        otherPanelRects,
        effectiveMinWidth,
        effectiveMinHeight,
      );

      setSize({ width: resolved.width, height: resolved.height });
    },
    [pos, effectiveMinWidth, effectiveMinHeight, otherPanelRects],
  );

  const handleResizePointerUp = useCallback(() => {
    if (!resizeState.current.resizing) return;
    resizeState.current.resizing = false;
    onPositionChange({
      ...pos,
      width: size.width,
      height: size.height,
      pinned,
      visible: true,
    });
  }, [pos, pinned, size, onPositionChange]);

  return (
    <div
      ref={panelRef}
      className={`floating-panel ${pinned ? "floating-panel--pinned" : ""} ${className ?? ""}`}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: size.width,
        height: size.height,
        zIndex: 10,
      }}
    >
      <div
        className="floating-panel__header"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span className="floating-panel__title">{title}</span>
        <div className="floating-panel__controls">
          <button
            className={`floating-panel__pin ${pinned ? "floating-panel__pin--active" : ""}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handlePinToggle}
            title={pinned ? "Unlock panel" : "Lock panel"}
          >
            <AppIcon name={pinned ? "lock" : "pin"} size={14} />
          </button>
          {onClose && (
            <button
              className="floating-panel__close"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onClose}
              title="Close"
            >
              <AppIcon name="close" size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="floating-panel__content">{children}</div>
      {resizable && !pinned && (
        <div
          className="floating-panel__resize-handle"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
        />
      )}
    </div>
  );
}
