import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  AiAvatar,
  AiPersonality,
  CompanionRolePreset,
  SpriteInfo,
} from "../../types";
import { assistantApi, spriteApi } from "../../services/tauri";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { useSettingsStore } from "../../store/settingsSlice";
import { SpriteRenderer } from "./SpriteRenderer";
import { SpriteGenerationWizard } from "./SpriteGenerationWizard";
import { AppIcon } from "../common/AppIcon";
import "./AvatarWizard.css";

interface AvatarWizardProps {
  /** Pre-loaded sprite list (for pre-built + existing selection). */
  sprites: SpriteInfo[];
  /** Pre-loaded sprite data URLs keyed by filename. */
  spriteDataUrls: Map<string, string | null>;
  /** Called when wizard completes — provides created avatar + conversation ID. */
  onComplete: (avatar: AiAvatar, conversationId: string) => void;
  /** Called when user cancels. */
  onCancel: () => void;
  /** If true, this is the first-ever avatar (changes titles and hides cancel). */
  isFirstRun?: boolean;
}

type WizardStep = "name" | "role" | "sprite" | "generating" | "creating";

const STEPS: WizardStep[] = ["name", "role", "sprite"];

export const AvatarWizard = memo(function AvatarWizard({
  sprites,
  spriteDataUrls,
  onComplete,
  onCancel,
  isFirstRun = false,
}: AvatarWizardProps) {
  // Personalities loaded internally
  const [personalities, setPersonalities] = useState<AiPersonality[]>([]);

  // Form state
  const [name, setName] = useState(isFirstRun ? "Assistant" : "");
  const [personalityId, setPersonalityId] = useState("");
  const [companionRoles, setCompanionRoles] = useState<CompanionRolePreset[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("gaming-companion");
  const [useCustomRole, setUseCustomRole] = useState(false);
  const [customRoleText, setCustomRoleText] = useState("");
  const [selectedSprite, setSelectedSprite] = useState<string | null>(null);

  // Wizard state
  const [step, setStep] = useState<WizardStep>("name");
  const [error, setError] = useState<string | null>(null);

  // Sprite generation sub-wizard
  const [showGenerateWizard, setShowGenerateWizard] = useState(false);

  // Personality add form
  const [showAddPersonality, setShowAddPersonality] = useState(false);
  const [newPersonalityName, setNewPersonalityName] = useState("");
  const [newPersonalityPrompt, setNewPersonalityPrompt] = useState("");

  // Role add form
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRolePrompt, setNewRolePrompt] = useState("");

  // Settings for custom style presets
  const settings = useSettingsStore((s) => s.settings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const customStylePresets = settings?.customStylePresets ?? [];

  const handleStylePresetsChanged = useCallback(
    async (presets: Array<{ id: string; label: string; prompt: string }>) => {
      if (!settings) return;
      const updated = { ...settings, customStylePresets: presets };
      await saveSettings(updated);
    },
    [settings, saveSettings],
  );

  // Refs for stale closure safety (Escape handler)
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Load personalities and companion roles on mount
  useEffect(() => {
    assistantApi
      .listPersonalities()
      .then((list) => {
        setPersonalities(list);
        // Default to first built-in personality
        const builtin = list.find((p) => p.isBuiltin);
        setPersonalityId(builtin?.id ?? list[0]?.id ?? "");
      })
      .catch((err) => {
        logger.warn("AvatarWizard", "api", "Failed to load personalities", {
          error: getErrorMessage(err),
        });
      });

    assistantApi
      .listCompanionRoles()
      .then((roles) => {
        setCompanionRoles(roles);
      })
      .catch((err) => {
        logger.warn("AvatarWizard", "api", "Failed to load companion roles", {
          error: getErrorMessage(err),
        });
      });
  }, []);

  // Escape key handler
  useEffect(() => {
    if (isFirstRun) return; // No escape dismiss in first-run
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "creating") {
        e.preventDefault();
        e.stopPropagation();
        onCancelRef.current();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [isFirstRun, step]);

  const stepIndex = STEPS.indexOf(step as (typeof STEPS)[number]);

  // ── Navigation ────────────────────────────────────────────────
  const canNext = (): boolean => {
    switch (step) {
      case "name":
        return name.trim().length > 0 && personalityId.length > 0;
      case "role":
        return !useCustomRole || customRoleText.trim().length > 0;
      case "sprite":
        return true; // can skip sprite
      default:
        return false;
    }
  };

  const handleNext = useCallback(() => {
    const idx = STEPS.indexOf(step as (typeof STEPS)[number]);
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1]);
      setError(null);
    }
  }, [step]);

  const handleBack = useCallback(() => {
    const idx = STEPS.indexOf(step as (typeof STEPS)[number]);
    if (idx > 0) {
      setStep(STEPS[idx - 1]);
      setError(null);
    }
  }, [step]);

  // ── Avatar creation ───────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    setStep("creating");
    setError(null);
    try {
      const roleId = useCustomRole ? null : selectedRoleId;
      const roleCustom = useCustomRole ? customRoleText.trim() : null;

      const avatar = await assistantApi.createAvatar(
        name.trim(),
        personalityId,
        roleId,
        roleCustom,
        selectedSprite,
      );
      await assistantApi.switchAvatar(avatar.id);
      const conversationId = await assistantApi.startConversation(avatar.id);

      logger.info("AvatarWizard", "api", "Avatar created via wizard", {
        avatarId: avatar.id,
        isFirstRun,
      });

      onComplete(avatar, conversationId);
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      setStep("sprite"); // go back to last step
      logger.error("AvatarWizard", "api", "Avatar creation failed", {
        error: msg,
      });
    }
  }, [
    name,
    personalityId,
    selectedRoleId,
    useCustomRole,
    customRoleText,
    selectedSprite,
    isFirstRun,
    onComplete,
  ]);

  // ── Sprite generation complete ────────────────────────────────
  const handleSpriteGenerated = useCallback((sprite: SpriteInfo) => {
    setSelectedSprite(sprite.filename);
    setShowGenerateWizard(false);
    // Load data URL for the new sprite
    spriteApi.readSprite(sprite.filename).catch(() => {});
  }, []);

  // ── Personality CRUD ──────────────────────────────────────────
  const handleAddPersonality = useCallback(async () => {
    const trimmedName = newPersonalityName.trim();
    const trimmedPrompt = newPersonalityPrompt.trim();
    if (!trimmedName || !trimmedPrompt) return;

    try {
      const created = await assistantApi.createPersonality(trimmedName, trimmedPrompt);
      setPersonalities((prev) => [...prev, created]);
      setPersonalityId(created.id);
      setShowAddPersonality(false);
      setNewPersonalityName("");
      setNewPersonalityPrompt("");
    } catch (err) {
      logger.error("AvatarWizard", "api", "Failed to create personality", {
        error: getErrorMessage(err),
      });
    }
  }, [newPersonalityName, newPersonalityPrompt]);

  const handleDeletePersonality = useCallback(
    async (id: string) => {
      try {
        await assistantApi.deletePersonality(id);
        setPersonalities((prev) => prev.filter((p) => p.id !== id));
        if (personalityId === id) {
          const remaining = personalities.filter((p) => p.id !== id);
          const fallback = remaining.find((p) => p.isBuiltin) ?? remaining[0];
          setPersonalityId(fallback?.id ?? "");
        }
      } catch (err) {
        logger.error("AvatarWizard", "api", "Failed to delete personality", {
          error: getErrorMessage(err),
        });
      }
    },
    [personalityId, personalities],
  );

  // ── Companion Role CRUD ───────────────────────────────────────
  const handleAddRole = useCallback(async () => {
    const trimmedName = newRoleName.trim();
    const trimmedDesc = newRoleDesc.trim();
    const trimmedPrompt = newRolePrompt.trim();
    if (!trimmedName || !trimmedDesc || !trimmedPrompt) return;

    try {
      const created = await assistantApi.createCompanionRole(
        trimmedName,
        trimmedDesc,
        trimmedPrompt,
      );
      setCompanionRoles((prev) => [...prev, created]);
      setSelectedRoleId(created.id);
      setUseCustomRole(false);
      setShowAddRole(false);
      setNewRoleName("");
      setNewRoleDesc("");
      setNewRolePrompt("");
    } catch (err) {
      logger.error("AvatarWizard", "api", "Failed to create companion role", {
        error: getErrorMessage(err),
      });
    }
  }, [newRoleName, newRoleDesc, newRolePrompt]);

  const handleDeleteRole = useCallback(
    async (id: string) => {
      try {
        await assistantApi.deleteCompanionRole(id);
        setCompanionRoles((prev) => prev.filter((r) => r.id !== id));
        if (selectedRoleId === id) {
          setSelectedRoleId("gaming-companion");
        }
      } catch (err) {
        logger.error("AvatarWizard", "api", "Failed to delete companion role", {
          error: getErrorMessage(err),
        });
      }
    },
    [selectedRoleId],
  );

  // ── Render helpers ────────────────────────────────────────────
  const builtinPersonalities = personalities.filter((p) => p.isBuiltin);
  const customPersonalities = personalities.filter((p) => !p.isBuiltin);

  const selectedSpriteUrl = selectedSprite
    ? (spriteDataUrls.get(selectedSprite) ?? null)
    : null;

  // Determine if modal should be wider
  const isWide = step === "sprite";

  // ── Build modal content ───────────────────────────────────────

  let content: React.ReactNode;

  if (step === "creating") {
    content = (
      <div className="avatar-wizard avatar-wizard--centered">
        <div className="avatar-wizard__spinner" />
        <h3 className="avatar-wizard__title">Creating your avatar...</h3>
      </div>
    );
  } else {
    content = (
      <div
        className={`avatar-wizard${isWide ? " avatar-wizard--wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step indicator */}
        <div className="avatar-wizard__steps">
          {STEPS.map((s, i) => (
            <span key={s}>
              {i > 0 && (
                <span
                  className={`avatar-wizard__step-line${i <= stepIndex ? " avatar-wizard__step-line--done" : ""}`}
                />
              )}
              <span
                className={`avatar-wizard__step-dot${i === stepIndex ? " avatar-wizard__step-dot--active" : ""}${i < stepIndex ? " avatar-wizard__step-dot--done" : ""}`}
              >
                {i < stepIndex ? "\u2713" : i + 1}
              </span>
            </span>
          ))}
        </div>

        {/* Step 1: Name & Personality */}
        {step === "name" && (
          <div className="avatar-wizard__step">
            <h3 className="avatar-wizard__title">
              {isFirstRun ? "Name Your Assistant" : "Create New Avatar"}
            </h3>
            <p className="avatar-wizard__subtitle">
              {isFirstRun
                ? "Choose a name and personality for your AI gaming companion."
                : "Give your new avatar a name and personality."}
            </p>

            <label className="avatar-wizard__label">Name</label>
            <input
              className="avatar-wizard__input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name..."
              maxLength={100}
              autoFocus
            />

            <label className="avatar-wizard__label">Personality</label>
            <div className="avatar-wizard__personality-list">
              {builtinPersonalities.map((p) => (
                <button
                  key={p.id}
                  className={`avatar-wizard__personality-card${personalityId === p.id ? " avatar-wizard__personality-card--selected" : ""}`}
                  onClick={() => setPersonalityId(p.id)}
                >
                  <span className="avatar-wizard__personality-card-name">{p.name}</span>
                </button>
              ))}
              {customPersonalities.map((p) => (
                <button
                  key={p.id}
                  className={`avatar-wizard__personality-card${personalityId === p.id ? " avatar-wizard__personality-card--selected" : ""}`}
                  onClick={() => setPersonalityId(p.id)}
                >
                  <span className="avatar-wizard__personality-card-name">{p.name}</span>
                  <span className="avatar-wizard__personality-card-badge">custom</span>
                  <span
                    className="avatar-wizard__personality-delete-btn"
                    role="button"
                    aria-label={`Delete ${p.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePersonality(p.id);
                    }}
                  >
                    <AppIcon name="trash" size={12} />
                  </span>
                </button>
              ))}
            </div>

            {showAddPersonality ? (
              <div className="avatar-wizard__inline-form">
                <input
                  type="text"
                  value={newPersonalityName}
                  onChange={(e) => setNewPersonalityName(e.target.value)}
                  placeholder="Personality name"
                  maxLength={100}
                  autoFocus
                />
                <textarea
                  value={newPersonalityPrompt}
                  onChange={(e) => setNewPersonalityPrompt(e.target.value)}
                  placeholder="Describe this personality's tone and style..."
                  maxLength={10000}
                  rows={3}
                />
                <div className="avatar-wizard__inline-form-row">
                  <button
                    className="avatar-wizard__btn avatar-wizard__btn--small"
                    onClick={() => {
                      setShowAddPersonality(false);
                      setNewPersonalityName("");
                      setNewPersonalityPrompt("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="avatar-wizard__btn avatar-wizard__btn--small avatar-wizard__btn--primary"
                    disabled={!newPersonalityName.trim() || !newPersonalityPrompt.trim()}
                    onClick={handleAddPersonality}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="avatar-wizard__add-btn"
                onClick={() => setShowAddPersonality(true)}
              >
                <AppIcon name="plus" size={12} /> Add Custom Personality
              </button>
            )}
          </div>
        )}

        {/* Step 2: Companion Role */}
        {step === "role" && (
          <div className="avatar-wizard__step">
            <h3 className="avatar-wizard__title">Choose a Companion Role</h3>
            <p className="avatar-wizard__subtitle">
              This determines what your avatar focuses on — their purpose and expertise.
            </p>

            <div className="avatar-wizard__role-grid">
              {companionRoles.map((role) => (
                <button
                  key={role.id}
                  className={`avatar-wizard__role-card${!useCustomRole && selectedRoleId === role.id ? " avatar-wizard__role-card--selected" : ""}`}
                  onClick={() => {
                    setSelectedRoleId(role.id);
                    setUseCustomRole(false);
                  }}
                >
                  <div className="avatar-wizard__role-name">{role.name}</div>
                  <div className="avatar-wizard__role-desc">{role.description}</div>
                  {role.isBuiltin === false && (
                    <span
                      className="avatar-wizard__role-delete-btn"
                      role="button"
                      aria-label={`Delete ${role.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRole(role.id);
                      }}
                    >
                      <AppIcon name="trash" size={12} />
                    </span>
                  )}
                </button>
              ))}
              <button
                className={`avatar-wizard__role-card avatar-wizard__role-card--custom${useCustomRole ? " avatar-wizard__role-card--selected" : ""}`}
                onClick={() => setUseCustomRole(true)}
              >
                <div className="avatar-wizard__role-name">Custom Role</div>
                <div className="avatar-wizard__role-desc">
                  Write your own companion role description
                </div>
              </button>

              {showAddRole ? (
                <div className="avatar-wizard__role-add-form">
                  <input
                    type="text"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="Role name"
                    maxLength={100}
                    autoFocus
                  />
                  <input
                    type="text"
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                    placeholder="Short description"
                    maxLength={200}
                  />
                  <textarea
                    value={newRolePrompt}
                    onChange={(e) => setNewRolePrompt(e.target.value)}
                    placeholder="System prompt (how should this role behave?)"
                    maxLength={2000}
                    rows={2}
                  />
                  <div className="avatar-wizard__inline-form-row">
                    <button
                      className="avatar-wizard__btn avatar-wizard__btn--small"
                      onClick={() => {
                        setShowAddRole(false);
                        setNewRoleName("");
                        setNewRoleDesc("");
                        setNewRolePrompt("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="avatar-wizard__btn avatar-wizard__btn--small avatar-wizard__btn--primary"
                      disabled={
                        !newRoleName.trim() ||
                        !newRoleDesc.trim() ||
                        !newRolePrompt.trim()
                      }
                      onClick={handleAddRole}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="avatar-wizard__add-btn"
                  onClick={() => setShowAddRole(true)}
                >
                  <AppIcon name="plus" size={12} /> Add Custom Role
                </button>
              )}
            </div>

            {useCustomRole && (
              <textarea
                className="avatar-wizard__custom-role-input"
                value={customRoleText}
                onChange={(e) => setCustomRoleText(e.target.value)}
                placeholder="Describe what your avatar should focus on..."
                maxLength={500}
                rows={3}
                autoFocus
              />
            )}
          </div>
        )}

        {/* Step 3: Sprite Selection */}
        {step === "sprite" && (
          <div className="avatar-wizard__step">
            <h3 className="avatar-wizard__title">Choose a Sprite</h3>
            <p className="avatar-wizard__subtitle">
              Pick a visual appearance for your avatar, or skip to use a monogram.
            </p>

            <div className="avatar-wizard__sprite-grid">
              {sprites.map((sprite) => {
                const dataUrl = spriteDataUrls.get(sprite.filename) ?? null;
                const isSelected = selectedSprite === sprite.filename;
                return (
                  <button
                    key={sprite.filename}
                    className={`avatar-wizard__sprite-card${isSelected ? " avatar-wizard__sprite-card--selected" : ""}`}
                    onClick={() => setSelectedSprite(isSelected ? null : sprite.filename)}
                    title={sprite.displayName}
                  >
                    <SpriteRenderer
                      spriteDataUrl={dataUrl}
                      expression="neutral"
                      size={80}
                      fallbackText={sprite.displayName}
                    />
                    <span className="avatar-wizard__sprite-name">
                      {sprite.displayName}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="avatar-wizard__sprite-alt-actions">
              <button
                className="avatar-wizard__btn"
                onClick={() => setShowGenerateWizard(true)}
              >
                <AppIcon name="sparkle" size={14} /> Generate New
              </button>
            </div>

            {selectedSprite && selectedSpriteUrl && (
              <div className="avatar-wizard__sprite-preview">
                <SpriteRenderer
                  spriteDataUrl={selectedSpriteUrl}
                  expression="neutral"
                  size={96}
                  fallbackText={name || "?"}
                  circular
                />
                <span className="avatar-wizard__sprite-preview-label">
                  {sprites.find((s) => s.filename === selectedSprite)?.displayName ??
                    "Selected"}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && <p className="avatar-wizard__error">{error}</p>}

        {/* Navigation */}
        <div className="avatar-wizard__actions">
          <div className="avatar-wizard__actions-left">
            {stepIndex > 0 ? (
              <button className="avatar-wizard__btn" onClick={handleBack}>
                <AppIcon name="chevron-left" size={12} /> Back
              </button>
            ) : !isFirstRun ? (
              <button className="avatar-wizard__btn" onClick={onCancel}>
                Cancel
              </button>
            ) : (
              <div />
            )}
          </div>
          <div className="avatar-wizard__actions-right">
            {step === "sprite" ? (
              <button
                className="avatar-wizard__btn avatar-wizard__btn--primary"
                onClick={handleCreate}
              >
                {selectedSprite ? "Create Avatar" : "Skip & Create"}
              </button>
            ) : (
              <button
                className="avatar-wizard__btn avatar-wizard__btn--primary"
                disabled={!canNext()}
                onClick={handleNext}
              >
                Next <AppIcon name="chevron-right" size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Render as portal-based modal
  return (
    <>
      {createPortal(
        <div
          className="avatar-wizard__overlay"
          onClick={isFirstRun ? undefined : onCancel}
          role="dialog"
          aria-modal="true"
          aria-label="Create Avatar"
        >
          {content}
        </div>,
        document.body,
      )}
      {showGenerateWizard && (
        <SpriteGenerationWizard
          onComplete={handleSpriteGenerated}
          onCancel={() => setShowGenerateWizard(false)}
          customStylePresets={customStylePresets}
          onStylePresetsChanged={handleStylePresetsChanged}
        />
      )}
    </>
  );
});
