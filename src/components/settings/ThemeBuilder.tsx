import { useState } from "react";
import { THEMES } from "../../hooks/useTheme";
import { ICON_SET_OPTIONS, FONT_OPTIONS, UI_SCALE_OPTIONS } from "../../types/theme";
import { getIcon } from "../../utils/icons";
import type { ThemeId } from "../../hooks/useTheme";
import type { IconSetId, FontFamilyId, UIScaleId } from "../../types/theme";
import type { IconName } from "../../utils/icons";
import "./ThemeBuilder.css";

interface ThemeBuilderProps {
  palette: ThemeId;
  iconSet: IconSetId;
  fontFamily: FontFamilyId;
  uiScale: UIScaleId;
  onPaletteChange: (id: ThemeId) => void;
  onIconSetChange: (id: IconSetId) => void;
  onFontChange: (id: FontFamilyId) => void;
  onScaleChange: (id: UIScaleId) => void;
  onQuickApply: (changes: {
    theme?: ThemeId;
    iconSet?: IconSetId;
    fontFamily?: FontFamilyId;
    uiScale?: UIScaleId;
  }) => void;
}

type DropdownId = "palette" | "font" | "icons" | "scale";

const SCALE_LABELS: Record<UIScaleId, string> = {
  minimal: "S",
  comfortable: "M",
  expanded: "L",
  large: "XL",
};

