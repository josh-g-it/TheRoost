import { memo, useState } from "react";
import "./ActionConfirmationCard.css";

interface NoteConfirmationCardProps {
  gameName: string;
  noteText: string;
  existingContent?: string;
  onConfirm: (noteText: string) => void;
  onDeny: () => void;
}

export const NoteConfirmationCard = memo(function NoteConfirmationCard({
  gameName,
  noteText,
  existingContent,
  onConfirm,
  onDeny,
}: NoteConfirmationCardProps) {
  const [editText, setEditText] = useState(noteText);

  return (
    <div
      className="action-confirmation-card"
      role="alertdialog"
      aria-label={`Note confirmation for ${gameName}`}
    >
      <div className="action-confirmation-card__header">
        <span className="action-confirmation-card__game-name">
          {existingContent ? "Append to Note: " : "Note: "}
          {gameName}
        </span>
      </div>
      {existingContent && (
        <div className="action-confirmation-card__existing-note">
          <div className="action-confirmation-card__existing-note-label">
            Existing note:
          </div>
          <div className="action-confirmation-card__existing-note-content">
            {existingContent}
          </div>
        </div>
      )}
      <textarea
        className="action-confirmation-card__textarea"
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        placeholder={existingContent ? "Text to append..." : "Write your note..."}
        maxLength={5000}
      />
      <div className="action-confirmation-card__actions">
        <button
          className="action-confirmation-card__btn action-confirmation-card__btn--cancel"
          onClick={onDeny}
          aria-label="Cancel note"
        >
          Cancel
        </button>
        <button
          className="action-confirmation-card__btn action-confirmation-card__btn--confirm"
          onClick={() => onConfirm(editText)}
          aria-label={existingContent ? "Append to note" : "Save note"}
        >
          {existingContent ? "Append to Note" : "Save Note"}
        </button>
      </div>
    </div>
  );
});
