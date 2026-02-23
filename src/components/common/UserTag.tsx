import { AppIcon } from "./AppIcon";
import "./UserTag.css";

interface UserTagProps {
  label: string;
  colorIndex: number;
  size?: "sm" | "md";
  onRemove?: () => void;
}

export function UserTag({ label, colorIndex, size = "sm", onRemove }: UserTagProps) {
  return (
    <span
      className={`user-tag user-tag--${size}`}
      style={{ backgroundColor: `var(--tag-color-${colorIndex})` } as React.CSSProperties}
    >
      <span className="user-tag__label">{label}</span>
      {onRemove && (
        <button
          className="user-tag__remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${label}`}
        >
          <AppIcon name="close" size={10} />
        </button>
      )}
    </span>
  );
}