export function ThemeBuilder({
  palette,
  iconSet,
  fontFamily,
  uiScale,
  onPaletteChange,
  onIconSetChange,
  onFontChange,
  onScaleChange,
  onQuickApply,
}: ThemeBuilderProps) {
  // Always one open — palette is the default
  const [openDropdown, setOpenDropdown] = useState<DropdownId>("palette");

  // Hover state for live preview — null means use the committed selection
  const [hoveredPalette, setHoveredPalette] = useState<ThemeId | null>(null);
  const [hoveredFont, setHoveredFont] = useState<FontFamilyId | null>(null);
  const [hoveredIconSet, setHoveredIconSet] = useState<IconSetId | null>(null);
  const [, setHoveredScale] = useState<UIScaleId | null>(null);

  const selectedTheme = THEMES.find((t) => t.id === palette) ?? THEMES[0];
  const selectedFont = FONT_OPTIONS.find((f) => f.id === fontFamily) ?? FONT_OPTIONS[0];
  const selectedIconSet =
    ICON_SET_OPTIONS.find((s) => s.id === iconSet) ?? ICON_SET_OPTIONS[0];
  const selectedScale =
    UI_SCALE_OPTIONS.find((s) => s.id === uiScale) ?? UI_SCALE_OPTIONS[1];

  // Preview uses hovered value if present, otherwise the committed selection
  const previewPalette = hoveredPalette ?? palette;
  const previewFontId = hoveredFont ?? fontFamily;
  const previewIconSetId = hoveredIconSet ?? iconSet;
  const previewFontOption =
    FONT_OPTIONS.find((f) => f.id === previewFontId) ?? FONT_OPTIONS[0];

  // Switching: only changes which is open, never closes all
  const switchDropdown = (id: DropdownId) => {
    if (id !== openDropdown) {
      setOpenDropdown(id);
      // Clear hover states when switching panels
      setHoveredPalette(null);
      setHoveredFont(null);
      setHoveredIconSet(null);
      setHoveredScale(null);
    }
  };

  return (
    <div className="theme-builder">
      {/* ── Controls (compact dropdowns) ────────────────── */}
      <div className="theme-builder__controls">
        {/* Palette dropdown */}
        <div
          className={`theme-builder__dropdown ${openDropdown === "palette" ? "theme-builder__dropdown--open" : ""}`}
        >
          <button
            type="button"
            className="theme-builder__dropdown-header"
            onClick={() => switchDropdown("palette")}
            aria-expanded={openDropdown === "palette"}
          >
            <div className="theme-builder__dropdown-selected">
              <div className="theme-builder__palette-mini" data-theme={palette}>
                <div className="theme-builder__palette-mini-bg" />
                <div className="theme-builder__palette-mini-accent" />
              </div>
              <div className="theme-builder__dropdown-info">
                <span className="theme-builder__dropdown-label">Palette</span>
                <span className="theme-builder__dropdown-value">
                  {selectedTheme.name}
                </span>
              </div>
            </div>
            <span className="theme-builder__dropdown-chevron" />
          </button>

          <div className="theme-builder__dropdown-body">
            <div
              className="theme-builder__dropdown-body-inner"
              onMouseLeave={() => setHoveredPalette(null)}
            >
              <div className="theme-builder__palette-grid">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`theme-builder__palette-swatch ${palette === t.id ? "theme-builder__palette-swatch--selected" : ""}`}
                    onClick={() => onPaletteChange(t.id)}
                    onDoubleClick={() => onQuickApply({ theme: t.id })}
                    onMouseEnter={() => setHoveredPalette(t.id)}
                    aria-label={`${t.name}: ${t.description}`}
                    aria-pressed={palette === t.id}
                  >
                    <div className="theme-builder__palette-preview" data-theme={t.id}>
                      <div className="theme-builder__palette-bg" />
                      <div className="theme-builder__palette-accent" />
                    </div>
                    <span className="theme-builder__palette-name">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Font dropdown */}
        <div
          className={`theme-builder__dropdown ${openDropdown === "font" ? "theme-builder__dropdown--open" : ""}`}
        >
          <button
            type="button"
            className="theme-builder__dropdown-header"
            onClick={() => switchDropdown("font")}
            aria-expanded={openDropdown === "font"}
          >
            <div className="theme-builder__dropdown-selected">
              <span
                className="theme-builder__font-mini"
                style={{ fontFamily: selectedFont.family }}
              >
                Aa
              </span>
              <div className="theme-builder__dropdown-info">
                <span className="theme-builder__dropdown-label">Font</span>
                <span className="theme-builder__dropdown-value">{selectedFont.name}</span>
              </div>
            </div>
            <span className="theme-builder__dropdown-chevron" />
          </button>

          <div className="theme-builder__dropdown-body">
            <div
              className="theme-builder__dropdown-body-inner"
              onMouseLeave={() => setHoveredFont(null)}
            >
              <div className="theme-builder__font-list">
                {FONT_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`theme-builder__font-card ${fontFamily === f.id ? "theme-builder__font-card--selected" : ""}`}
                    onClick={() => onFontChange(f.id)}
                    onDoubleClick={() => onQuickApply({ fontFamily: f.id })}
                    onMouseEnter={() => setHoveredFont(f.id)}
                    aria-label={`${f.name} font`}
                    aria-pressed={fontFamily === f.id}
                  >
                    <span className="theme-builder__font-name">{f.name}</span>
                    <span
                      className="theme-builder__font-sample"
                      style={{ fontFamily: f.family }}
                    >
                      The quick brown fox jumps
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Icons dropdown */}
        <div
          className={`theme-builder__dropdown ${openDropdown === "icons" ? "theme-builder__dropdown--open" : ""}`}
        >
          <button
            type="button"
            className="theme-builder__dropdown-header"
            onClick={() => switchDropdown("icons")}
            aria-expanded={openDropdown === "icons"}
          >
            <div className="theme-builder__dropdown-selected">
              <div className="theme-builder__icon-mini">
                {selectedIconSet.preview.slice(0, 3).map((iconName) => {
                  const Icon = getIcon(iconName as IconName, iconSet);
                  return <Icon key={iconName} size={14} />;
                })}
              </div>
              <div className="theme-builder__dropdown-info">
                <span className="theme-builder__dropdown-label">Icons</span>
                <span className="theme-builder__dropdown-value">
                  {selectedIconSet.name}
                </span>
              </div>
            </div>
            <span className="theme-builder__dropdown-chevron" />
          </button>

          <div className="theme-builder__dropdown-body">
            <div
              className="theme-builder__dropdown-body-inner"
              onMouseLeave={() => setHoveredIconSet(null)}
            >
              <div className="theme-builder__icon-grid">
                {ICON_SET_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`theme-builder__icon-card ${iconSet === s.id ? "theme-builder__icon-card--selected" : ""}`}
                    onClick={() => onIconSetChange(s.id)}
                    onDoubleClick={() => onQuickApply({ iconSet: s.id })}
                    onMouseEnter={() => setHoveredIconSet(s.id)}
                    aria-label={`${s.name} icon set: ${s.description}`}
                    aria-pressed={iconSet === s.id}
                  >
                    <div className="theme-builder__icon-card-header">
                      <span className="theme-builder__icon-card-name">{s.name}</span>
                      <span className="theme-builder__icon-card-desc">
                        {s.description}
                      </span>
                    </div>
                    <div className="theme-builder__icon-card-samples">
                      {s.preview.map((iconName) => {
                        const Icon = getIcon(iconName as IconName, s.id);
                        return <Icon key={iconName} size={18} />;
                      })}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Scale dropdown */}
        <div
          className={`theme-builder__dropdown ${openDropdown === "scale" ? "theme-builder__dropdown--open" : ""}`}
        >
          <button
            type="button"
            className="theme-builder__dropdown-header"
            onClick={() => switchDropdown("scale")}
            aria-expanded={openDropdown === "scale"}
          >
            <div className="theme-builder__dropdown-selected">
              <span className="theme-builder__scale-mini">{SCALE_LABELS[uiScale]}</span>
              <div className="theme-builder__dropdown-info">
                <span className="theme-builder__dropdown-label">UI Scale</span>
                <span className="theme-builder__dropdown-value">
                  {selectedScale.name}
                </span>
              </div>
            </div>
            <span className="theme-builder__dropdown-chevron" />
          </button>

          <div className="theme-builder__dropdown-body">
            <div
              className="theme-builder__dropdown-body-inner"
              onMouseLeave={() => setHoveredScale(null)}
            >
              <div className="theme-builder__scale-list">
                {UI_SCALE_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`theme-builder__scale-card ${uiScale === s.id ? "theme-builder__scale-card--selected" : ""}`}
                    onClick={() => onScaleChange(s.id)}
                    onDoubleClick={() => onQuickApply({ uiScale: s.id })}
                    onMouseEnter={() => setHoveredScale(s.id)}
                    aria-label={`${s.name} UI scale: ${s.description}`}
                    aria-pressed={uiScale === s.id}
                  >
                    <span className="theme-builder__scale-name">{s.name}</span>
                    <span className="theme-builder__scale-desc">{s.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Live Preview (dominant) ─────────────────────── */}
      <div className="theme-builder__preview-container">
        <div className="theme-builder__preview-label">Preview</div>
        <div className="theme-builder__preview" data-theme={previewPalette}>
          <div
            className="theme-builder__preview-inner"
            style={{ fontFamily: previewFontOption.family }}
          >
            {/* Mini sidebar */}
            <div className="theme-builder__preview-sidebar">
              <PreviewNavItem
                iconName="library"
                label="Library"
                active
                iconSetId={previewIconSetId}
              />
              <PreviewNavItem
                iconName="activity"
                label="Activity"
                active={false}
                iconSetId={previewIconSetId}
              />
              <PreviewNavItem
                iconName="profile"
                label="Profile"
                active={false}
                iconSetId={previewIconSetId}
              />
            </div>

            {/* Content area */}
            <div className="theme-builder__preview-content">
              {/* Mini toolbar */}
              <div className="theme-builder__preview-toolbar">
                <span className="theme-builder__preview-toolbar-icon">
                  <PreviewIcon name="search" size={14} iconSetId={previewIconSetId} />
                </span>
                <span className="theme-builder__preview-toolbar-text" />
                <span className="theme-builder__preview-toolbar-icon">
                  <PreviewIcon name="filter" size={14} iconSetId={previewIconSetId} />
                </span>
                <span className="theme-builder__preview-toolbar-icon">
                  <PreviewIcon name="sort-asc" size={14} iconSetId={previewIconSetId} />
                </span>
                <span className="theme-builder__preview-toolbar-icon">
                  <PreviewIcon name="grid-view" size={14} iconSetId={previewIconSetId} />
                </span>
              </div>

              {/* Mini game cards row */}
              <div className="theme-builder__preview-cards">
                <PreviewGameCard
                  title="Half-Life 2"
                  genres={["Action", "FPS"]}
                  playtime="12h"
                  iconSetId={previewIconSetId}
                />
                <PreviewGameCard
                  title="Elden Ring"
                  genres={["RPG", "Action"]}
                  playtime="86h"
                  iconSetId={previewIconSetId}
                  favorited
                />
                <PreviewGameCard
                  title="Hades"
                  genres={["Roguelike"]}
                  playtime="34h"
                  iconSetId={previewIconSetId}
                />
              </div>

              {/* Mini list rows */}
              <div className="theme-builder__preview-list">
                <PreviewListRow
                  name="Portal 2"
                  detail="8h"
                  iconSetId={previewIconSetId}
                />
                <PreviewListRow
                  name="Celeste"
                  detail="22h"
                  iconSetId={previewIconSetId}
                />
                <PreviewListRow
                  name="Hollow Knight"
                  detail="45h"
                  iconSetId={previewIconSetId}
                  favorited
                />
                <PreviewListRow
                  name="Disco Elysium"
                  detail="31h"
                  iconSetId={previewIconSetId}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers (avoid using AppIcon which reads from store) ──── */

