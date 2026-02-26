import { create } from "zustand";
import type { InstallProgress } from "../types/install";

interface InstallState {
  /** Map of sourceId → active install progress */
  activeInstalls: Map<string, InstallProgress>;

  updateProgress: (progresses: InstallProgress[]) => void;
  completeInstall: (sourceId: string) => void;
  clearAll: () => void;
}

export const useInstallStore = create<InstallState>((set) => ({
  activeInstalls: new Map(),

  updateProgress: (progresses) =>
    set((state) => {
      const next = new Map(state.activeInstalls);
      for (const p of progresses) {
        next.set(p.sourceId, p);
      }
      return { activeInstalls: next };
    }),

  completeInstall: (sourceId) =>
    set((state) => {
      const next = new Map(state.activeInstalls);
      next.delete(sourceId);
      return { activeInstalls: next };
    }),

  clearAll: () => set({ activeInstalls: new Map() }),
}));
