import { useCallback, useEffect, useState } from "react";
import type { AiAvatar, AiPersonality } from "../../types";
import { assistantApi } from "../../services/tauri";
import { getAvatarColor } from "../../utils/avatarColors";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { AppIcon } from "../common/AppIcon";
import "./AssistantAvatars.css";

interface AssistantAvatarsProps {
  activeAvatarId: string;
  onAvatarSwitch: (avatarId: string) => void;
  onAvatarDeleted?: (deletedAvatarId: string) => void;
  onAvatarDataWiped?: (avatarId: string) => void;
}

export function AssistantAvatars({
  activeAvatarId,
  onAvatarSwitch,
  onAvatarDeleted,
  onAvatarDataWiped,
}: AssistantAvatarsProps) {
  const [avatars, setAvatars] = useState<AiAvatar[]>([]);
  const [personalities, setPersonalities] = useState<AiPersonality[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create avatar form
  const [newAvatarName, setNewAvatarName] = useState("");
  const [newAvatarPersonalityId, setNewAvatarPersonalityId] = useState("");
  const [isCreatingAvatar, setIsCreatingAvatar] = useState(false);

  // Create personality form
  const [showCreatePersonality, setShowCreatePersonality] = useState(false);
  const [newPersonalityName, setNewPersonalityName] = useState("");
  const [newPersonalityPrompt, setNewPersonalityPrompt] = useState("");
  const [isCreatingPersonality, setIsCreatingPersonality] = useState(false);

  // Delete / wipe state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmWipeId, setConfirmWipeId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isWiping, setIsWiping] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [avatarList, personalityList] = await Promise.all([
        assistantApi.listAvatars(),
        assistantApi.listPersonalities(),
      ]);
      setAvatars(avatarList);
      setPersonalities(personalityList);
      if (personalityList.length > 0 && !newAvatarPersonalityId) {
        setNewAvatarPersonalityId(personalityList[0].id);
      }
    } catch (err) {
      logger.error("AssistantAvatars", "api", "Failed to load avatars", {
        error: getErrorMessage(err),
      });
    } finally {
      setIsLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateAvatar = useCallback(async () => {
    if (!newAvatarName.trim() || !newAvatarPersonalityId) return;
    setIsCreatingAvatar(true);
    try {
      const avatar = await assistantApi.createAvatar(
        newAvatarName.trim(),
        newAvatarPersonalityId,
      );
      setAvatars((prev) => [...prev, avatar]);
      setNewAvatarName("");
      logger.info("AssistantAvatars", "api", "Avatar created", { avatarId: avatar.id });
    } catch (err) {
      logger.error("AssistantAvatars", "api", "Failed to create avatar", {
        error: getErrorMessage(err),
      });
    } finally {
      setIsCreatingAvatar(false);
    }
  }, [newAvatarName, newAvatarPersonalityId]);

  const handleSwitchAvatar = useCallback(
    async (avatarId: string) => {
      try {
        await assistantApi.switchAvatar(avatarId);
        setAvatars((prev) => prev.map((a) => ({ ...a, isActive: a.id === avatarId })));
        onAvatarSwitch(avatarId);
        logger.info("AssistantAvatars", "api", "Avatar switched", { avatarId });
      } catch (err) {
        logger.error("AssistantAvatars", "api", "Failed to switch avatar", {
          error: getErrorMessage(err),
        });
      }
    },
    [onAvatarSwitch],
  );

  const handleDeleteAvatar = useCallback(
    async (avatarId: string) => {
      setIsDeleting(true);
      try {
        await assistantApi.deleteAvatar(avatarId);
        setAvatars((prev) => prev.filter((a) => a.id !== avatarId));
        onAvatarDeleted?.(avatarId);
        logger.info("AssistantAvatars", "api", "Avatar deleted", { avatarId });
      } catch (err) {
        logger.error("AssistantAvatars", "api", "Failed to delete avatar", {
          error: getErrorMessage(err),
        });
      } finally {
        setIsDeleting(false);
        setConfirmDeleteId(null);
      }
    },
    [onAvatarDeleted],
  );

  const handleWipeAvatarData = useCallback(
    async (avatarId: string) => {
      setIsWiping(true);
      try {
        await assistantApi.wipeAvatarData(avatarId);
        onAvatarDataWiped?.(avatarId);
        logger.info("AssistantAvatars", "api", "Avatar data wiped", { avatarId });
      } catch (err) {
        logger.error("AssistantAvatars", "api", "Failed to wipe avatar data", {
          error: getErrorMessage(err),
        });
      } finally {
        setIsWiping(false);
        setConfirmWipeId(null);
      }
    },
    [onAvatarDataWiped],
  );

  const handleCreatePersonality = useCallback(async () => {
    if (!newPersonalityName.trim() || !newPersonalityPrompt.trim()) return;
    setIsCreatingPersonality(true);
    try {
      const personality = await assistantApi.createPersonality(
        newPersonalityName.trim(),
        newPersonalityPrompt.trim(),
      );
      setPersonalities((prev) => [...prev, personality]);
      setNewPersonalityName("");
      setNewPersonalityPrompt("");
      setShowCreatePersonality(false);
      logger.info("AssistantAvatars", "api", "Personality created", {
        personalityId: personality.id,
      });
    } catch (err) {
      logger.error("AssistantAvatars", "api", "Failed to create personality", {
        error: getErrorMessage(err),
      });
    } finally {
      setIsCreatingPersonality(false);
    }
  }, [newPersonalityName, newPersonalityPrompt]);

  const getPersonalityName = (personalityId: string) => {
    return personalities.find((p) => p.id === personalityId)?.name ?? "Unknown";
  };

  if (isLoading) {
    return (
      <div className="assistant-avatars">
        <div className="assistant-avatars__content">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="assistant-avatars">
      <div className="assistant-avatars__content">
        <div>
          <h4 className="assistant-avatars__section-title">Avatars</h4>
          <div className="assistant-avatars__list">
            {avatars.map((avatar) => (
              <div
                key={avatar.id}
                className={`avatar-item ${avatar.id === activeAvatarId ? "avatar-item--active" : ""}`}
              >
                <div
                  className="avatar-item__circle"
                  style={{ background: getAvatarColor(avatar.name) }}
                >
                  {avatar.name.charAt(0).toUpperCase()}
                </div>
                <div className="avatar-item__info">
                  <div className="avatar-item__name">{avatar.name}</div>
                  <div className="avatar-item__personality">
                    {getPersonalityName(avatar.personalityId)}
                  </div>
                </div>
                <div className="avatar-item__actions">
                  {avatar.id === activeAvatarId ? (
                    <span className="avatar-item__active-badge">Active</span>
                  ) : (
                    <button
                      className="avatar-item__switch-btn"
                      onClick={() => handleSwitchAvatar(avatar.id)}
                    >
                      Switch
                    </button>
                  )}
                  <div className="avatar-item__action-row">
                    <button
                      className="avatar-item__action-btn avatar-item__action-btn--wipe"
                      title="Clear all data for this avatar"
                      onClick={() => setConfirmWipeId(avatar.id)}
                    >
                      <AppIcon name="close" size={12} /> Clear Data
                    </button>
                    {avatar.id !== activeAvatarId && avatars.length > 1 && (
                      <button
                        className="avatar-item__action-btn avatar-item__action-btn--delete"
                        title="Delete this avatar"
                        onClick={() => setConfirmDeleteId(avatar.id)}
                      >
                        <AppIcon name="trash" size={12} /> Delete
                      </button>
                    )}
                  </div>
                </div>

                {confirmDeleteId === avatar.id && (
                  <div className="avatar-item__confirm-overlay">
                    <p className="avatar-item__confirm-text">
                      Delete <strong>{avatar.name}</strong>? All conversations, memories,
                      and journal entries for this avatar will be permanently deleted.
                      This cannot be undone.
                    </p>
                    <div className="avatar-item__confirm-actions">
                      <button
                        className="avatar-item__confirm-btn avatar-item__confirm-btn--danger"
                        disabled={isDeleting}
                        onClick={() => handleDeleteAvatar(avatar.id)}
                      >
                        {isDeleting ? "Deleting..." : "Delete"}
                      </button>
                      <button
                        className="avatar-item__confirm-btn"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {confirmWipeId === avatar.id && (
                  <div className="avatar-item__confirm-overlay">
                    <p className="avatar-item__confirm-text">
                      Clear all data for <strong>{avatar.name}</strong>? This will delete
                      all memories, journal entries, and conversation history for this
                      avatar. The avatar itself will be kept. This cannot be undone.
                    </p>
                    <div className="avatar-item__confirm-actions">
                      <button
                        className="avatar-item__confirm-btn avatar-item__confirm-btn--danger"
                        disabled={isWiping}
                        onClick={() => handleWipeAvatarData(avatar.id)}
                      >
                        {isWiping ? "Clearing..." : "Clear Data"}
                      </button>
                      <button
                        className="avatar-item__confirm-btn"
                        onClick={() => setConfirmWipeId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="assistant-avatars__section-title">Create Avatar</h4>
          <div className="assistant-avatars__form">
            <label className="assistant-avatars__form-label">Name</label>
            <input
              className="assistant-avatars__form-input"
              type="text"
              placeholder="Avatar name"
              value={newAvatarName}
              onChange={(e) => setNewAvatarName(e.target.value)}
            />
            <label className="assistant-avatars__form-label">Personality</label>
            <select
              className="assistant-avatars__form-select"
              value={newAvatarPersonalityId}
              onChange={(e) => setNewAvatarPersonalityId(e.target.value)}
            >
              {personalities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isBuiltin ? " (built-in)" : ""}
                </option>
              ))}
            </select>
            <button
              className="assistant-avatars__form-btn"
              disabled={
                !newAvatarName.trim() || !newAvatarPersonalityId || isCreatingAvatar
              }
              onClick={handleCreateAvatar}
            >
              <AppIcon name="plus" size={14} /> Create Avatar
            </button>
          </div>
        </div>

        <div>
          <h4 className="assistant-avatars__section-title">Personalities</h4>
          <div className="assistant-avatars__list">
            {personalities.map((personality) => (
              <div key={personality.id} className="personality-item">
                <div className="personality-item__header">
                  <span className="personality-item__name">{personality.name}</span>
                  {personality.isBuiltin && (
                    <span className="personality-item__badge">Built-in</span>
                  )}
                </div>
                <p className="personality-item__prompt">{personality.promptText}</p>
              </div>
            ))}
          </div>

          {!showCreatePersonality ? (
            <button
              className="assistant-avatars__form-btn"
              style={{ marginTop: "0.5rem" }}
              onClick={() => setShowCreatePersonality(true)}
            >
              <AppIcon name="plus" size={14} /> Custom Personality
            </button>
          ) : (
            <div className="assistant-avatars__form" style={{ marginTop: "0.5rem" }}>
              <label className="assistant-avatars__form-label">Personality Name</label>
              <input
                className="assistant-avatars__form-input"
                type="text"
                placeholder="My Custom Personality"
                value={newPersonalityName}
                onChange={(e) => setNewPersonalityName(e.target.value)}
              />
              <label className="assistant-avatars__form-label">System Prompt</label>
              <textarea
                className="assistant-avatars__form-textarea"
                placeholder="Describe how this personality should behave..."
                value={newPersonalityPrompt}
                onChange={(e) => setNewPersonalityPrompt(e.target.value)}
              />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  className="assistant-avatars__form-btn"
                  disabled={
                    !newPersonalityName.trim() ||
                    !newPersonalityPrompt.trim() ||
                    isCreatingPersonality
                  }
                  onClick={handleCreatePersonality}
                >
                  Create
                </button>
                <button
                  className="assistant-avatars__form-btn"
                  style={{
                    background: "var(--color-bg-hover)",
                    color: "var(--color-text-secondary)",
                  }}
                  onClick={() => {
                    setShowCreatePersonality(false);
                    setNewPersonalityName("");
                    setNewPersonalityPrompt("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
