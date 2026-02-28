import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useActionPipeline, serializeActionFeedback } from "./useActionPipeline";
import type { ResolvedAction, ActionResult } from "../types";

// Mock resolveExecutor from commandPalette
const mockExecutors: Record<string, vi.Mock> = {};
vi.mock("../utils/commandPalette", () => ({
  resolveExecutor: (actionId: string) => mockExecutors[actionId] ?? null,
}));

// Mock settings store
vi.mock("../store/settingsSlice", () => ({
  useSettingsStore: {
    getState: () => ({
      settings: { theme: "dark" },
      saveSettings: vi.fn(),
    }),
  },
}));

// Mock logger
vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockNavigate = vi.fn();

function makeAction(
  overrides: Partial<ResolvedAction> & { actionId: string; tier: number },
): ResolvedAction {
  return {
    originalActionId: overrides.actionId,
    resolvedName: undefined,
    description: undefined,
    payload: undefined,
    ...overrides,
  };
}

describe("useActionPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear all mock executors
    for (const key of Object.keys(mockExecutors)) {
      delete mockExecutors[key];
    }
  });

  it("starts in idle state", () => {
    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    expect(result.current.state.status).toBe("idle");
    expect(result.current.state.actions).toEqual([]);
    expect(result.current.state.currentIndex).toBe(0);
    expect(result.current.state.results).toEqual([]);
  });

  it("transitions to completed immediately for empty actions", () => {
    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([]);
    });
    expect(result.current.state.status).toBe("completed");
  });

  it("executes single Tier 1 action and completes", () => {
    const executor = vi.fn();
    mockExecutors["sort:playtime"] = executor;

    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([makeAction({ actionId: "sort:playtime", tier: 1 })]);
    });

    expect(executor).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe("completed");
    expect(result.current.state.results).toHaveLength(1);
    expect(result.current.state.results[0].success).toBe(true);
  });

  it("executes multiple Tier 1 actions sequentially", () => {
    const callOrder: string[] = [];
    mockExecutors["sort:playtime"] = vi.fn(() => callOrder.push("sort"));
    mockExecutors["view:grid"] = vi.fn(() => callOrder.push("view"));
    mockExecutors["nav:library"] = vi.fn(() => callOrder.push("nav"));

    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([
        makeAction({ actionId: "sort:playtime", tier: 1 }),
        makeAction({ actionId: "view:grid", tier: 1 }),
        makeAction({ actionId: "nav:library", tier: 1 }),
      ]);
    });

    expect(callOrder).toEqual(["sort", "view", "nav"]);
    expect(result.current.state.status).toBe("completed");
    expect(result.current.state.results).toHaveLength(3);
    expect(result.current.state.results.every((r) => r.success)).toBe(true);
  });

  it("pauses at Tier 2 action", () => {
    mockExecutors["sort:playtime"] = vi.fn();

    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([
        makeAction({ actionId: "sort:playtime", tier: 1 }),
        makeAction({
          actionId: "favorite:uuid-123",
          tier: 2,
          originalActionId: "favorite:Elden Ring",
        }),
      ]);
    });

    expect(mockExecutors["sort:playtime"]).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe("paused");
    expect(result.current.state.currentIndex).toBe(1);
    expect(result.current.state.results).toHaveLength(1);
  });

  it("confirmTier2 resumes and completes pipeline", () => {
    const favoriteExecutor = vi.fn();
    mockExecutors["sort:playtime"] = vi.fn();
    mockExecutors["favorite:uuid-123"] = favoriteExecutor;

    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([
        makeAction({ actionId: "sort:playtime", tier: 1 }),
        makeAction({
          actionId: "favorite:uuid-123",
          tier: 2,
          originalActionId: "favorite:Elden Ring",
        }),
      ]);
    });

    expect(result.current.state.status).toBe("paused");

    // Confirm the Tier 2 action
    act(() => {
      result.current.confirmTier2(result.current.state.actions[1]);
    });

    expect(favoriteExecutor).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe("completed");
    expect(result.current.state.results).toHaveLength(2);
    expect(result.current.state.results[1].success).toBe(true);
  });

  it("denyTier2 cancels pipeline and records denied + remaining results", () => {
    mockExecutors["sort:playtime"] = vi.fn();

    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([
        makeAction({ actionId: "sort:playtime", tier: 1 }),
        makeAction({
          actionId: "favorite:uuid-123",
          tier: 2,
          originalActionId: "favorite:Elden Ring",
        }),
        makeAction({ actionId: "nav:library", tier: 1 }),
      ]);
    });

    expect(result.current.state.status).toBe("paused");

    act(() => {
      result.current.denyTier2();
    });

    expect(result.current.state.status).toBe("canceled");
    // Results: sort(success) + favorite(denied) + nav(canceled) = 3
    expect(result.current.state.results).toHaveLength(3);
    expect(result.current.state.results[0].success).toBe(true);
    expect(result.current.state.results[1].success).toBe(false);
    expect(result.current.state.results[1].error).toBe("denied by user");
    expect(result.current.state.results[1].originalActionId).toBe("favorite:Elden Ring");
    expect(result.current.state.results[2].success).toBe(false);
    expect(result.current.state.results[2].error).toBe("canceled (sequence stopped)");
  });

  it("cancelAll stops a running pipeline and records remaining results", () => {
    // Tier 2 at the start causes immediate pause
    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([
        makeAction({
          actionId: "favorite:uuid-1",
          tier: 2,
          originalActionId: "favorite:Elden Ring",
        }),
        makeAction({ actionId: "sort:name", tier: 1 }),
      ]);
    });

    expect(result.current.state.status).toBe("paused");

    act(() => {
      result.current.cancelAll();
    });

    expect(result.current.state.status).toBe("canceled");
    // Both actions recorded as canceled
    expect(result.current.state.results).toHaveLength(2);
    expect(result.current.state.results[0].error).toBe("canceled (sequence stopped)");
    expect(result.current.state.results[1].error).toBe("canceled (sequence stopped)");
  });

  it("cancelAll is a no-op when idle", () => {
    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.cancelAll();
    });
    expect(result.current.state.status).toBe("idle");
  });

  it("cancelAll is a no-op when already completed", () => {
    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([]);
    });
    expect(result.current.state.status).toBe("completed");

    act(() => {
      result.current.cancelAll();
    });
    expect(result.current.state.status).toBe("completed");
  });

  it("reset returns to idle state", () => {
    mockExecutors["sort:playtime"] = vi.fn();

    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([makeAction({ actionId: "sort:playtime", tier: 1 })]);
    });
    expect(result.current.state.status).toBe("completed");

    act(() => {
      result.current.reset();
    });

    expect(result.current.state.status).toBe("idle");
    expect(result.current.state.actions).toEqual([]);
    expect(result.current.state.results).toEqual([]);
  });

  it("records failure when no executor found for action", () => {
    // No executor registered for "unknown:action"
    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([makeAction({ actionId: "unknown:action", tier: 1 })]);
    });

    expect(result.current.state.status).toBe("completed");
    expect(result.current.state.results).toHaveLength(1);
    expect(result.current.state.results[0].success).toBe(false);
    expect(result.current.state.results[0].error).toBe("Unknown action");
  });

  it("records failure when executor throws and continues", () => {
    mockExecutors["bad:action"] = vi.fn(() => {
      throw new Error("Boom!");
    });
    mockExecutors["nav:library"] = vi.fn();

    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([
        makeAction({ actionId: "bad:action", tier: 1 }),
        makeAction({ actionId: "nav:library", tier: 1 }),
      ]);
    });

    expect(result.current.state.status).toBe("completed");
    expect(result.current.state.results).toHaveLength(2);
    expect(result.current.state.results[0].success).toBe(false);
    expect(result.current.state.results[0].error).toBe("Boom!");
    expect(result.current.state.results[1].success).toBe(true);
  });

  it("handles Tier 2 at the very start of the pipeline", () => {
    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([makeAction({ actionId: "favorite:uuid-1", tier: 2 })]);
    });

    expect(result.current.state.status).toBe("paused");
    expect(result.current.state.currentIndex).toBe(0);
  });

  it("handles multiple Tier 2 actions in sequence", () => {
    mockExecutors["favorite:uuid-1"] = vi.fn();
    mockExecutors["review:uuid-2"] = vi.fn();

    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([
        makeAction({ actionId: "favorite:uuid-1", tier: 2 }),
        makeAction({ actionId: "review:uuid-2", tier: 2 }),
      ]);
    });

    expect(result.current.state.status).toBe("paused");
    expect(result.current.state.currentIndex).toBe(0);

    // Confirm first
    act(() => {
      result.current.confirmTier2(result.current.state.actions[0]);
    });

    // Should pause again on second Tier 2
    expect(result.current.state.status).toBe("paused");
    expect(result.current.state.currentIndex).toBe(1);

    // Confirm second
    act(() => {
      result.current.confirmTier2(result.current.state.actions[1]);
    });

    expect(result.current.state.status).toBe("completed");
    expect(result.current.state.results).toHaveLength(2);
  });

  it("passes navigate to executor context", () => {
    mockExecutors["nav:library"] = vi.fn((ctx) => {
      ctx.navigate("/library");
    });

    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([makeAction({ actionId: "nav:library", tier: 1 })]);
    });

    expect(mockNavigate).toHaveBeenCalledWith("/library");
  });

  it("tracks originalActionId in results", () => {
    mockExecutors["favorite:uuid-123"] = vi.fn();

    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([
        makeAction({
          actionId: "favorite:uuid-123",
          tier: 1,
          originalActionId: "favorite:Elden Ring",
        }),
      ]);
    });

    expect(result.current.state.results[0].originalActionId).toBe("favorite:Elden Ring");
  });

  it("all results have executedAt timestamps", () => {
    mockExecutors["sort:playtime"] = vi.fn();
    mockExecutors["view:grid"] = vi.fn();

    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([
        makeAction({ actionId: "sort:playtime", tier: 1 }),
        makeAction({ actionId: "view:grid", tier: 1 }),
      ]);
    });

    for (const r of result.current.state.results) {
      expect(r.executedAt).toBeTruthy();
      expect(() => new Date(r.executedAt)).not.toThrow();
    }
  });

  // ── Phase 13d: Feedback result tracking ───────────────────────────

  it("confirmTier2 sets confirmed flag on results", () => {
    mockExecutors["favorite:uuid-1"] = vi.fn();

    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([
        makeAction({
          actionId: "favorite:uuid-1",
          tier: 2,
          originalActionId: "favorite:Elden Ring",
        }),
      ]);
    });

    expect(result.current.state.status).toBe("paused");

    act(() => {
      result.current.confirmTier2(result.current.state.actions[0]);
    });

    expect(result.current.state.results).toHaveLength(1);
    expect(result.current.state.results[0].confirmed).toBe(true);
    expect(result.current.state.results[0].success).toBe(true);
  });

  it("Tier 1 auto-executed results do not have confirmed flag", () => {
    mockExecutors["sort:playtime"] = vi.fn();

    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([makeAction({ actionId: "sort:playtime", tier: 1 })]);
    });

    expect(result.current.state.results[0].confirmed).toBeUndefined();
  });

  it("consumeResults returns results and clears them", () => {
    mockExecutors["sort:playtime"] = vi.fn();

    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([makeAction({ actionId: "sort:playtime", tier: 1 })]);
    });

    expect(result.current.state.status).toBe("completed");

    let consumed: ActionResult[] = [];
    act(() => {
      consumed = result.current.consumeResults();
    });

    expect(consumed).toHaveLength(1);
    expect(consumed[0].success).toBe(true);

    // Second call returns empty
    let second: ActionResult[] = [];
    act(() => {
      second = result.current.consumeResults();
    });
    expect(second).toEqual([]);
  });

  it("consumeResults returns empty when no results", () => {
    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));

    let consumed: ActionResult[] = [];
    act(() => {
      consumed = result.current.consumeResults();
    });
    expect(consumed).toEqual([]);
  });

  it("consumeResults captures denied results after denyTier2", () => {
    mockExecutors["sort:playtime"] = vi.fn();

    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([
        makeAction({ actionId: "sort:playtime", tier: 1 }),
        makeAction({
          actionId: "favorite:uuid-1",
          tier: 2,
          originalActionId: "favorite:Elden Ring",
        }),
      ]);
    });

    act(() => {
      result.current.denyTier2();
    });

    let consumed: ActionResult[] = [];
    act(() => {
      consumed = result.current.consumeResults();
    });

    expect(consumed).toHaveLength(2);
    expect(consumed[0].success).toBe(true);
    expect(consumed[1].error).toBe("denied by user");
  });

  it("consumeResults captures canceled results after cancelAll", () => {
    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([
        makeAction({
          actionId: "favorite:uuid-1",
          tier: 2,
          originalActionId: "favorite:Elden Ring",
        }),
        makeAction({ actionId: "nav:library", tier: 1 }),
      ]);
    });

    act(() => {
      result.current.cancelAll();
    });

    let consumed: ActionResult[] = [];
    act(() => {
      consumed = result.current.consumeResults();
    });

    expect(consumed).toHaveLength(2);
    expect(consumed[0].error).toBe("canceled (sequence stopped)");
    expect(consumed[1].error).toBe("canceled (sequence stopped)");
  });

  it("reset clears consumable results", () => {
    mockExecutors["sort:playtime"] = vi.fn();

    const { result } = renderHook(() => useActionPipeline({ navigate: mockNavigate }));
    act(() => {
      result.current.setActions([makeAction({ actionId: "sort:playtime", tier: 1 })]);
    });

    act(() => {
      result.current.reset();
    });

    let consumed: ActionResult[] = [];
    act(() => {
      consumed = result.current.consumeResults();
    });
    expect(consumed).toEqual([]);
  });
});

