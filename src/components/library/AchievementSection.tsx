import { useEffect, useState } from "react";
import { useAchievementsStore } from "../../store/achievementsSlice";
import type { GameAchievement } from "../../types";
import "./AchievementSection.css";

interface AchievementSectionProps {
  gameId: string;
  source: string;
}

export function AchievementSection({ gameId, source }: AchievementSectionProps) {
  const fetchAchievements = useAchievementsStore((s) => s.fetchGameAchievements);
  const cached = useAchievementsStore((s) => s.getAchievements(gameId));
  const privacyError = useAchievementsStore((s) => s.privacyError);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (source === "steam") {
      fetchAchievements(gameId);
    }
  }, [gameId, source, fetchAchievements]);

  // Only show for Steam games
  if (source !== "steam") return null;

  // Show privacy error banner if Steam returned 403
  if (privacyError) {
    return (
      <section className="achievement-section">
        <h3 className="achievement-section__title">Achievements</h3>
        <div className="achievement-section__privacy-error">
          <p>{privacyError}</p>
        </div>
      </section>
    );
  }

  // Don't show anything until we have real data (avoids loading flash for games
  // without achievements). The section simply appears when data arrives.
  if (!cached || cached.total === 0) return null;

  const { total, unlocked, achievements } = cached;
  const percent = Math.round((unlocked / total) * 100);

  // Rarest unlocked: achieved + sorted by globalPercent ascending
  const rarestUnlocked = achievements
    .filter((a) => a.achieved && a.globalPercent != null)
    .sort((a, b) => (a.globalPercent ?? 100) - (b.globalPercent ?? 100))
    .slice(0, 5);

  // Recent unlocks: achieved + sorted by unlockTime descending
  const recentUnlocks = achievements
    .filter((a) => a.achieved && a.unlockTime != null)
    .sort((a, b) => (b.unlockTime ?? 0) - (a.unlockTime ?? 0))
    .slice(0, 5);

  // Full list for "Show All"
  const achievedList = achievements.filter((a) => a.achieved);
  const lockedList = achievements.filter((a) => !a.achieved);

  return (
    <section className="achievement-section">
      <h3 className="achievement-section__title">Achievements</h3>

      {/* Progress bar */}
      <div className="achievement-section__progress">
        <div className="achievement-section__progress-info">
          <span className="achievement-section__progress-text">
            {unlocked} / {total}
          </span>
          <span className="achievement-section__progress-percent">{percent}%</span>
        </div>
        <div className="achievement-section__progress-bar">
          <div
            className="achievement-section__progress-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Rarest Unlocked */}
      {rarestUnlocked.length > 0 && (
        <div className="achievement-section__group">
          <h4 className="achievement-section__group-title">Rarest Unlocked</h4>
          <div className="achievement-section__rarest-row">
            {rarestUnlocked.map((a) => (
              <AchievementIcon key={a.apiName} achievement={a} showPercent />
            ))}
          </div>
        </div>
      )}

      {/* Recent Unlocks */}
      {recentUnlocks.length > 0 && (
        <div className="achievement-section__group">
          <h4 className="achievement-section__group-title">Recent Unlocks</h4>
          <div className="achievement-section__recent-list">
            {recentUnlocks.map((a) => (
              <AchievementRow key={a.apiName} achievement={a} />
            ))}
          </div>
        </div>
      )}

      {/* Show All toggle */}
      {!showAll && total > 5 && (
        <button
          className="achievement-section__show-all"
          onClick={() => setShowAll(true)}
        >
          Show All ({total})
        </button>
      )}

      {showAll && (
        <div className="achievement-section__full-list">
          {achievedList.length > 0 && (
            <div className="achievement-section__group">
              <h4 className="achievement-section__group-title">
                Unlocked ({achievedList.length})
              </h4>
              <div className="achievement-section__grid">
                {achievedList.map((a) => (
                  <AchievementIcon key={a.apiName} achievement={a} showPercent />
                ))}
              </div>
            </div>
          )}
          {lockedList.length > 0 && (
            <div className="achievement-section__group">
              <h4 className="achievement-section__group-title">
                Locked ({lockedList.length})
              </h4>
              <div className="achievement-section__grid">
                {lockedList.map((a) => (
                  <AchievementIcon key={a.apiName} achievement={a} locked />
                ))}
              </div>
            </div>
          )}
          <button
            className="achievement-section__show-all"
            onClick={() => setShowAll(false)}
          >
            Show Less
          </button>
        </div>
      )}
    </section>
  );
}

function AchievementIcon({
  achievement,
  showPercent,
  locked,
}: {
  achievement: GameAchievement;
  showPercent?: boolean;
  locked?: boolean;
}) {
  const iconUrl = locked ? achievement.iconGrayUrl : achievement.iconUrl;
  const displayName =
    achievement.hidden && !achievement.achieved
      ? "Hidden Achievement"
      : achievement.displayName;

  return (
    <div
      className={`achievement-icon ${locked ? "achievement-icon--locked" : ""}`}
      title={`${displayName}${achievement.description ? `\n${achievement.description}` : ""}${achievement.globalPercent != null ? `\n${achievement.globalPercent.toFixed(1)}% of players` : ""}`}
    >
      {iconUrl ? (
        <img
          src={iconUrl}
          alt={displayName}
          className="achievement-icon__img"
          loading="lazy"
        />
      ) : (
        <div className="achievement-icon__placeholder">{locked ? "?" : "\u2605"}</div>
      )}
      {showPercent && achievement.globalPercent != null && (
        <span className="achievement-icon__percent">
          {achievement.globalPercent.toFixed(1)}%
        </span>
      )}
    </div>
  );
}

function AchievementRow({ achievement }: { achievement: GameAchievement }) {
  const date = achievement.unlockTime
    ? new Date(achievement.unlockTime * 1000).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="achievement-row">
      <div className="achievement-row__icon">
        {achievement.iconUrl ? (
          <img
            src={achievement.iconUrl}
            alt={achievement.displayName}
            className="achievement-row__img"
            loading="lazy"
          />
        ) : (
          <div className="achievement-icon__placeholder">{"\u2605"}</div>
        )}
      </div>
      <div className="achievement-row__info">
        <span className="achievement-row__name">{achievement.displayName}</span>
        {achievement.description && (
          <span className="achievement-row__desc">{achievement.description}</span>
        )}
      </div>
      <div className="achievement-row__meta">
        {date && <span className="achievement-row__date">{date}</span>}
        {achievement.globalPercent != null && (
          <span className="achievement-row__percent">
            {achievement.globalPercent.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
