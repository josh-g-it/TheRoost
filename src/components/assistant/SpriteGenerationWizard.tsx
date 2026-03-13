import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SpriteInfo } from "../../types";
import { spriteApi } from "../../services/tauri";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { SpriteRenderer } from "./SpriteRenderer";
import { EXPRESSION_GRID, EXPRESSION_LABELS } from "../../types/assistant";
import { AppIcon } from "../common/AppIcon";
import "./SpriteGenerationWizard.css";

interface CustomStylePreset {
  id: string;
  label: string;
  prompt: string;
}

interface SpriteGenerationWizardProps {
  onComplete: (sprite: SpriteInfo) => void;
  onCancel: () => void;
  customStylePresets?: CustomStylePreset[];
  onStylePresetsChanged?: (presets: CustomStylePreset[]) => void;
}

type Step = "style" | "background" | "describe" | "generating" | "preview";

interface StylePreset {
  id: string;
  label: string;
  prompt: string;
}

const STYLE_PRESETS: StylePreset[] = [
  {
    id: "anime",
    label: "Anime",
    prompt:
      "Japanese anime/manga style with large expressive eyes, clean linework, and vibrant colors",
  },
  {
    id: "pixel",
    label: "Pixel Art",
    prompt:
      "Retro pixel art style reminiscent of 16-bit RPG characters, with visible pixels and limited color palette",
  },
  {
    id: "cartoon",
    label: "Cartoon",
    prompt:
      "Western cartoon/animation style with bold outlines, exaggerated features, and bright saturated colors",
  },
  {
    id: "painterly",
    label: "Painterly",
    prompt:
      "Fantasy art style with soft painterly brushstrokes, rich detail, and storybook illustration quality",
  },
  {
    id: "chibi",
    label: "Chibi",
    prompt:
      "Cute chibi/super-deformed style with an oversized head, small body, and adorable exaggerated expressions",
  },
];

interface ColorOption {
  id: string;
  label: string;
  hex: string;
  promptName: string;
}

const BACKGROUND_COLORS: ColorOption[] = [
  { id: "black", label: "Black", hex: "#000000", promptName: "black" },
  {
    id: "dark-gray",
    label: "Dark Gray",
    hex: "#333333",
    promptName: "dark gray (#333333)",
  },
  { id: "gray", label: "Gray", hex: "#808080", promptName: "gray (#808080)" },
  {
    id: "light-gray",
    label: "Light Gray",
    hex: "#CCCCCC",
    promptName: "light gray (#CCCCCC)",
  },
  { id: "white", label: "White", hex: "#FFFFFF", promptName: "white" },
  { id: "navy", label: "Navy", hex: "#1B2838", promptName: "dark navy blue (#1B2838)" },
  {
    id: "dark-blue",
    label: "Dark Blue",
    hex: "#1A1A2E",
    promptName: "dark blue (#1A1A2E)",
  },
  { id: "blue", label: "Blue", hex: "#4A90D9", promptName: "blue (#4A90D9)" },
  { id: "sky", label: "Sky Blue", hex: "#87CEEB", promptName: "sky blue (#87CEEB)" },
  { id: "teal", label: "Teal", hex: "#2A9D8F", promptName: "teal (#2A9D8F)" },
  { id: "green", label: "Green", hex: "#2D6A4F", promptName: "forest green (#2D6A4F)" },
  { id: "purple", label: "Purple", hex: "#6A0DAD", promptName: "purple (#6A0DAD)" },
  { id: "lavender", label: "Lavender", hex: "#B8A9C9", promptName: "lavender (#B8A9C9)" },
  { id: "red", label: "Red", hex: "#C0392B", promptName: "red (#C0392B)" },
  { id: "warm", label: "Warm Beige", hex: "#D4A574", promptName: "warm beige (#D4A574)" },
  { id: "pink", label: "Pink", hex: "#E91E8C", promptName: "pink (#E91E8C)" },
];

const EXAMPLE_DESCRIPTIONS = [
  "A cyberpunk fox with neon accents and a visor",
  "A friendly robot with glowing blue eyes",
  "A medieval knight with a kind, weathered face",
  "A wise owl wearing a monocle and tiny top hat",
];

