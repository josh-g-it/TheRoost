import { useRef, useState, useCallback } from "react";
import { AppIcon } from "./AppIcon";
import "./StarRating.css";

interface StarRatingProps {
  /** Rating value 0-10 (0 = unrated, 1-10 maps to 0.5-5.0 stars) */
  value: number;
  /** If provided, component is interactive; called with new value (1-10) */
  onChange?: (value: number) => void;
  /** Icon size in px */
  size?: number;
  className?: string;
}

export function StarRating({ value, onChange, size = 16, className }: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const interactive = !!onChange;

  const displayValue = hoverValue ?? value;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, starIndex: number) => {
      if (!interactive) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const isLeftHalf = x < rect.width / 2;
      setHoverValue(starIndex * 2 + (isLeftHalf ? 1 : 2));
    },
    [interactive],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, starIndex: number) => {
      if (!onChange) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const isLeftHalf = x < rect.width / 2;
      const newValue = starIndex * 2 + (isLeftHalf ? 1 : 2);
      onChange(newValue);
    },
    [onChange],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverValue(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`star-rating ${interactive ? "star-rating--interactive" : ""} ${className ?? ""}`}
      onMouseLeave={handleMouseLeave}
      role={interactive ? "slider" : "img"}
      aria-label={`Rating: ${(displayValue / 2).toFixed(1)} out of 5 stars`}
      aria-valuenow={interactive ? displayValue : undefined}
      aria-valuemin={interactive ? 1 : undefined}
      aria-valuemax={interactive ? 10 : undefined}
    >
      {[0, 1, 2, 3, 4].map((starIndex) => {
        const starValue = (starIndex + 1) * 2;
        const isFull = displayValue >= starValue;
        const isHalf = !isFull && displayValue >= starValue - 1;

        return (
          <div
            key={starIndex}
            className="star-rating__star"
            onMouseMove={(e) => handleMouseMove(e, starIndex)}
            onClick={(e) => handleClick(e, starIndex)}
          >
            <AppIcon name="star-outline" size={size} />
            {(isFull || isHalf) && (
              <span
                className={`star-rating__fill ${isHalf ? "star-rating__fill--half" : ""}`}
              >
                <AppIcon name="star-filled" size={size} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
