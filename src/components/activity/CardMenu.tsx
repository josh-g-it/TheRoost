import { useState, useRef, useEffect } from "react";
import { AppIcon } from "../common/AppIcon";
import {
  CARD_WIDTH_OPTIONS,
  CARD_TYPE_META,
  DEFAULT_CARD_OPTIONS,
} from "../../types/activityLayout";
import type { ActivityCardConfig, CardWidth } from "../../types/activityLayout";
import "./CardMenu.css";

interface CardMenuProps {
  card: ActivityCardConfig;
  onRemove: (id: string) => void;
  onToggleWidth: (id: string, width: CardWidth) => void;
  onReset: (id: string) => void;
}

export function CardMenu({ card, onRemove, onToggleWidth, onReset }: CardMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const widths = CARD_WIDTH_OPTIONS[card.type];
  const canToggleWidth = widths.length > 1;
  const otherWidth: CardWidth = card.width === "full" ? "half" : "full";
  const meta = CARD_TYPE_META[card.type];

  // Show reset if card has options that differ from defaults
  const defaults = DEFAULT_CARD_OPTIONS[card.type];
  const hasCustomOptions =
    card.options &&
    Object.keys(card.options).some((key) => {
      if (!defaults) return true;
      return card.options![key] !== defaults[key];
    });

  return (
    <div className="card-menu" ref={menuRef}>
      <button
        className="card-menu__trigger"
        onClick={() => setOpen(!open)}
        title={`Options for ${meta.label}`}
      >
        <AppIcon name="settings" size={14} />
      </button>

      {open && (
        <div className="card-menu__dropdown">
          {canToggleWidth && (
            <button
              className="card-menu__item"
              onClick={() => {
                onToggleWidth(card.id, otherWidth);
                setOpen(false);
              }}
            >
              {otherWidth === "full" ? "Full Width" : "Half Width"}
            </button>
          )}
          {hasCustomOptions && (
            <button
              className="card-menu__item"
              onClick={() => {
                onReset(card.id);
                setOpen(false);
              }}
            >
              Reset Options
            </button>
          )}
          <button
            className="card-menu__item card-menu__item--danger"
            onClick={() => {
              onRemove(card.id);
              setOpen(false);
            }}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
