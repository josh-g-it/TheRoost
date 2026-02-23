import { THEMES } from "../../hooks/useTheme";
import { FONT_OPTIONS, ICON_SET_OPTIONS, UI_SCALE_OPTIONS } from "../../types/theme";
import { useSettingsStore } from "../../store/settingsSlice";
import { logger } from "../../utils/logger";
import type { AppSettings } from "../../types/settings";
import type { ThemeId } from "../../hooks/useTheme";
import type { FontFamilyId, IconSetId, UIScaleId } from "../../types/theme";
import "./ThemePickerPopover.css";

interface ThemePickerPopoverProps {
  /** Override settings (used by overlay which has no Zustand store) */
  settings?: AppSettings | null;
  /** Override save handler (used by overlay) */
  onSaveSettings?: (s: AppSettings) => void;
}

export function ThemePickerPopover(props: ThemePickerPopoverProps) {
  // Always call hooks (can't conditionally call), use props when provided
  const storeSettings = useSettingsStore((s) => s.settings);
  const storeSave = useSettingsStore((s) => s.saveSettings);
  const settings = props.settings !== undefined ? props.settings : storeSettings;
  const saveSettings = props.onSaveSettings ?? storeSave;
  const currentTheme = settings?.theme ?? "dark-gaming";
  const currentFont = settings?.fontFamily ?? "system";
  const currentIconSet = settings?.iconSet ?? "classic";
  const currentScale = settings?.uiScale ?? "comfortable";

  const handlePalette = (themeId: ThemeId) => {
    if (!settings) return;
    logger.info("ThemePickerPopover", "ui", "Quick palette change", { theme: themeId });
    saveSettings({ ...settings, theme: themeId });
  };

  const handleFont = (fontId: FontFamilyId) => {
    if (!settings) return;
    logger.info("ThemePickerPopover", "ui", "Quick font change", { font: fontId });
    saveSettings({ ...settings, fontFamily: fontId });
  };

  const handleIconSet = (iconSetId: IconSetId) => {
    if (!settings) return;
    logger.info("ThemePickerPopover", "ui", "Quick icon set change", {
      iconSet: iconSetId,
    });
    saveSettings({ ...settings, iconSet: iconSetId });
  };

  const handleScale = (scaleId: UIScaleId) => {
    if (!settings) return;
    logger.info("ThemePickerPopover", "ui", "Quick UI scale change", { scale: scaleId });
    saveSettings({ ...settings, uiScale: scaleId });
  };

  return (
    <div className="theme-picker-popover">
      <div className="theme-picker-popover__title">Quick Theme</div>

      <div className="theme-picker-popover__columns">
        {/* Palette section */}
        <div className="theme-picker-popover__section">
          <div className="theme-picker-popover__section-title">Palette</div>
          <div className="theme-picker-popover__list">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                className={`theme-picker-popover__item ${theme.id === currentTheme ? "theme-picker-popover__item--active" : ""}`}
                onClick={() => handlePalette(theme.id)}
                aria-label={`Apply ${theme.name} palette`}
              >
                <span className="theme-picker-popover__name">{theme.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Font section */}
        <div className="theme-picker-popover__section">
          <div className="theme-picker-popover__section-title">Font</div>
          <div className="theme-picker-popover__list">
            {FONT_OPTIONS.map((font) => (
              <button
                key={font.id}
                className={`theme-picker-popover__item ${font.id === currentFont ? "theme-picker-popover__item--active" : ""}`}
                onClick={() => handleFont(font.id)}
                aria-label={`Apply ${font.name} font`}
              >
                <span className="theme-picker-popover__name">{font.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Icon set section */}
        <div className="theme-picker-popover__section">
          <div className="theme-picker-popover__section-title">Icons</div>
          <div className="theme-picker-popover__list">
            {ICON_SET_OPTIONS.map((iconSet) => (
              <button
                key={iconSet.id}
                className={`theme-picker-popover__item ${iconSet.id === currentIconSet ? "theme-picker-popover__item--active" : ""}`}
                onClick={() => handleIconSet(iconSet.id)}
                aria-label={`Apply ${iconSet.name} icon set`}
              >
                <span className="theme-picker-popover__name">{iconSet.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Scale section */}
        <div className="theme-picker-popover__section">
          <div className="theme-picker-popover__section-title">Scale</div>
          <div className="theme-picker-popover__list">
            {UI_SCALE_OPTIONS.map((scale) => (
              <button
                key={scale.id}
                className={`theme-picker-popover__item ${scale.id === currentScale ? "theme-picker-popover__item--active" : ""}`}
                onClick={() => handleScale(scale.id)}
                aria-label={`Apply ${scale.name} UI scale`}
              >
                <span className="theme-picker-popover__name">{scale.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
