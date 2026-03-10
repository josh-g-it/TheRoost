import { memo } from "react";
import "./ActionConfirmationCard.css";

interface ActionConfirmationCardProps {
  description: string;
  onConfirm: () => void;
  onDeny: () => void;
}

export const ActionConfirmationCard = memo(function ActionConfirmationCard({
  description,
  onConfirm,
  onDeny,
}: ActionConfirmationCardProps) {
  return (
    <div
      className="action-confirmation-card"
      role="alertdialog"
      aria-label="Action confirmation"
    >
      <span className="action-confirmation-card__description">{description}</span>
      <div className="action-confirmation-card__actions">
        <button
          className="action-confirmation-card__btn action-confirmation-card__btn--cancel"
          onClick={onDeny}
          aria-label="Deny action"
        >
          Cancel
        </button>
        <button
          className="action-confirmation-card__btn action-confirmation-card__btn--confirm"
          onClick={onConfirm}
          aria-label="Confirm action"
        >
          Confirm
        </button>
      </div>
    </div>
  );
});
