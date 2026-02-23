import { Button } from "../common/Button";
import { APP_NAME } from "../../constants";
import "./WelcomeDialog.css";

interface WelcomeDialogProps {
  onClose: () => void;
}

export function WelcomeDialog({ onClose }: WelcomeDialogProps) {
  return (
    <div className="welcome__overlay" onClick={onClose}>
      <div className="welcome__card" onClick={(e) => e.stopPropagation()}>
        <h2 className="welcome__title">Welcome to {APP_NAME}!</h2>
        <p className="welcome__intro">
          Your game collection is all set up. Here&apos;s a quick look at what&apos;s
          waiting for you.
        </p>

        <div className="welcome__pages">
          <div className="welcome__page">
            <span className="welcome__page-icon">&#128218;</span>
            <div className="welcome__page-info">
              <span className="welcome__page-name">Library</span>
              <span className="welcome__page-desc">
                Browse all your games in customizable shelves or a sortable list. Add
                tags, favorites, and custom games.
              </span>
            </div>
          </div>

          <div className="welcome__page">
            <span className="welcome__page-icon">&#128200;</span>
            <div className="welcome__page-info">
              <span className="welcome__page-name">Activity</span>
              <span className="welcome__page-desc">
                See your play sessions, daily playtime charts, streaks, and a heatmap of
                when you game.
              </span>
            </div>
          </div>

          <div className="welcome__page">
            <span className="welcome__page-icon">&#128100;</span>
            <div className="welcome__page-info">
              <span className="welcome__page-name">Profile</span>
              <span className="welcome__page-desc">
                View your gaming stats, genre breakdown, achievement progress, and
                personalized insights.
              </span>
            </div>
          </div>

          <div className="welcome__page">
            <span className="welcome__page-icon">&#9881;</span>
            <div className="welcome__page-info">
              <span className="welcome__page-name">Settings</span>
              <span className="welcome__page-desc">
                Customize themes, fonts, icons, API keys, and more. Everything is
                tweakable.
              </span>
            </div>
          </div>
        </div>

        <div className="welcome__shortcut">
          <kbd className="welcome__shortcut-kbd">Ctrl+Space</kbd>
          <span className="welcome__shortcut-text">
            Opens the Command Center &mdash; a quick-access bar for navigation, tools, and
            shortcuts.
          </span>
        </div>

        <p className="welcome__streaming">
          Your game details, tags, and achievements are streaming in now. You&apos;ll see
          your library fill in over the next minute or two.
        </p>

        <div className="welcome__actions">
          <Button size="lg" onClick={onClose}>
            Got it!
          </Button>
        </div>
      </div>
    </div>
  );
}
