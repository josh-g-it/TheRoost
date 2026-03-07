import { memo } from "react";
import "./ActionConfirmation.css";

interface ActionConfirmationProps {
  actionId: string;
  description: string;
  onConfirm: (actionId: string) => void;
  onDeny: (actionId: string) => void;
}

export const ActionConfirmation = memo(function ActionConfirmation({
  actionId,
  description,
  onConfirm,
  onDeny,
}: ActionConfirmationProps) {
  return (
    <div className="action-confirmation">
      <p className="action-confirmation__description">{description}</p>
      <div className="action-confirmation__actions">
        <button
          className="action-confirmation__btn action-confirmation__btn--deny"
          onClick={() => onDeny(actionId)}
        >
          No
        </button>
        <button
          className="action-confirmation__btn action-confirmation__btn--confirm"
          onClick={() => onConfirm(actionId)}
        >
          Yes
        </button>
      </div>
    </div>
  );
});