function PreviewIcon({
  name,
  size,
  iconSetId,
}: {
  name: IconName;
  size: number;
  iconSetId: IconSetId;
}) {
  const Icon = getIcon(name, iconSetId);
  return <Icon size={size} />;
}

function PreviewNavItem({
  iconName,
  label,
  active,
  iconSetId,
}: {
  iconName: IconName;
  label: string;
  active: boolean;
  iconSetId: IconSetId;
}) {
  return (
    <div
      className={`theme-builder__preview-nav-item ${active ? "theme-builder__preview-nav-item--active" : ""}`}
    >
      <span className="theme-builder__preview-nav-icon">
        <PreviewIcon name={iconName} size={14} iconSetId={iconSetId} />
      </span>
      <span>{label}</span>
    </div>
  );
}

function PreviewGameCard({
  title,
  genres,
  playtime,
  iconSetId,
  favorited,
}: {
  title: string;
  genres: string[];
  playtime: string;
  iconSetId: IconSetId;
  favorited?: boolean;
}) {
  return (
    <div className="theme-builder__preview-card">
      <div className="theme-builder__preview-card-image" />
      <div className="theme-builder__preview-card-body">
        <span className="theme-builder__preview-card-title">{title}</span>
        <div className="theme-builder__preview-card-meta">
          {genres.map((g) => (
            <span key={g} className="theme-builder__preview-genre">
              {g}
            </span>
          ))}
          {favorited && (
            <span className="theme-builder__preview-star">
              <PreviewIcon name="star-filled" size={10} iconSetId={iconSetId} />
            </span>
          )}
          <span className="theme-builder__preview-playtime">{playtime}</span>
        </div>
      </div>
    </div>
  );
}

function PreviewListRow({
  name,
  detail,
  iconSetId,
  favorited,
}: {
  name: string;
  detail: string;
  iconSetId: IconSetId;
  favorited?: boolean;
}) {
  return (
    <div className="theme-builder__preview-list-row">
      <PreviewIcon
        name={favorited ? "star-filled" : "star-outline"}
        size={10}
        iconSetId={iconSetId}
      />
      <span className="theme-builder__preview-list-name">{name}</span>
      <span className="theme-builder__preview-list-detail">{detail}</span>
    </div>
  );
}
