import { memo, useState } from "react";
import { StarRating } from "../common/StarRating";
import "./ReviewConfirmation.css";

interface ReviewConfirmationProps {
  gameId: string;
  gameName: string;
  stars: number;
  reviewText: string;
  onSave: (gameId: string, stars: number, reviewText: string) => void;
  onSkip: () => void;
}

export const ReviewConfirmation = memo(function ReviewConfirmation({
  gameId,
  gameName,
  stars,
  reviewText,
  onSave,
  onSkip,
}: ReviewConfirmationProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(reviewText);

  return (
    <div className="review-confirmation">
      <div className="review-confirmation__header">
        <span className="review-confirmation__game-name">{gameName}</span>
        <StarRating value={stars * 2} size={16} />
      </div>
      {isEditing ? (
        <textarea
          className="review-confirmation__textarea"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          autoFocus
          maxLength={2000}
        />
      ) : (
        <p className="review-confirmation__text">{editText || "(No review text)"}</p>
      )}
      <div className="review-confirmation__actions">
        <button
          className="review-confirmation__btn review-confirmation__btn--skip"
          onClick={onSkip}
        >
          Skip
        </button>
        {!isEditing && (
          <button
            className="review-confirmation__btn review-confirmation__btn--edit"
            onClick={() => setIsEditing(true)}
          >
            Edit
          </button>
        )}
        <button
          className="review-confirmation__btn review-confirmation__btn--save"
          onClick={() => onSave(gameId, stars, editText)}
        >
          Save
        </button>
      </div>
    </div>
  );
});
