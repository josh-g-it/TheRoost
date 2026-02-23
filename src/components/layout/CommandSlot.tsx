import { forwardRef } from "react";
import type { SlotAction } from "../../types";
import { AppIcon } from "../common/AppIcon";
import "./CommandSlot.css";

interface CommandSlotProps {
  action: SlotAction;
  onClick: () => void;
  isEditing?: boolean;
}

export const CommandSlot = forwardRef<HTMLButtonElement, CommandSlotProps>(
  function CommandSlot({ action, onClick, isEditing }, ref) {
    return (
      <button
        ref={ref}
        className={`command-slot ${isEditing ? "command-slot--editing" : ""}`}
        onClick={onClick}
        aria-label={isEditing ? `Change ${action.label} slot` : action.label}
      >
        <span className="command-slot__icon">
          <AppIcon name={action.icon} size={24} />
        </span>
        <span className="command-slot__label">{action.label}</span>
        {isEditing && <span className="command-slot__edit-hint">click to change</span>}
      </button>
    );
  },
);
