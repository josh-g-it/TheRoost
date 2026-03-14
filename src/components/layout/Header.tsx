import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./Header.css";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

/** Minimal SVG window control icons (Windows-style). */
const MinimizeSvg = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
    <rect x="0" y="4.5" width="10" height="1" />
  </svg>
);
const MaximizeSvg = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
  >
    <rect x="0.5" y="0.5" width="9" height="9" />
  </svg>
);
const RestoreSvg = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
  >
    <rect x="0.5" y="2.5" width="7" height="7" />
    <polyline points="2.5,2.5 2.5,0.5 9.5,0.5 9.5,7.5 7.5,7.5" />
  </svg>
);
const CloseSvg = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2">
    <line x1="0" y1="0" x2="10" y2="10" />
    <line x1="10" y1="0" x2="0" y2="10" />
  </svg>
);

export function Header({ title, subtitle, actions }: HeaderProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [appWindow]);

  const handleMinimize = useCallback(() => {
    appWindow.minimize();
  }, [appWindow]);

  const handleMaximize = useCallback(() => {
    appWindow.toggleMaximize();
  }, [appWindow]);

  const handleClose = useCallback(() => {
    appWindow.close();
  }, [appWindow]);

  return (
    <header className="header" data-tauri-drag-region>
      <div className="header__left">
        <h2 className="header__title">{title}</h2>
        {subtitle && <span className="header__subtitle">{subtitle}</span>}
      </div>
      {actions && <div className="header__actions">{actions}</div>}
      <div className="header__window-controls">
        <button
          className="header__win-btn"
          onClick={handleMinimize}
          aria-label="Minimize"
          title="Minimize"
        >
          <MinimizeSvg />
        </button>
        <button
          className="header__win-btn"
          onClick={handleMaximize}
          aria-label={isMaximized ? "Restore" : "Maximize"}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <RestoreSvg /> : <MaximizeSvg />}
        </button>
        <button
          className="header__win-btn header__win-btn--close"
          onClick={handleClose}
          aria-label="Close"
          title="Close"
        >
          <CloseSvg />
        </button>
      </div>
    </header>
  );
}
