import type { InstallProgress } from "../../types/install";
import "./InstallProgressOverlay.css";

interface InstallProgressOverlayProps {
  progress: InstallProgress;
}

export function InstallProgressOverlay({ progress }: InstallProgressOverlayProps) {
  const percent = Math.round(progress.progress * 100);
  const label =
    progress.status === "downloading"
      ? `Downloading ${percent}%`
      : progress.status === "staging"
        ? `Installing ${percent}%`
        : progress.status === "update_required"
          ? "Update queued"
          : "Pending...";

  return (
    <div className="install-progress-overlay">
      <div className="install-progress-overlay__bar">
        <div
          className="install-progress-overlay__fill"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="install-progress-overlay__label">{label}</span>
    </div>
  );
}
