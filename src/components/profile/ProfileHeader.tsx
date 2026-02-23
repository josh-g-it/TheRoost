import type { PlayerSummary } from "../../types";
import type { QuickStats } from "../../types/profile";
import { StatCard } from "../common/StatCard";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { countryCodeToFlag } from "../../utils/profileStats";
import { formatPlaytime } from "../../utils/formatters";
import "./ProfileHeader.css";

interface ProfileHeaderProps {
  playerSummary: PlayerSummary | null;
  quickStats: QuickStats;
  isLoading: boolean;
}

function formatMemberSince(timeCreated: number): string {
  const date = new Date(timeCreated * 1000);
  const month = date.toLocaleString("en-US", { month: "long" });
  const year = date.getFullYear();
  const now = new Date();
  const years = now.getFullYear() - year;
  return `Member since ${month} ${year} (${years} year${years !== 1 ? "s" : ""})`;
}

export function ProfileHeader({
  playerSummary,
  quickStats,
  isLoading,
}: ProfileHeaderProps) {
  if (isLoading && !playerSummary) {
    return (
      <div className="profile-header">
        <div className="profile-header__loading">
          <LoadingSpinner size="md" message="Loading profile..." />
        </div>
      </div>
    );
  }

  if (!isLoading && !playerSummary) {
    return (
      <div className="profile-header">
        <div className="profile-header__empty">
          Configure your Steam API key and Steam ID in Settings to view your profile.
        </div>
        <div className="profile-header__stats">
          <StatCard label="Total Games" value={String(quickStats.totalGames)} />
          <StatCard
            label="Total Playtime"
            value={formatPlaytime(quickStats.totalPlaytimeHours * 60)}
          />
          <StatCard label="Installed" value={String(quickStats.installedCount)} />
          <StatCard label="Favorites" value={String(quickStats.favoritesCount)} />
        </div>
      </div>
    );
  }

  return (
    <div className="profile-header">
      <div className="profile-header__identity">
        {playerSummary && (
          <>
            <img
              className="profile-header__avatar"
              src={playerSummary.avatarFull}
              alt={`${playerSummary.personaName}'s avatar`}
            />
            <div className="profile-header__info">
              <h2 className="profile-header__name">
                {playerSummary.personaName}
                {playerSummary.locCountryCode && (
                  <span className="profile-header__flag">
                    {countryCodeToFlag(playerSummary.locCountryCode)}
                  </span>
                )}
              </h2>
              {playerSummary.timeCreated != null && (
                <span className="profile-header__meta">
                  {formatMemberSince(playerSummary.timeCreated)}
                </span>
              )}
              <a
                className="profile-header__link"
                href={playerSummary.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View Steam Profile
              </a>
            </div>
          </>
        )}
      </div>
      <div className="profile-header__stats">
        <StatCard label="Total Games" value={String(quickStats.totalGames)} />
        <StatCard
          label="Total Playtime"
          value={formatPlaytime(quickStats.totalPlaytimeHours * 60)}
        />
        <StatCard label="Installed" value={String(quickStats.installedCount)} />
        <StatCard label="Favorites" value={String(quickStats.favoritesCount)} />
      </div>
    </div>
  );
}
