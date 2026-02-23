import { create } from "zustand";

export type BackgroundTaskId = "metadata" | "achievements" | "coverArt" | "storeDetails";

export interface TaskProgress {
  current: number;
  total: number;
}

interface BackgroundTasksState {
  activeTasks: Set<BackgroundTaskId>;
  progress: Map<BackgroundTaskId, TaskProgress>;
  dismissed: boolean;

  startTask: (id: BackgroundTaskId, total?: number) => void;
  updateProgress: (id: BackgroundTaskId, current: number, total: number) => void;
  completeTask: (id: BackgroundTaskId) => void;
  dismiss: () => void;
}

export const useBackgroundTasksStore = create<BackgroundTasksState>((set, get) => ({
  activeTasks: new Set(),
  progress: new Map(),
  dismissed: false,

  startTask: (id, total) => {
    const updatedTasks = new Set(get().activeTasks);
    updatedTasks.add(id);
    const updatedProgress = new Map(get().progress);
    if (total !== undefined) {
      updatedProgress.set(id, { current: 0, total });
    }
    set({ activeTasks: updatedTasks, progress: updatedProgress, dismissed: false });
  },

  updateProgress: (id, current, total) => {
    const updatedProgress = new Map(get().progress);
    updatedProgress.set(id, { current, total });
    set({ progress: updatedProgress });
  },

  completeTask: (id) => {
    const updatedTasks = new Set(get().activeTasks);
    updatedTasks.delete(id);
    const updatedProgress = new Map(get().progress);
    updatedProgress.delete(id);
    set({ activeTasks: updatedTasks, progress: updatedProgress });
  },

  dismiss: () => set({ dismissed: true }),
}));
