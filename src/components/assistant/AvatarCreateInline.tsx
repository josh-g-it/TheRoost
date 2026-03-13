import { memo, useCallback, useState } from "react";
import type { AiAvatar, AiPersonality } from "../../types";
import { assistantApi } from "../../services/tauri";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { AppIcon } from "../common/AppIcon";

interface AvatarCreateInlineProps {
  personalities: AiPersonality[];
  onCreated: (avatar: AiAvatar) => void;
  onCancel: () => void;
}

export const AvatarCreateInline = memo(function AvatarCreateInline({
  personalities,
  onCreated,
  onCancel,
}: AvatarCreateInlineProps) {
  const [name, setName] = useState("");
  const [personalityId, setPersonalityId] = useState(personalities[0]?.id ?? "");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !personalityId) return;
    setIsCreating(true);
    setError("");
    try {
      const avatar = await assistantApi.createAvatar(name.trim(), personalityId);
      logger.info("AvatarCreateInline", "api", "Avatar created", { avatarId: avatar.id });
      onCreated(avatar);
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      logger.error("AvatarCreateInline", "api", "Failed to create avatar", {
        error: msg,
      });
    } finally {
      setIsCreating(false);
    }
  }, [name, personalityId, onCreated]);

  return (
    <div className="avatar-create-inline">
      <div className="avatar-create-inline__row">
        <input
          className="avatar-create-inline__input"
          type="text"
          placeholder="Avatar name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError("");
          }}
          autoFocus
          maxLength={100}
        />
        <select
          className="avatar-create-inline__select"
          value={personalityId}
          onChange={(e) => setPersonalityId(e.target.value)}
        >
          {personalities.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isBuiltin ? " (built-in)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="avatar-create-inline__actions">
        <button
          className="avatar-create-inline__btn avatar-create-inline__btn--primary"
          disabled={!name.trim() || !personalityId || isCreating}
          onClick={handleCreate}
        >
          <AppIcon name="plus" size={12} /> {isCreating ? "Creating..." : "Create"}
        </button>
        <button className="avatar-create-inline__btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <p className="avatar-create-inline__error">{error}</p>}
    </div>
  );
});
