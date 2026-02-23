import { useState, useRef, useEffect } from "react";
import { AppIcon } from "../common/AppIcon";
import { ALL_CARD_TYPES, CARD_TYPE_META } from "../../types/activityLayout";
import type { ActivityCardType } from "../../types/activityLayout";
import "./AddCardButton.css";

interface AddCardButtonProps {
  existingTypes: ActivityCardType[];
  onAdd: (type: ActivityCardType) => void;
}

export function AddCardButton({ existingTypes, onAdd }: AddCardButtonProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const availableTypes = ALL_CARD_TYPES.filter((t) => !existingTypes.includes(t));

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

  if (availableTypes.length === 0) return null;

  return (
    <div className="add-card-button" ref={menuRef}>
      <button className="add-card-button__trigger" onClick={() => setOpen(!open)}>
        <AppIcon name="plus" size={18} />
        <span>Add Card</span>
      </button>

      {open && (
        <div className="add-card-button__dropdown">
          {availableTypes.map((type) => {
            const meta = CARD_TYPE_META[type];
            return (
              <button
                key={type}
                className="add-card-button__item"
                onClick={() => {
                  onAdd(type);
                  setOpen(false);
                }}
              >
                <AppIcon name={meta.icon} size={14} />
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
