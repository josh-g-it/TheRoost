import { useUIStore } from "../../store/uiSlice";
import { AppIcon } from "../common/AppIcon";
import { GenreTag } from "../common/GenreTag";
import { UserTag } from "../common/UserTag";
import "./CardDisplaySettings.css";

export function CardDisplaySettings() {
  const cardDisplay = useUIStore((s) => s.cardDisplay);
  const setCardDisplay = useUIStore((s) => s.setCardDisplay);

  const toggle = (key: keyof typeof cardDisplay) => {
    setCardDisplay({ ...cardDisplay, [key]: !cardDisplay[key] });
  };

  return (
    <div className="card-display-settings">
      <div className="card-display-settings__controls">
        <label className="card-display-settings__option">
          <input
            type="checkbox"
            checked={cardDisplay.showGenreTags}
            onChange={() => toggle("showGenreTags")}
          />
          <span>Genre tags</span>
        </label>
        <label className="card-display-settings__option">
          <input
            type="checkbox"
            checked={cardDisplay.showPlaytime}
            onChange={() => toggle("showPlaytime")}
          />
          <span>Playtime</span>
        </label>
        <label className="card-display-settings__option">
          <input
            type="checkbox"
            checked={cardDisplay.showInstalledBadge}
            onChange={() => toggle("showInstalledBadge")}
          />
          <span>Installed badge</span>
        </label>
        <label className="card-display-settings__option">
          <input
            type="checkbox"
            checked={cardDisplay.showTags}
            onChange={() => toggle("showTags")}
          />
          <span>Custom tags</span>
        </label>
        <label className="card-display-settings__option">
          <input
            type="checkbox"
            checked={cardDisplay.showRatingBadge}
            onChange={() => toggle("showRatingBadge")}
          />
          <span>My Rating</span>
        </label>
      </div>

      <div className="card-display-settings__preview">
        <h4 className="card-display-settings__preview-title">Preview</h4>
        <div className="card-display-settings__preview-card">
          <div className="card-display-settings__preview-image">
            <span className="card-display-settings__preview-placeholder">Game Image</span>
          </div>
          <div className="card-display-settings__preview-overlay">
            <span className="card-display-settings__preview-name">Example Game</span>
            {cardDisplay.showGenreTags && (
              <div className="card-display-settings__preview-genres">
                <GenreTag label="Action" />
                <GenreTag label="RPG" />
              </div>
            )}
            {cardDisplay.showTags && (
              <div className="card-display-settings__preview-tags">
                <UserTag label="Favorites" colorIndex={0} />
                <UserTag label="Co-op" colorIndex={2} />
              </div>
            )}
            <div className="card-display-settings__preview-meta">
              {cardDisplay.showPlaytime && (
                <span className="card-display-settings__preview-playtime">42h 30m</span>
              )}
              {cardDisplay.showInstalledBadge && (
                <span className="card-display-settings__preview-installed">
                  Installed
                </span>
              )}
              {cardDisplay.showRatingBadge && (
                <span className="card-display-settings__preview-rating">
                  <AppIcon name="star-filled" size={10} />
                  4.5
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
