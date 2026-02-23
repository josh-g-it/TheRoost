import type { ShelfConfig, ShelfDisplayMode } from "../../types";
import type { IconName } from "../../utils/icons";
import { AppIcon } from "../common/AppIcon";
import { useShelvesStore } from "../../store/shelvesSlice";
import "./ShelfHeader.css";

interface ShelfHeaderProps {
  shelf: ShelfConfig;
  gameCount: number;
  shelfCount: number;
  shelfIndex: number;
  onPersist: () => void;
}

const DISPLAY_MODES: { mode: ShelfDisplayMode; icon: IconName; label: string }[] = [
  { mode: "collapsed", icon: "shelf-collapsed", label: "Collapsed (1 row)" },
  { mode: "extended", icon: "shelf-extended", label: "Extended (2 rows)" },
  { mode: "expanded", icon: "shelf-expanded", label: "Expanded (full grid)" },
];

export function ShelfHeader({
  shelf,
  gameCount,
  shelfCount,
  shelfIndex,
  onPersist,
}: ShelfHeaderProps) {
  const setDisplayMode = useShelvesStore((s) => s.setDisplayMode);
  const toggleGroupByGenre = useShelvesStore((s) => s.toggleGroupByGenre);
  const setEditingShelf = useShelvesStore((s) => s.setEditingShelf);
  const removeShelf = useShelvesStore((s) => s.removeShelf);
  const reorderShelves = useShelvesStore((s) => s.reorderShelves);

  const handleDisplayMode = (mode: ShelfDisplayMode) => {
    setDisplayMode(shelf.id, mode);
    onPersist();
  };

  const handleToggleGenre = () => {
    toggleGroupByGenre(shelf.id);
    onPersist();
  };

  const handleMoveUp = () => {
    if (shelfIndex <= 0) return;
    reorderShelves(shelfIndex, shelfIndex - 1);
    onPersist();
  };

  const handleMoveDown = () => {
    if (shelfIndex >= shelfCount - 1) return;
    reorderShelves(shelfIndex, shelfIndex + 1);
    onPersist();
  };

  const handleRemove = () => {
    if (shelfCount <= 1) return;
    removeShelf(shelf.id);
    onPersist();
  };

  return (
    <div className="shelf-header">
      <div className="shelf-header__left">
        <span className="shelf-header__name">{shelf.name}</span>
        <span className="shelf-header__count">({gameCount})</span>
      </div>

      <div className="shelf-header__right">
        {/* Display mode toggle */}
        <div className="shelf-header__mode-group">
          {DISPLAY_MODES.map(({ mode, icon, label }) => (
            <button
              key={mode}
              className={`shelf-header__mode-btn ${shelf.displayMode === mode ? "shelf-header__mode-btn--active" : ""}`}
              onClick={() => handleDisplayMode(mode)}
              aria-label={label}
              aria-pressed={shelf.displayMode === mode}
              title={label}
            >
              <AppIcon name={icon} size={14} />
            </button>
          ))}
        </div>

        {/* Group by genre toggle */}
        <button
          className={`shelf-header__action-btn ${shelf.groupByGenre ? "shelf-header__action-btn--active" : ""}`}
          onClick={handleToggleGenre}
          aria-label="Group by genre"
          aria-pressed={shelf.groupByGenre}
          title="Group by genre"
        >
          <AppIcon name="genre" size={14} />
        </button>

        <span className="shelf-header__separator" />

        {/* Reorder */}
        <button
          className="shelf-header__action-btn"
          onClick={handleMoveUp}
          disabled={shelfIndex <= 0}
          aria-label="Move shelf up"
          title="Move up"
        >
          <AppIcon name="chevron-up" size={12} />
        </button>
        <button
          className="shelf-header__action-btn"
          onClick={handleMoveDown}
          disabled={shelfIndex >= shelfCount - 1}
          aria-label="Move shelf down"
          title="Move down"
        >
          <AppIcon name="chevron-down" size={12} />
        </button>

        <span className="shelf-header__separator" />

        {/* Edit */}
        <button
          className="shelf-header__action-btn"
          onClick={() => setEditingShelf(shelf.id)}
          aria-label="Edit shelf"
          title="Edit shelf"
        >
          <AppIcon name="edit" size={12} />
        </button>

        {/* Remove */}
        <button
          className="shelf-header__action-btn"
          onClick={handleRemove}
          disabled={shelfCount <= 1}
          aria-label="Remove shelf"
          title="Remove shelf"
        >
          <AppIcon name="close" size={12} />
        </button>
      </div>
    </div>
  );
}
