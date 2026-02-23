import {
  useBackgroundTasksStore,
  type BackgroundTaskId,
} from "../../store/backgroundTasksSlice";
import "./BackgroundTaskBanner.css";

const TASK_LABELS: Record<BackgroundTaskId, string> = {
  metadata: "game details",
  achievements: "achievements",
  coverArt: "cover art",
  storeDetails: "additional details",
};

export function BackgroundTaskBanner() {
  const activeTasks = useBackgroundTasksStore((s) => s.activeTasks);
  const progress = useBackgroundTasksStore((s) => s.progress);
  const dismissed = useBackgroundTasksStore((s) => s.dismissed);
  const dismiss = useBackgroundTasksStore((s) => s.dismiss);

  if (activeTasks.size === 0 || dismissed) return null;

  const taskNames = [...activeTasks].map((id) => {
    const prog = progress.get(id);
    const label = TASK_LABELS[id];
    if (prog && prog.total > 0) {
      return `${label} (${prog.current}/${prog.total})`;
    }
    return label;
  });
  const message =
    taskNames.length === 1
      ? `Loading ${taskNames[0]}...`
      : `Loading ${taskNames.slice(0, -1).join(", ")} and ${taskNames[taskNames.length - 1]}...`;

  return (
    <div className="bg-task-banner" role="status" aria-live="polite">
      <span className="bg-task-banner__pulse" />
      <span className="bg-task-banner__text">{message}</span>
      <button className="bg-task-banner__dismiss" onClick={dismiss} aria-label="Dismiss">
        &times;
      </button>
    </div>
  );
}