export const SpriteGenerationWizard = memo(function SpriteGenerationWizard({
  onComplete,
  onCancel,
  customStylePresets = [],
  onStylePresetsChanged,
}: SpriteGenerationWizardProps) {
  const [step, setStep] = useState<Step>("style");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customStyle, setCustomStyle] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [savePresetLabel, setSavePresetLabel] = useState("");

  // Ref for stale closure safety (Escape handler)
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const [selectedBgColor, setSelectedBgColor] = useState("navy");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [generatedSprite, setGeneratedSprite] = useState<SpriteInfo | null>(null);
  const [spriteDataUrl, setSpriteDataUrl] = useState<string | null>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Escape key handler — dismiss unless generating
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "generating") {
        e.preventDefault();
        e.stopPropagation();
        onCancelRef.current();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [step]);

  // Focus description textarea when moving to describe step
  useEffect(() => {
    if (step === "describe") {
      descRef.current?.focus();
    }
  }, [step]);

  // Get the resolved style prompt
  const getStylePrompt = useCallback((): string => {
    if (selectedPreset === "custom") {
      return customStyle.trim();
    }
    const builtin = STYLE_PRESETS.find((p) => p.id === selectedPreset);
    if (builtin) return builtin.prompt;
    const custom = customStylePresets.find((p) => p.id === selectedPreset);
    return custom?.prompt ?? "";
  }, [selectedPreset, customStyle, customStylePresets]);

  const handleSaveAsPreset = useCallback(() => {
    const label = savePresetLabel.trim();
    if (!label || !onStylePresetsChanged) return;
    const id = `custom-${Date.now()}`;
    const newPreset: CustomStylePreset = { id, label, prompt: customStyle.trim() };
    onStylePresetsChanged([...customStylePresets, newPreset]);
    setSelectedPreset(id);
    setShowSavePreset(false);
    setSavePresetLabel("");
    setCustomStyle("");
  }, [savePresetLabel, customStyle, customStylePresets, onStylePresetsChanged]);

  const handleDeletePreset = useCallback(
    (id: string) => {
      if (!onStylePresetsChanged) return;
      onStylePresetsChanged(customStylePresets.filter((p) => p.id !== id));
      if (selectedPreset === id) {
        setSelectedPreset(null);
      }
    },
    [customStylePresets, selectedPreset, onStylePresetsChanged],
  );

  const getBackgroundPrompt = useCallback((): string => {
    return (
      BACKGROUND_COLORS.find((c) => c.id === selectedBgColor)?.promptName ??
      "dark navy blue"
    );
  }, [selectedBgColor]);

  const canProceedFromStyle =
    selectedPreset !== null &&
    (selectedPreset !== "custom" || customStyle.trim().length > 0);

  // ── Step handlers ──

  const handleGenerate = useCallback(async () => {
    const stylePrompt = getStylePrompt();
    if (!stylePrompt) return;

    setStep("generating");
    setError(null);

    try {
      const sprite = await spriteApi.generateSprite(
        stylePrompt,
        description.trim(),
        getBackgroundPrompt(),
      );
      setGeneratedSprite(sprite);

      // Load the sprite data URL for preview (readSprite returns a full data URL)
      const dataUrl = await spriteApi.readSprite(sprite.filename);
      setSpriteDataUrl(dataUrl);

      setStep("preview");
      logger.info("SpriteGenerationWizard", "api", "Sprite generated", {
        filename: sprite.filename,
      });
    } catch (err) {
      setError(getErrorMessage(err));
      setStep("describe"); // Go back to allow retry
      logger.error("SpriteGenerationWizard", "api", "Sprite generation failed", {
        error: getErrorMessage(err),
      });
    }
  }, [getStylePrompt, getBackgroundPrompt, description]);

  const handleRegenerate = useCallback(async () => {
    // Delete the previous generated sprite before regenerating
    if (generatedSprite) {
      try {
        await spriteApi.deleteSprite(generatedSprite.filename);
      } catch {
        // Ignore delete errors during regeneration
      }
    }
    setGeneratedSprite(null);
    setSpriteDataUrl(null);
    handleGenerate();
  }, [generatedSprite, handleGenerate]);

  const handleTryDifferentStyle = useCallback(async () => {
    // Delete the previous generated sprite
    if (generatedSprite) {
      try {
        await spriteApi.deleteSprite(generatedSprite.filename);
      } catch {
        // Ignore
      }
    }
    setGeneratedSprite(null);
    setSpriteDataUrl(null);
    setStep("style");
  }, [generatedSprite]);

  const handleSave = useCallback(() => {
    if (generatedSprite) {
      onComplete(generatedSprite);
    }
  }, [generatedSprite, onComplete]);

  const handleCancelFromPreview = useCallback(async () => {
    // Clean up generated sprite if canceling from preview
    if (generatedSprite) {
      try {
        await spriteApi.deleteSprite(generatedSprite.filename);
      } catch {
        // Ignore
      }
    }
    onCancel();
  }, [generatedSprite, onCancel]);

  const selectedBg = BACKGROUND_COLORS.find((c) => c.id === selectedBgColor);

  // Determine if modal should be wider (preview step shows 4×2 grid)
  const isWide = step === "preview";

  // ── Render ──

  return createPortal(
    <div
      className="sprite-wizard__overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== "generating") {
          onCancel();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Generate Sprite"
    >
      <div
        className={`sprite-wizard${isWide ? " sprite-wizard--wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step 1: Style Selection */}
        {step === "style" && (
          <div className="sprite-wizard__step">
            <h3 className="sprite-wizard__title">Choose an Art Style</h3>
            <div className="sprite-wizard__presets">
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={`sprite-wizard__preset-btn${selectedPreset === preset.id ? " sprite-wizard__preset-btn--selected" : ""}`}
                  onClick={() => {
                    setSelectedPreset(preset.id);
                    setCustomStyle("");
                  }}
                >
                  {preset.label}
                </button>
              ))}
              {customStylePresets.map((preset) => (
                <button
                  key={preset.id}
                  className={`sprite-wizard__preset-btn sprite-wizard__preset-btn--user${selectedPreset === preset.id ? " sprite-wizard__preset-btn--selected" : ""}`}
                  onClick={() => {
                    setSelectedPreset(preset.id);
                    setCustomStyle("");
                  }}
                >
                  {preset.label}
                  {onStylePresetsChanged && (
                    <span
                      className="sprite-wizard__preset-delete"
                      role="button"
                      aria-label={`Delete ${preset.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePreset(preset.id);
                      }}
                    >
                      ×
                    </span>
                  )}
                </button>
              ))}
              <button
                className={`sprite-wizard__preset-btn sprite-wizard__preset-btn--custom${selectedPreset === "custom" ? " sprite-wizard__preset-btn--selected" : ""}`}
                onClick={() => setSelectedPreset("custom")}
              >
                Custom...
              </button>
            </div>
            {selectedPreset === "custom" && (
              <>
                <textarea
                  className="sprite-wizard__custom-input"
                  value={customStyle}
                  onChange={(e) => setCustomStyle(e.target.value)}
                  placeholder="Describe your art style (e.g., 'watercolor fantasy with soft edges')"
                  maxLength={500}
                  rows={2}
                />
                {onStylePresetsChanged && customStyle.trim().length > 0 && (
                  <div className="sprite-wizard__save-preset">
                    {showSavePreset ? (
                      <div className="sprite-wizard__save-preset-form">
                        <input
                          type="text"
                          value={savePresetLabel}
                          onChange={(e) => setSavePresetLabel(e.target.value)}
                          placeholder="Preset name"
                          maxLength={50}
                          autoFocus
                        />
                        <button
                          className="sprite-wizard__btn sprite-wizard__btn--small"
                          onClick={() => {
                            setShowSavePreset(false);
                            setSavePresetLabel("");
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="sprite-wizard__btn sprite-wizard__btn--small sprite-wizard__btn--primary"
                          disabled={!savePresetLabel.trim()}
                          onClick={handleSaveAsPreset}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        className="sprite-wizard__btn sprite-wizard__btn--small"
                        onClick={() => setShowSavePreset(true)}
                      >
                        Save as Preset
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
            <div className="sprite-wizard__actions">
              <button className="sprite-wizard__btn" onClick={onCancel}>
                Cancel
              </button>
              <button
                className="sprite-wizard__btn sprite-wizard__btn--primary"
                onClick={() => setStep("background")}
                disabled={!canProceedFromStyle}
              >
                Next <AppIcon name="chevron-right" size={12} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Background Color */}
        {step === "background" && (
          <div className="sprite-wizard__step">
            <h3 className="sprite-wizard__title">Choose Background Color</h3>
            <p className="sprite-wizard__subtitle">
              This color will appear behind your character in each expression cell.
            </p>
            <div className="sprite-wizard__color-grid">
              {BACKGROUND_COLORS.map((color) => (
                <button
                  key={color.id}
                  className={`sprite-wizard__color-swatch${selectedBgColor === color.id ? " sprite-wizard__color-swatch--selected" : ""}`}
                  style={{ backgroundColor: color.hex }}
                  onClick={() => setSelectedBgColor(color.id)}
                  title={color.label}
                  aria-label={color.label}
                />
              ))}
            </div>
            {selectedBg && (
              <div className="sprite-wizard__color-label">{selectedBg.label}</div>
            )}
            <div className="sprite-wizard__actions">
              <button className="sprite-wizard__btn" onClick={() => setStep("style")}>
                <AppIcon name="chevron-left" size={12} /> Back
              </button>
              <button
                className="sprite-wizard__btn sprite-wizard__btn--primary"
                onClick={() => setStep("describe")}
              >
                Next <AppIcon name="chevron-right" size={12} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Character Description */}
        {step === "describe" && (
          <div className="sprite-wizard__step">
            <h3 className="sprite-wizard__title">Describe Your Character</h3>
            <textarea
              ref={descRef}
              className="sprite-wizard__description-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the character's appearance (leave blank for a default character)"
              maxLength={500}
              rows={4}
            />
            <div className="sprite-wizard__examples">
              <span className="sprite-wizard__examples-label">Examples:</span>
              {EXAMPLE_DESCRIPTIONS.map((ex) => (
                <button
                  key={ex}
                  className="sprite-wizard__example-btn"
                  onClick={() => setDescription(ex)}
                  title="Use this description"
                >
                  {ex}
                </button>
              ))}
            </div>
            {error && <p className="sprite-wizard__error">{error}</p>}
            <div className="sprite-wizard__actions">
              <button
                className="sprite-wizard__btn"
                onClick={() => setStep("background")}
              >
                <AppIcon name="chevron-left" size={12} /> Back
              </button>
              <button
                className="sprite-wizard__btn sprite-wizard__btn--primary"
                onClick={handleGenerate}
              >
                <AppIcon name="sparkle" size={14} /> Generate
              </button>
            </div>
          </div>
        )}

        {/* Generating */}
        {step === "generating" && (
          <div className="sprite-wizard__step sprite-wizard__step--generating">
            <div className="sprite-wizard__spinner" />
            <h3 className="sprite-wizard__title">Generating Sprite...</h3>
            <p className="sprite-wizard__generating-hint">
              This usually takes 15-30 seconds. The AI is creating 8 expression frames for
              your character.
            </p>
          </div>
        )}

        {/* Preview */}
        {step === "preview" && generatedSprite && (
          <div className="sprite-wizard__step">
            <h3 className="sprite-wizard__title">Sprite Preview</h3>
            <div className="sprite-wizard__preview-grid">
              {EXPRESSION_GRID.map((expr) => (
                <div key={expr} className="sprite-wizard__preview-cell">
                  <SpriteRenderer
                    spriteDataUrl={spriteDataUrl}
                    expression={expr}
                    size={100}
                    fallbackText={EXPRESSION_LABELS[expr].charAt(0)}
                  />
                  <span className="sprite-wizard__preview-label">
                    {EXPRESSION_LABELS[expr]}
                  </span>
                </div>
              ))}
            </div>
            <div className="sprite-wizard__preview-actions">
              <button
                className="sprite-wizard__btn"
                onClick={handleRegenerate}
                title="Generate a new sprite with the same settings"
              >
                <AppIcon name="refresh" size={14} /> Regenerate
              </button>
              <button
                className="sprite-wizard__btn"
                onClick={handleTryDifferentStyle}
                title="Go back and choose a different style"
              >
                <AppIcon name="palette" size={14} /> Try Style
              </button>
            </div>
            <div className="sprite-wizard__actions">
              <button className="sprite-wizard__btn" onClick={handleCancelFromPreview}>
                Cancel
              </button>
              <button
                className="sprite-wizard__btn sprite-wizard__btn--primary"
                onClick={handleSave}
              >
                Save Sprite
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
});
