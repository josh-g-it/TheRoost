import { memo } from "react";
import type { AiAvatar, AiPersonality } from "../../types";
import { SpriteRenderer } from "./SpriteRenderer";
import { AppIcon } from "../common/AppIcon";

interface AvatarListPanelProps {
  avatars: AiAvatar[];
  personalities: AiPersonality[];
  selectedAvatarId: string | null;
  activeAvatarId: string;
  spriteDataUrls: Map<string, string | null>;
  onSelect: (avatarId: string) => void;
  onCreateClick: () => void;
}

export const AvatarListPanel = memo(function AvatarListPanel({
  avatars,
  personalities,
  selectedAvatarId,
  activeAvatarId,
  spriteDataUrls,
  onSelect,
  onCreateClick,
}: AvatarListPanelProps) {
  const getPersonalityName = (personalityId: string) =>
    personalities.find((p) => p.id === personalityId)?.name ?? "";

  return (
    <div className="avatar-list-panel">
      <div className="avatar-list-panel__header">
        <h4 className="avatar-list-panel__title">Avatars</h4>
        <button
          className="avatar-list-panel__add-btn"
          onClick={onCreateClick}
          title="Create a new avatar"
          aria-label="Create new avatar"
        >
          <AppIcon name="plus" size={14} />
        </button>
      </div>
      <div className="avatar-list-panel__items">
        {avatars.map((avatar) => {
          const isSelected = avatar.id === selectedAvatarId;
          const isActive = avatar.id === activeAvatarId;
          const spriteUrl = spriteDataUrls.get(avatar.imagePath ?? "") ?? null;

          return (
            <button
              key={avatar.id}
              className={`avatar-list-panel__item${isSelected ? " avatar-list-panel__item--selected" : ""}${isActive ? " avatar-list-panel__item--active" : ""}`}
              onClick={() => onSelect(avatar.id)}
              aria-label={`Select avatar ${avatar.name}`}
              aria-current={isSelected ? "true" : undefined}
            >
              <SpriteRenderer
                spriteDataUrl={spriteUrl}
                expression="neutral"
                size={48}
                fallbackText={avatar.name}
                circular
              />
              <div className="avatar-list-panel__item-info">
                <div className="avatar-list-panel__item-name">{avatar.name}</div>
                <div className="avatar-list-panel__item-personality">
                  {getPersonalityName(avatar.personalityId)}
                </div>
              </div>
              {isActive && (
                <span className="avatar-list-panel__active-badge">Active</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});
