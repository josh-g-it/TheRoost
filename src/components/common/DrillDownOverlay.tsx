import { useEffect, useCallback } from "react";
import { AppIcon } from "./AppIcon";
import "./DrillDownOverlay.css";

interface DrillDownOverlayProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function DrillDownOverlay({
  title,
  subtitle,
  onClose,
  children,
}: DrillDownOverlayProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="drill-down-overlay" onClick={onClose}>
      <div className="drill-down-overlay__panel" onClick={(e) => e.stopPropagation()}>
        <div className="drill-down-overlay__header">
          <div className="drill-down-overlay__header-text">
            <h3 className="drill-down-overlay__title">{title}</h3>
            {subtitle && <p className="drill-down-overlay__subtitle">{subtitle}</p>}
          </div>
          <button className="drill-down-overlay__close" onClick={onClose} title="Close">
            <AppIcon name="close" size={18} />
          </button>
        </div>
        <div className="drill-down-overlay__content">{children}</div>
      </div>
    </div>
  );
}
