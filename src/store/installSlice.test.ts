import { describe, it, expect, beforeEach } from "vitest";
import { useInstallStore } from "./installSlice";
import { makeInstallProgress } from "../test/factories";

describe("installSlice", () => {
  beforeEach(() => {
    useInstallStore.setState({
      activeInstalls: new Map(),
    });
  });

  it("starts with empty state", () => {
    const state = useInstallStore.getState();
    expect(state.activeInstalls.size).toBe(0);
  });

  it("updateProgress adds new installs", () => {
    const p1 = makeInstallProgress({ sourceId: "100", name: "Game A" });
    const p2 = makeInstallProgress({ sourceId: "200", name: "Game B", progress: 0.3 });

    useInstallStore.getState().updateProgress([p1, p2]);

    const { activeInstalls } = useInstallStore.getState();
    expect(activeInstalls.size).toBe(2);
    expect(activeInstalls.get("100")!.name).toBe("Game A");
    expect(activeInstalls.get("200")!.progress).toBe(0.3);
  });

  it("updateProgress overwrites existing entries", () => {
    const p1 = makeInstallProgress({ sourceId: "100", progress: 0.2 });
    useInstallStore.getState().updateProgress([p1]);

    const p2 = makeInstallProgress({ sourceId: "100", progress: 0.8 });
    useInstallStore.getState().updateProgress([p2]);

    const { activeInstalls } = useInstallStore.getState();
    expect(activeInstalls.size).toBe(1);
    expect(activeInstalls.get("100")!.progress).toBe(0.8);
  });

  it("completeInstall removes the entry", () => {
    const p = makeInstallProgress({ sourceId: "100" });
    useInstallStore.getState().updateProgress([p]);
    expect(useInstallStore.getState().activeInstalls.size).toBe(1);

    useInstallStore.getState().completeInstall("100");
    expect(useInstallStore.getState().activeInstalls.size).toBe(0);
  });

  it("completeInstall is a no-op for unknown sourceId", () => {
    const p = makeInstallProgress({ sourceId: "100" });
    useInstallStore.getState().updateProgress([p]);

    useInstallStore.getState().completeInstall("999");
    expect(useInstallStore.getState().activeInstalls.size).toBe(1);
  });

  it("clearAll empties the map", () => {
    useInstallStore
      .getState()
      .updateProgress([
        makeInstallProgress({ sourceId: "1" }),
        makeInstallProgress({ sourceId: "2" }),
        makeInstallProgress({ sourceId: "3" }),
      ]);
    expect(useInstallStore.getState().activeInstalls.size).toBe(3);

    useInstallStore.getState().clearAll();
    expect(useInstallStore.getState().activeInstalls.size).toBe(0);
  });
});