// ── serializeActionFeedback tests ─────────────────────────────────────

describe("serializeActionFeedback", () => {
  it("returns empty string for empty results", () => {
    expect(serializeActionFeedback([])).toBe("");
  });

  it("formats successful Tier 1 action", () => {
    const results: ActionResult[] = [
      {
        actionId: "sort:playtime",
        originalActionId: "sort:playtime",
        success: true,
        executedAt: "t",
      },
    ];
    expect(serializeActionFeedback(results)).toBe(
      "[System] Previous actions:\n- sort:playtime → success",
    );
  });

  it("formats confirmed Tier 2 action", () => {
    const results: ActionResult[] = [
      {
        actionId: "favorite:uuid",
        originalActionId: "favorite:Elden Ring",
        success: true,
        confirmed: true,
        executedAt: "t",
      },
    ];
    expect(serializeActionFeedback(results)).toBe(
      "[System] Previous actions:\n- favorite:Elden Ring → confirmed, success",
    );
  });

  it("formats denied action", () => {
    const results: ActionResult[] = [
      {
        actionId: "favorite:uuid",
        originalActionId: "favorite:Elden Ring",
        success: false,
        error: "denied by user",
        executedAt: "t",
      },
    ];
    expect(serializeActionFeedback(results)).toBe(
      "[System] Previous actions:\n- favorite:Elden Ring → denied by user",
    );
  });

  it("formats canceled action", () => {
    const results: ActionResult[] = [
      {
        actionId: "nav:library",
        originalActionId: "nav:library",
        success: false,
        error: "canceled (sequence stopped)",
        executedAt: "t",
      },
    ];
    expect(serializeActionFeedback(results)).toBe(
      "[System] Previous actions:\n- nav:library → canceled (sequence stopped)",
    );
  });

  it("formats failed action with error message", () => {
    const results: ActionResult[] = [
      {
        actionId: "bad:action",
        originalActionId: "bad:action",
        success: false,
        error: "Network timeout",
        executedAt: "t",
      },
    ];
    expect(serializeActionFeedback(results)).toBe(
      "[System] Previous actions:\n- bad:action → failed: Network timeout",
    );
  });

  it("formats mixed results correctly", () => {
    const results: ActionResult[] = [
      {
        actionId: "sort:playtime",
        originalActionId: "sort:playtime",
        success: true,
        executedAt: "t",
      },
      {
        actionId: "favorite:uuid",
        originalActionId: "favorite:Elden Ring",
        success: true,
        confirmed: true,
        executedAt: "t",
      },
      {
        actionId: "filter:favorites",
        originalActionId: "filter:favorites",
        success: true,
        executedAt: "t",
      },
    ];
    const expected = [
      "[System] Previous actions:",
      "- sort:playtime → success",
      "- favorite:Elden Ring → confirmed, success",
      "- filter:favorites → success",
    ].join("\n");
    expect(serializeActionFeedback(results)).toBe(expected);
  });

  it("formats denial with remaining canceled", () => {
    const results: ActionResult[] = [
      {
        actionId: "favorite:uuid",
        originalActionId: "favorite:Elden Ring",
        success: false,
        error: "denied by user",
        executedAt: "t",
      },
      {
        actionId: "filter:favorites",
        originalActionId: "filter:favorites",
        success: false,
        error: "canceled (sequence stopped)",
        executedAt: "t",
      },
    ];
    const expected = [
      "[System] Previous actions:",
      "- favorite:Elden Ring → denied by user",
      "- filter:favorites → canceled (sequence stopped)",
    ].join("\n");
    expect(serializeActionFeedback(results)).toBe(expected);
  });
});
