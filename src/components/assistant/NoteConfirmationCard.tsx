import { useState } from "react";
import "./ActionConfirmationCard.css";

interface NoteConfirmationCardProps {
  gameName: string;
  noteText: string;
  onConfirm: (noteText: string) => void;
  onDeny: () => void;
}

export function NoteConfirmationCard({
  gameName,
  noteText,
  onConfirm,
  onDeny,
}: NoteConfirmationCardProps) {
  const [editText, setEditText] = useState(noteText);

  return (
    <div className="action-confirmation-card">
      <div className="action-confirmation-card__header">
        <span className="action-confirmation-card__game-name">Note: {gameName}</span>
      </div>
      <textarea
        className="action-confirmation-card__textarea"
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        placeholder="Write your note..."
        maxLength={5000}
      />
      <div className="action-confirmation-card__actions">
        <button
          className="action-confirmation-card__btn action-confirmation-card__btn--cancel"
          onClick={onDeny}
        >
          Cancel
        </button>
        <button
          className="action-confirmation-card__btn action-confirmation-card__btn--confirm"
          onClick={() => onConfirm(editText)}
        >
          Save Note
        </button>
      </div>
    </div>
  );
}
