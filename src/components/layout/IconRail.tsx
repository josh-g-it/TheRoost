import { NavLink } from "react-router-dom";
import { useSettingsStore } from "../../store/settingsSlice";
import { APP_NAME, APP_VERSION } from "../../constants";
import type { RailMode } from "../../types";
import type { IconName } from "../../utils/icons";
import { AppIcon } from "../common/AppIcon";
import { logger } from "../../utils/logger";
import roostLogo from "../../assets/images/theroost.png";
import "./IconRail.css";

const navItems: { path: string; label: string; icon: IconName }[] = [
  { path: "/library", label: "Library", icon: "library" },
  { path: "/activity", label: "Activity", icon: "activity" },
  { path: "/profile", label: "Profile", icon: "profile" },
  { path: "/notes", label: "Notes", icon: "notes" },
  { path: "/settings", label: "Settings", icon: "settings" },
];

const RAIL_MODE_CYCLE: RailMode[] = ["dynamic", "expanded", "collapsed"];
const RAIL_MODE_ICONS: Record<RailMode, IconName> = {
  dynamic: "sidebar",
  expanded: "pin",
  collapsed: "chevron-right",
};
const RAIL_MODE_LABELS: Record<RailMode, string> = {
  dynamic: "Dynamic \u2014 hover to expand",
  expanded: "Pinned open",
  collapsed: "Icons only",
};

interface IconRailProps {
  onCommandCenterToggle: () => void;
  railMode: RailMode;
}

export function IconRail({ onCommandCenterToggle, railMode }: IconRailProps) {
  const settings = useSettingsStore((s) => s.settings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);

  const cycleRailMode = () => {
    if (!settings) return;
    const currentIndex = RAIL_MODE_CYCLE.indexOf(railMode);
    const nextMode = RAIL_MODE_CYCLE[(currentIndex + 1) % RAIL_MODE_CYCLE.length];
    logger.info("IconRail", "ui", "Rail mode changed", { from: railMode, to: nextMode });
    saveSettings({ ...settings, railMode: nextMode });
  };

  return (
    <aside
      className={`icon-rail ${railMode === "expanded" ? "icon-rail--expanded" : ""} ${railMode === "collapsed" ? "icon-rail--collapsed" : ""}`}
    >
      <div className="icon-rail__header">
        <button
          className="icon-rail__logo-btn"
          onClick={onCommandCenterToggle}
          aria-label="Open command center"
          title="Open command center"
        >
          <img
            className="icon-rail__logo-icon"
            src={roostLogo}
            alt={APP_NAME}
            width={28}
            height={28}
          />
          <span className="icon-rail__logo-text">{APP_NAME}</span>
        </button>
      </div>

      <nav className="icon-rail__nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `icon-rail__link ${isActive ? "icon-rail__link--active" : ""}`
            }
          >
            <span className="icon-rail__link-icon">
              <AppIcon name={item.icon} size={20} />
            </span>
            <span className="icon-rail__link-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="icon-rail__footer">
        <button
          className="icon-rail__expand-btn"
          onClick={cycleRailMode}
          aria-label={`Rail mode: ${RAIL_MODE_LABELS[railMode]}. Click to change.`}
          title={RAIL_MODE_LABELS[railMode]}
        >
          <AppIcon name={RAIL_MODE_ICONS[railMode]} size={14} />
        </button>
        <span className="icon-rail__version">v{APP_VERSION}</span>
      </div>
    </aside>
  );
}
