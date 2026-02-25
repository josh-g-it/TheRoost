import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { updaterApi } from "../../services/tauri";
import type { UpdateInfo } from "../../types";
import "./UpdateBanner.css";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const INITIAL_DELAY_MS = 5 * 1000; // 5 seconds after app start

export function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const dismissedVersionRef = useRef<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkForUpdate = async () => {
      try {
        const info = await updaterApi.checkForUpdate();
        if (info && info.version !== dismissedVersionRef.current) {
          setUpdateInfo(info);
          setDismissed(false);
        }
      } catch {
        // Silently ignore — don't bother the user with background check failures
      }
    };

    const initialTimer = setTimeout(checkForUpdate, INITIAL_DELAY_MS);
    const interval = setInterval(checkForUpdate, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  if (!updateInfo || dismissed) return null;

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <span className="update-banner__icon">&#8593;</span>
      <span className="update-banner__text">
        Update available: <strong>v{updateInfo.version}</strong>
      </span>
      <button className="update-banner__action" onClick={() => navigate("/settings")}>
        View in Settings
      </button>
      <button
        className="update-banner__dismiss"
        onClick={() => {
          dismissedVersionRef.current = updateInfo.version;
          setDismissed(true);
        }}
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}
