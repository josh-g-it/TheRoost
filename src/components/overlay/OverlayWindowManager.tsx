import { useCallback, useEffect, useRef, useState } from "react";
import type { OverlayPanelId } from "../../types/settings";
import type { MediaControlsMode } from "../../types";
import { OVERLAY_PANELS } from "./overlayPanelRegistry";
import { AppIcon } from "../common/AppIcon";
import "./OverlayWindowManager.css";

const MEDIA_MODE_OPTIONS: { id: MediaControlsMode; label: string }[] = [
  { id: "dynamic", label: "Dynamic" },
  { id: "always", label: "Always On" },
  { id: "hidden", label: "Off" },
];

interface OverlayWindowManagerProps {
  panelStates: Record<string, { visible: boolean }>;
  onTogglePanel: (id: OverlayPanelId) => void;
  onResetPanel: (id: OverlayPanelId) => void;
  onHidePanel: (id: OverlayPanelId) => void;
  mediaControlsMode?: MediaControlsMode;
  onMediaControlsModeChange?: (mode: MediaControlsMode) => void;
}

export function OverlayWindowManager({
  panelStates,
  onTogglePanel,
  onResetPanel,
  onHidePanel,
  mediaControlsMode = "dynamic",
  onMediaControlsModeChange,
}: OverlayWindowManagerProps) {
  const [openDropdownId, setOpenDropdownId] = useState<OverlayPanelId | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!openDropdownId) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [openDropdownId]);

  // Close dropdown on Escape
  useEffect(() => {
    if (!openDropdownId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpenDropdownId(null);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [openDropdownId]);

  const handleClick = useCallback(
    (id: OverlayPanelId) => {
      // Media controls always opens dropdown (mode picker)
      if (id === "media-controls") {
        setOpenDropdownId((prev) => (prev === id ? null : id));
        return;
      }

      const isVisible = panelStates[id]?.visible ?? true;
      if (!isVisible) {
        onTogglePanel(id);
        setOpenDropdownId(null);
      } else {
        setOpenDropdownId((prev) => (prev === id ? null : id));
      }
    },
    [panelStates, onTogglePanel],
  );

  return (
    <div className="overlay-wm">
      <span className="overlay-wm__title">HUD</span>
      <span className="overlay-wm__divider" />
      {OVERLAY_PANELS.map((panel) => {
        const isVisible = panelStates[panel.id]?.visible ?? true;
        const isDropdownOpen = openDropdownId === panel.id;
        const isMediaControls = panel.id === "media-controls";

        return (
          <div
            key={panel.id}
            className="overlay-wm__item"
            ref={isDropdownOpen ? dropdownRef : undefined}
          >
            <button
              className={`overlay-wm__btn ${isVisible ? "overlay-wm__btn--active" : ""}`}
              onClick={() => handleClick(panel.id)}
              title={panel.label}
            >
              <AppIcon name={panel.icon} size={15} />
              <span className="overlay-wm__btn-label">{panel.label}</span>
            </button>
            {isDropdownOpen && isMediaControls && (
              <div className="overlay-wm__dropdown">
                {MEDIA_MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    className={`overlay-wm__dropdown-item ${mediaControlsMode === opt.id ? "overlay-wm__dropdown-item--active" : ""}`}
                    onClick={() => {
                      onMediaControlsModeChange?.(opt.id);
                      setOpenDropdownId(null);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
                <div className="overlay-wm__dropdown-sep" />
                <button
                  className="overlay-wm__dropdown-item"
                  onClick={() => {
                    onResetPanel(panel.id);
                    setOpenDropdownId(null);
                  }}
                >
                  <AppIcon name="refresh" size={13} />
                  Reset Position
                </button>
              </div>
            )}
            {isDropdownOpen && !isMediaControls && isVisible && (
              <div className="overlay-wm__dropdown">
                <button
                  className="overlay-wm__dropdown-item"
                  onClick={() => {
                    onHidePanel(panel.id);
                    setOpenDropdownId(null);
                  }}
                >
                  <AppIcon name="eye-off" size={13} />
                  Hide
                </button>
                <button
                  className="overlay-wm__dropdown-item"
                  onClick={() => {
                    onResetPanel(panel.id);
                    setOpenDropdownId(null);
                  }}
                >
                  <AppIcon name="refresh" size={13} />
                  Reset Position
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
