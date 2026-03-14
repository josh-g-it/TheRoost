import { memo, useCallback, useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import type {
  AiAvatar,
  AiPersonality,
  AvatarStats,
  CompanionRolePreset,
  Expression,
} from "../../types";
import { EXPRESSION_GRID, EXPRESSION_LABELS } from "../../types/assistant";
import { assistantApi, spriteApi } from "../../services/tauri";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { SpriteRenderer } from "./SpriteRenderer";
import { AppIcon } from "../common/AppIcon";

interface AvatarDetailPanelProps {
  avatar: AiAvatar;
  isActive: boolean;
  personalities: AiPersonality[];
  companionRoles: CompanionRolePreset[];
  spriteDataUrl: string | null;
  avatarCount: number;
  onAvatarUpdated: (updated: AiAvatar) => void;
  onAvatarDeleted: (avatarId: string) => void;
  onAvatarDataWiped: (avatarId: string) => void;
  onAvatarSwitch: (avatarId: string) => void;
  onChangeSpriteClick: () => void;
  isStreaming?: boolean;
}

const CUSTOM_ROLE_OPTION = "__custom__";

export const AvatarDetailPanel = memo(function AvatarDetailPanel({
  avatar,
  isActive,
  isStreaming = false,
  personalities,
  companionRoles,
  spriteDataUrl,
  avatarCount,
  onAvatarUpdated,
  onAvatarDeleted,
  onAvatarDataWiped,
  onAvatarSwitch,
  onChangeSpriteClick,
}: AvatarDetailPanelProps) {
  // Editable name state (LT-05)
  const [editName, setEditName] = useState(avatar.name);
  const [nameError, setNameError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Expression preview state
  const [previewExpression, setPreviewExpression] = useState<Expression>("neutral");

  // Custom role state
  const [showCustomRole, setShowCustomRole] = useState(
    avatar.companionRoleId === null && avatar.companionRoleCustom !== null,
  );
  const [customRoleText, setCustomRoleText] = useState(avatar.companionRoleCustom ?? "");

  // Stats
  const [stats, setStats] = useState<AvatarStats | null>(null);

  // Confirmation dialogs
  const [confirmAction, setConfirmAction] = useState<"delete" | "wipe" | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Sync local state when avatar prop changes
  useEffect(() => {
    setEditName(avatar.name);
    setNameError("");
    setPreviewExpression("neutral");
    setShowCustomRole(
      avatar.companionRoleId === null && avatar.companionRoleCustom !== null,
    );
    setCustomRoleText(avatar.companionRoleCustom ?? "");
    setConfirmAction(null);
  }, [avatar.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load stats
  useEffect(() => {
    let canceled = false;
    assistantApi
      .getAvatarStats(avatar.id)
      .then((s) => {
        if (!canceled) setStats(s);
      })
      .catch(() => {
        if (!canceled) setStats(null);
      });
    return () => {
      canceled = true;
    };
  }, [avatar.id]);

  // ── Name auto-save ──────────────────────────────────────────────
  const saveName = useCallback(async () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === avatar.name) {
      setEditName(avatar.name);
      setNameError("");
      return;
    }
    try {
      const updated = await assistantApi.updateAvatar(avatar.id, { name: trimmed });
      onAvatarUpdated(updated);
      setNameError("");
    } catch (err) {
      setNameError(getErrorMessage(err));
      setEditName(avatar.name);
    }
  }, [editName, avatar.id, avatar.name, onAvatarUpdated]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        nameInputRef.current?.blur();
      } else if (e.key === "Escape") {
        setEditName(avatar.name);
        setNameError("");
        nameInputRef.current?.blur();
      }
    },
    [avatar.name],
  );

  // ── Pickers auto-save ──────────────────────────────────────────
  const handlePersonalityChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newId = e.target.value;
      try {
        const updated = await assistantApi.updateAvatar(avatar.id, {
          personalityId: newId,
        });
        onAvatarUpdated(updated);
      } catch (err) {
        logger.error("AvatarDetailPanel", "api", "Failed to update personality", {
          error: getErrorMessage(err),
        });
      }
    },
    [avatar.id, onAvatarUpdated],
  );

  const handleRoleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      if (val === CUSTOM_ROLE_OPTION) {
        setShowCustomRole(true);
        return;
      }
      setShowCustomRole(false);
      try {
        const updated = await assistantApi.updateAvatar(avatar.id, {
          companionRoleId: val || null,
          companionRoleCustom: null,
        });
        onAvatarUpdated(updated);
      } catch (err) {
        logger.error("AvatarDetailPanel", "api", "Failed to update role", {
          error: getErrorMessage(err),
        });
      }
    },
    [avatar.id, onAvatarUpdated],
  );

  const handleCustomRoleSave = useCallback(async () => {
    const trimmed = customRoleText.trim();
    if (!trimmed) return;
    try {
      const updated = await assistantApi.updateAvatar(avatar.id, {
        companionRoleId: null,
        companionRoleCustom: trimmed,
      });
      onAvatarUpdated(updated);
    } catch (err) {
      logger.error("AvatarDetailPanel", "api", "Failed to save custom role", {
        error: getErrorMessage(err),
      });
    }
  }, [avatar.id, customRoleText, onAvatarUpdated]);

  // ── Sprite actions ─────────────────────────────────────────────
  const handleExportSprite = useCallback(async () => {
    if (!avatar.imagePath) return;
    try {
      const dest = await save({
        defaultPath: avatar.imagePath,
        filters: [{ name: "PNG Image", extensions: ["png"] }],
      });
      if (!dest) return;
      await spriteApi.exportSprite(avatar.imagePath, dest);
      logger.info("AvatarDetailPanel", "api", "Sprite exported", { dest });
    } catch (err) {
      logger.error("AvatarDetailPanel", "api", "Failed to export sprite", {
        error: getErrorMessage(err),
      });
    }
  }, [avatar.imagePath]);

  // ── Danger zone ────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    setIsProcessing(true);
    try {
      await assistantApi.deleteAvatar(avatar.id);
      onAvatarDeleted(avatar.id);
    } catch (err) {
      logger.error("AvatarDetailPanel", "api", "Failed to delete avatar", {
        error: getErrorMessage(err),
      });
    } finally {
      setIsProcessing(false);
      setConfirmAction(null);
    }
  }, [avatar.id, onAvatarDeleted]);

  const handleWipe = useCallback(async () => {
    setIsProcessing(true);
    try {
      await assistantApi.wipeAvatarData(avatar.id);
      onAvatarDataWiped(avatar.id);
      // Refresh stats
      assistantApi
        .getAvatarStats(avatar.id)
        .then(setStats)
        .catch(() => setStats(null));
    } catch (err) {
      logger.error("AvatarDetailPanel", "api", "Failed to wipe avatar data", {
        error: getErrorMessage(err),
      });
    } finally {
      setIsProcessing(false);
      setConfirmAction(null);
    }
  }, [avatar.id, onAvatarDataWiped]);

  // ── Memory sharing toggles ─────────────────────────────────────
  const handleMemoryAccessToggle = useCallback(async () => {
    try {
      const updated = await assistantApi.updateAvatar(avatar.id, {
        crossAvatarMemoryAccess: !avatar.crossAvatarMemoryAccess,
      });
      onAvatarUpdated(updated);
    } catch (err) {
      logger.error("AvatarDetailPanel", "api", "Failed to update memory access", {
        error: getErrorMessage(err),
      });
    }
  }, [avatar.id, avatar.crossAvatarMemoryAccess, onAvatarUpdated]);

  const handleMemoryPrivateToggle = useCallback(async () => {
    try {
      const updated = await assistantApi.updateAvatar(avatar.id, {
        crossAvatarMemoryPrivate: !avatar.crossAvatarMemoryPrivate,
      });
      onAvatarUpdated(updated);
    } catch (err) {
      logger.error("AvatarDetailPanel", "api", "Failed to update memory privacy", {
        error: getErrorMessage(err),
      });
    }
  }, [avatar.id, avatar.crossAvatarMemoryPrivate, onAvatarUpdated]);

  // ── Computed values ────────────────────────────────────────────
  const roleSelectValue = showCustomRole
    ? CUSTOM_ROLE_OPTION
    : (avatar.companionRoleId ?? "");

  const daysActive = stats
    ? Math.max(
        1,
        Math.floor(
          (Date.now() - new Date(stats.createdAt).getTime()) / (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  const canDelete = !isActive || avatarCount === 1;

  return (
    <div className="avatar-detail">
      {/* Hero row */}
      <div className="avatar-detail__hero">
        <SpriteRenderer
          spriteDataUrl={spriteDataUrl}
          expression={previewExpression}
          size={220}
          fallbackText={avatar.name}
          className="avatar-detail__hero-sprite"
        />
        <div className="avatar-detail__hero-info">
          <input
            ref={nameInputRef}
            className="avatar-detail__name-input"
            type="text"
            value={editName}
            onChange={(e) => {
              setEditName(e.target.value);
              if (nameError) setNameError("");
            }}
            onBlur={saveName}
            onKeyDown={handleNameKeyDown}
            maxLength={100}
            aria-label="Avatar name"
          />
          {nameError && <p className="avatar-detail__name-error">{nameError}</p>}
          {isActive ? (
            <span className="avatar-detail__active-badge">Active</span>
          ) : (
            <button
              className="avatar-detail__switch-btn"
              onClick={() => onAvatarSwitch(avatar.id)}
              disabled={isStreaming}
              title={
                isStreaming ? "Cannot switch while assistant is responding" : undefined
              }
            >
              Switch to This Avatar
            </button>
          )}
        </div>
      </div>

      {/* Pickers */}
      <div className="avatar-detail__pickers">
        <label className="avatar-detail__label">
          Personality
          <select
            className="avatar-detail__select"
            value={avatar.personalityId}
            onChange={handlePersonalityChange}
          >
            {personalities.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isBuiltin ? " (built-in)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="avatar-detail__label">
          Role
          <select
            className="avatar-detail__select"
            value={roleSelectValue}
            onChange={handleRoleChange}
          >
            <option value="">Default</option>
            {companionRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
            <option value={CUSTOM_ROLE_OPTION}>Custom...</option>
          </select>
        </label>
        {showCustomRole && (
          <div className="avatar-detail__custom-role">
            <textarea
              className="avatar-detail__custom-role-textarea"
              value={customRoleText}
              onChange={(e) => setCustomRoleText(e.target.value)}
              placeholder="Describe a custom role for this avatar..."
              maxLength={10000}
              rows={3}
            />
            <button
              className="avatar-detail__custom-role-save"
              onClick={handleCustomRoleSave}
              disabled={!customRoleText.trim()}
            >
              Save Role
            </button>
          </div>
        )}
      </div>

      {/* Expression Preview Grid */}
      <div className="avatar-detail__section">
        <h4 className="avatar-detail__section-title">Expression Preview</h4>
        <div className="avatar-detail__expression-grid">
          {EXPRESSION_GRID.map((expr) => (
            <button
              key={expr}
              className={`avatar-detail__expression-cell${previewExpression === expr ? " avatar-detail__expression-cell--active" : ""}`}
              onClick={() => setPreviewExpression(expr)}
              title={EXPRESSION_LABELS[expr]}
            >
              <SpriteRenderer
                spriteDataUrl={spriteDataUrl}
                expression={expr}
                size={96}
                fallbackText={EXPRESSION_LABELS[expr].charAt(0)}
                onClick={() => setPreviewExpression(expr)}
              />
              <span className="avatar-detail__expression-label">
                {EXPRESSION_LABELS[expr]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Sprite Actions */}
      <div className="avatar-detail__sprite-actions">
        <button className="avatar-detail__action-btn" onClick={onChangeSpriteClick}>
          <AppIcon name="palette" size={14} /> Change Sprite
        </button>
        <button
          className="avatar-detail__action-btn"
          onClick={handleExportSprite}
          disabled={!avatar.imagePath}
          title={avatar.imagePath ? "Save sprite to file" : "No sprite assigned"}
        >
          <AppIcon name="chevron-down" size={14} /> Export Sprite
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="avatar-detail__stats">
          <span>{stats.memoryCount} memories</span>
          <span className="avatar-detail__stats-sep">&middot;</span>
          <span>{stats.journalCount} journals</span>
          <span className="avatar-detail__stats-sep">&middot;</span>
          <span>{daysActive}d</span>
        </div>
      )}

      {/* Cross-Avatar Memory */}
      <div className="avatar-detail__section">
        <h4 className="avatar-detail__section-title">Shared Memory</h4>
        <label className="avatar-detail__toggle-row">
          <input
            type="checkbox"
            className="avatar-detail__toggle"
            checked={avatar.crossAvatarMemoryAccess}
            onChange={handleMemoryAccessToggle}
          />
          <span className="avatar-detail__toggle-info">
            <span className="avatar-detail__toggle-label">Access shared memories</span>
            <span className="avatar-detail__toggle-desc">
              See important memories from other avatars
            </span>
          </span>
        </label>
        <label className="avatar-detail__toggle-row">
          <input
            type="checkbox"
            className="avatar-detail__toggle"
            checked={avatar.crossAvatarMemoryPrivate}
            onChange={handleMemoryPrivateToggle}
          />
          <span className="avatar-detail__toggle-info">
            <span className="avatar-detail__toggle-label">Keep memories private</span>
            <span className="avatar-detail__toggle-desc">
              Hide this avatar's memories from other avatars
            </span>
          </span>
        </label>
      </div>

      {/* Danger Zone */}
      <div className="avatar-detail__danger-zone">
        <button
          className="avatar-detail__danger-btn avatar-detail__danger-btn--wipe"
          onClick={() => setConfirmAction("wipe")}
          title="Clear all data for this avatar"
        >
          <AppIcon name="close" size={12} /> Clear Data
        </button>
        {canDelete && (
          <button
            className="avatar-detail__danger-btn avatar-detail__danger-btn--delete"
            onClick={() => setConfirmAction("delete")}
            title="Delete this avatar"
          >
            <AppIcon name="trash" size={12} /> Delete
          </button>
        )}
      </div>

      {/* Confirmation overlay */}
      {confirmAction === "delete" && (
        <div className="avatar-item__confirm-overlay">
          <p className="avatar-item__confirm-text">
            Delete <strong>{avatar.name}</strong>? All conversations, memories, and
            journal entries for this avatar will be permanently deleted. This cannot be
            undone.
            {avatarCount === 1 && (
              <> You will be returned to the setup wizard to create a new assistant.</>
            )}
          </p>
          <div className="avatar-item__confirm-actions">
            <button
              className="avatar-item__confirm-btn avatar-item__confirm-btn--danger"
              disabled={isProcessing}
              onClick={handleDelete}
            >
              {isProcessing ? "Deleting..." : "Delete"}
            </button>
            <button
              className="avatar-item__confirm-btn"
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirmAction === "wipe" && (
        <div className="avatar-item__confirm-overlay">
          <p className="avatar-item__confirm-text">
            Clear all data for <strong>{avatar.name}</strong>? This will delete all
            memories, journal entries, and conversation history for this avatar. The
            avatar itself will be kept. This cannot be undone.
          </p>
          <div className="avatar-item__confirm-actions">
            <button
              className="avatar-item__confirm-btn avatar-item__confirm-btn--danger"
              disabled={isProcessing}
              onClick={handleWipe}
            >
              {isProcessing ? "Clearing..." : "Clear Data"}
            </button>
            <button
              className="avatar-item__confirm-btn"
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
