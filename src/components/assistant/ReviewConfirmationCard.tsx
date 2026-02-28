import { useState } from "react";
import { StarRating } from "../common/StarRating";
import "./ActionConfirmationCard.css";

interface ReviewConfirmationCardProps {
  gameName: string;
  stars: number;
  reviewText: string;
  onConfirm: (stars: number, reviewText: string) => void;
  onDeny: () => void;
}

export function ReviewConfirmationCard({
  gameName,
  stars,
  reviewText,
  onConfirm,
  onDeny,
}: ReviewConfirmationCardProps) {
  const [editStars, setEditStars] = useState(stars);
  const [editText, setEditText] = useState(reviewText);

  return (
    <div className="action-confirmation-card">
      <div className="action-confirmation-card__header">
        <span className="action-confirmation-card__game-name">Review: {gameName}</span>
      </div>
      <div className="action-confirmation-card__rating">
        <StarRating
          value={editStars * 2}
          onChange={(v) => setEditStars(v / 2)}
          size={18}
        />
      </div>
      <textarea
        className="action-confirmation-card__textarea"
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        placeholder="Write your review..."
        maxLength={2000}
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
          onClick={() => onConfirm(editStars, editText)}
        >
          Save Review
        </button>
      </div>
    </div>
  );
}
