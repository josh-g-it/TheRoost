import { useState, useRef, useEffect } from "react";
import { AppIcon } from "../common/AppIcon";
import { useUIStore } from "../../store/uiSlice";
import { useSettingsStore } from "../../store/settingsSlice";
import { GRID_SIZE_CONFIG } from "../../types";
import type { GridSize, ListDensity } from "../../types";
import "./CardDisplayPopover.css";

const GRID_SIZES: GridSize[] = ["small", "medium", "large"];
const LIST_DENSITIES: { value: ListDensity; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "default", label: "Default" },
  { value: "comfortable", label: "Comfortable" },
];

export function CardDisplayPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cardDisplay = useUIStore((s) => s.cardDisplay);
  const setCardDisplay = useUIStore((s) => s.setCardDisplay);
  const setGridSize = useUIStore((s) => s.setGridSize);
  const setListDensity = useUIStore((s) => s.setListDensity);
  const viewMode = useUIStore((s) => s.viewMode);
  const settings = useSettingsStore((s) => s.settings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const persistCardDisplay = (updated: typeof cardDisplay) => {
    if (settings) saveSettings({ ...settings, cardDisplay: updated });
  };

  const toggle = (
    key:
      | "showGenreTags"
      | "showPlaytime"
      | "showInstalledBadge"
      | "showTags"
      | "showRatingBadge",
  ) => {
    const updated = { ...cardDisplay, [key]: !cardDisplay[key] };
    setCardDisplay(updated);
    persistCardDisplay(updated);
  };

  const handleGridSize = (size: GridSize) => {
    setGridSize(size);
    persistCardDisplay({ ...cardDisplay, gridSize: size });
  };

  const handleListDensity = (density: ListDensity) => {
    setListDensity(density);
    persistCardDisplay({ ...cardDisplay, listDensity: density });
  };

  return (
    <div className="card-display-popover" ref={ref}>
      <button
        className="card-display-popover__trigger"
        onClick={() => setOpen(!open)}
        aria-label="Card display options"
        aria-expanded={open}
        title="Card display options"
      >
        <AppIcon name="settings" size={16} />
      </button>
      {open && (
        <div className="card-display-popover__dropdown" role="menu">
          <div className="card-display-popover__title">Show on cards</div>
          <label className="card-display-popover__option">
            <input
              type="checkbox"
              checked={cardDisplay.showGenreTags}
              onChange={() => toggle("showGenreTags")}
            />
            <span>Genre tags</span>
          </label>
          <label className="card-display-popover__option">
            <input
              type="checkbox"
              checked={cardDisplay.showPlaytime}
              onChange={() => toggle("showPlaytime")}
            />
            <span>Playtime</span>
          </label>
          <label className="card-display-popover__option">
            <input
              type="checkbox"
              checked={cardDisplay.showInstalledBadge}
              onChange={() => toggle("showInstalledBadge")}
            />
            <span>Installed badge</span>
          </label>
          <label className="card-display-popover__option">
            <input
              type="checkbox"
              checked={cardDisplay.showTags}
              onChange={() => toggle("showTags")}
            />
            <span>Custom tags</span>
          </label>
          <label className="card-display-popover__option">
            <input
              type="checkbox"
              checked={cardDisplay.showRatingBadge}
              onChange={() => toggle("showRatingBadge")}
            />
            <span>My Rating</span>
          </label>

          {viewMode === "grid" && (
            <>
              <div className="card-display-popover__title card-display-popover__title--section">
                Grid size
              </div>
              <div className="card-display-popover__size-row">
                {GRID_SIZES.map((size) => (
                  <button
                    key={size}
                    className={`card-display-popover__size-btn ${cardDisplay.gridSize === size ? "card-display-popover__size-btn--active" : ""}`}
                    onClick={() => handleGridSize(size)}
                  >
                    {GRID_SIZE_CONFIG[size].label}
                  </button>
                ))}
              </div>
            </>
          )}

          {viewMode === "list" && (
            <>
              <div className="card-display-popover__title card-display-popover__title--section">
                List density
              </div>
              <div className="card-display-popover__size-row">
                {LIST_DENSITIES.map((d) => (
                  <button
                    key={d.value}
                    className={`card-display-popover__size-btn ${cardDisplay.listDensity === d.value ? "card-display-popover__size-btn--active" : ""}`}
                    onClick={() => handleListDensity(d.value)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
