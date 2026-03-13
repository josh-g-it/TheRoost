import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Expression } from "../../types/assistant";
import { EXPRESSION_GRID } from "../../types/assistant";
import "./SpriteRenderer.css";

const GRID_COLS = 4;
const GRID_ROWS = 2;

export interface SpriteRendererProps {
  /** Base64 data URL of the full sprite sheet, or null for monogram fallback */
  spriteDataUrl: string | null;
  /** Current expression to display */
  expression: Expression;
  /** Display size in pixels (renders as a square) */
  size: number;
  /** Monogram fallback text (e.g., first letter of avatar name) */
  fallbackText?: string;
  /** Whether to render with circular clipping */
  circular?: boolean;
  /** Optional CSS class name */
  className?: string;
  /** Optional per-cell crop offsets */
  cropOffsets?: Array<{ x: number; y: number }>;
  /** Click handler */
  onClick?: () => void;
}

/** Get the expression index in the grid (0-7) */
function getExpressionIndex(expression: Expression): number {
  const idx = EXPRESSION_GRID.indexOf(expression);
  return idx >= 0 ? idx : 0; // default to neutral
}

/**
 * Renders a single expression cell from a sprite sheet using CSS background-position.
 * Falls back to a monogram circle when no sprite is available.
 */
export const SpriteRenderer = React.memo(function SpriteRenderer({
  spriteDataUrl,
  expression,
  size,
  fallbackText = "?",
  circular = false,
  className = "",
  cropOffsets,
  onClick,
}: SpriteRendererProps) {
  const [animating, setAnimating] = useState(false);
  const prevExpressionRef = useRef(expression);
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trigger bump animation on expression change
  useEffect(() => {
    if (prevExpressionRef.current !== expression && spriteDataUrl) {
      setAnimating(true);
      if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
      animTimeoutRef.current = setTimeout(() => setAnimating(false), 200);
    }
    prevExpressionRef.current = expression;
    return () => {
      if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    };
  }, [expression, spriteDataUrl]);

  const getBackgroundStyle = useCallback((): React.CSSProperties => {
    if (!spriteDataUrl) return {};

    const idx = getExpressionIndex(expression);
    const col = idx % GRID_COLS;
    const row = Math.floor(idx / GRID_COLS);

    // Crop offset (if provided)
    const offset = cropOffsets?.[idx];
    const offsetX = offset?.x ?? 0;
    const offsetY = offset?.y ?? 0;

    // background-position calculates the pixel offset for CSS rendering.
    // The sprite sheet is scaled to GRID_COLS × GRID_ROWS the display size,
    // so each cell maps to exactly `size` pixels.
    const posX = -(col * size) + offsetX;
    const posY = -(row * size) + offsetY;

    return {
      width: size,
      height: size,
      backgroundImage: `url(${spriteDataUrl})`,
      backgroundSize: `${GRID_COLS * size}px ${GRID_ROWS * size}px`,
      backgroundPosition: `${posX}px ${posY}px`,
      backgroundRepeat: "no-repeat",
    };
  }, [spriteDataUrl, expression, size, cropOffsets]);

  if (!spriteDataUrl) {
    // Monogram fallback
    return (
      <div
        className={`sprite-renderer sprite-renderer--monogram ${circular ? "sprite-renderer--circular" : ""} ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        {fallbackText.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <div
      className={`sprite-renderer ${circular ? "sprite-renderer--circular" : ""} ${animating ? "sprite-renderer--bump" : ""} ${className}`}
      style={getBackgroundStyle()}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      data-expression={expression}
    />
  );
});

export default SpriteRenderer;
