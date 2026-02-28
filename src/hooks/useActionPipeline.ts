import { useCallback, useEffect, useRef, useState } from "react";
import type { ResolvedAction, PipelineStatus, ActionResult } from "../types";
import type { PaletteContext } from "../types";
import { resolveExecutor } from "../utils/commandPalette";
import { useSettingsStore } from "../store/settingsSlice";
import { logger } from "../utils/logger";

export interface ActionPipelineState {
  actions: ResolvedAction[];
  currentIndex: number;
  status: PipelineStatus;
  results: ActionResult[];
}

interface UseActionPipelineOptions {
  navigate: (path: string) => void;
}

const INITIAL_STATE: ActionPipelineState = {
  actions: [],
  currentIndex: 0,
  status: "idle",
  results: [],
};

/**
 * Serialize pipeline results into a hidden feedback message for the AI.
 * Uses originalActionId (human-readable names) so the AI can understand context.
 */
export function serializeActionFeedback(results: ActionResult[]): string {
  if (results.length === 0) return "";

  const lines = results.map((r) => {
    const id = r.originalActionId;
    if (r.success && r.confirmed) {
      return `- ${id} → confirmed, success`;
    }
    if (r.success) {
      return `- ${id} → success`;
    }
    if (r.error === "denied by user") {
      return `- ${id} → denied by user`;
    }
    if (r.error === "canceled (sequence stopped)") {
      return `- ${id} → canceled (sequence stopped)`;
    }
    return `- ${id} → failed: ${r.error ?? "unknown error"}`;
  });

  return `[System] Previous actions:\n${lines.join("\n")}`;
}

export function useActionPipeline({ navigate }: UseActionPipelineOptions) {
  const [state, setState] = useState<ActionPipelineState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Ref for synchronous access to completed results (survives React batching)
  const feedbackResultsRef = useRef<ActionResult[]>([]);

  // Build PaletteContext for executor calls
  const buildContext = useCallback((): PaletteContext => {
    const settings = useSettingsStore.getState().settings;
    return {
      navigate,
      closeCommandCenter: () => {}, // noop — no command center in assistant
      settings: settings ?? ({} as PaletteContext["settings"]),
      saveSettings: (s) => useSettingsStore.getState().saveSettings(s),
    };
  }, [navigate]);

  // Execute a single action, return result
  const executeAction = useCallback(
    (action: ResolvedAction): ActionResult => {
      const executor = resolveExecutor(action.actionId);
      if (!executor) {
        logger.warn("useActionPipeline", "ai", "No executor found", {
          actionId: action.actionId,
        });
        return {
          actionId: action.actionId,
          originalActionId: action.originalActionId,
          success: false,
          error: "Unknown action",
          executedAt: new Date().toISOString(),
        };
      }
      try {
        const ctx = buildContext();
        executor(ctx);
        return {
          actionId: action.actionId,
          originalActionId: action.originalActionId,
          success: true,
          executedAt: new Date().toISOString(),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("useActionPipeline", "ai", "Executor threw", {
          actionId: action.actionId,
          error: message,
        });
        return {
          actionId: action.actionId,
          originalActionId: action.originalActionId,
          success: false,
          error: message,
          executedAt: new Date().toISOString(),
        };
      }
    },
    [buildContext],
  );

  // Process the pipeline from the current index.
  // Batch-executes all consecutive Tier 1 actions in a single synchronous pass
  // so that navigation + filter actions all fire before any component unmount
  // (from route change) can interrupt the sequence.
  useEffect(() => {
    if (state.status !== "running") return;

    const { actions, currentIndex } = state;

    // All done
    if (currentIndex >= actions.length) {
      setState((prev) => {
        feedbackResultsRef.current = prev.results;
        return { ...prev, status: "completed" };
      });
      logger.info("useActionPipeline", "ai", "Pipeline completed", {
        total: actions.length,
        results: state.results.length,
      });
      return;
    }

    const action = actions[currentIndex];

    // Tier 2: pause for user confirmation
    if (action.tier === 2) {
      setState((prev) => ({ ...prev, status: "paused" }));
      return;
    }

    // Tier 1: batch-execute all consecutive Tier 1 actions synchronously
    let idx = currentIndex;
    const batchResults: ActionResult[] = [];
    while (idx < actions.length && actions[idx].tier === 1) {
      batchResults.push(executeAction(actions[idx]));
      idx++;
    }

    setState((prev) => ({
      ...prev,
      currentIndex: idx,
      results: [...prev.results, ...batchResults],
    }));
  }, [state, executeAction]);

  const setActions = useCallback((actions: ResolvedAction[]) => {
    feedbackResultsRef.current = [];
    if (actions.length === 0) {
      setState({ ...INITIAL_STATE, status: "completed" });
      return;
    }
    setState({
      actions,
      currentIndex: 0,
      status: "running",
      results: [],
    });
    logger.info("useActionPipeline", "ai", "Pipeline started", {
      actionCount: actions.length,
    });
  }, []);

  const confirmTier2 = useCallback(
    (action: ResolvedAction, precomputedResult?: ActionResult) => {
      const result = precomputedResult ?? executeAction(action);
      const confirmedResult = { ...result, confirmed: true };
      setState((prev) => ({
        ...prev,
        status: "running",
        currentIndex: prev.currentIndex + 1,
        results: [...prev.results, confirmedResult],
      }));
    },
    [executeAction],
  );

  const denyTier2 = useCallback(() => {
    setState((prev) => {
      const currentAction = prev.actions[prev.currentIndex];
      const deniedResult: ActionResult = {
        actionId: currentAction.actionId,
        originalActionId: currentAction.originalActionId,
        success: false,
        error: "denied by user",
        executedAt: new Date().toISOString(),
      };
      const remainingResults: ActionResult[] = prev.actions
        .slice(prev.currentIndex + 1)
        .map((a) => ({
          actionId: a.actionId,
          originalActionId: a.originalActionId,
          success: false,
          error: "canceled (sequence stopped)",
          executedAt: new Date().toISOString(),
        }));
      const allResults = [...prev.results, deniedResult, ...remainingResults];
      feedbackResultsRef.current = allResults;
      return { ...prev, status: "canceled" as const, results: allResults };
    });
    logger.info("useActionPipeline", "ai", "Tier 2 denied — pipeline canceled");
  }, []);

  const cancelAll = useCallback(() => {
    setState((prev) => {
      if (
        prev.status === "idle" ||
        prev.status === "completed" ||
        prev.status === "canceled"
      ) {
        return prev;
      }
      const remainingResults: ActionResult[] = prev.actions
        .slice(prev.currentIndex)
        .map((a) => ({
          actionId: a.actionId,
          originalActionId: a.originalActionId,
          success: false,
          error: "canceled (sequence stopped)",
          executedAt: new Date().toISOString(),
        }));
      const allResults = [...prev.results, ...remainingResults];
      feedbackResultsRef.current = allResults;
      return { ...prev, status: "canceled" as const, results: allResults };
    });
  }, []);

  /** Read and clear pending feedback results. Call before sending the next user message. */
  const consumeResults = useCallback((): ActionResult[] => {
    const results = feedbackResultsRef.current;
    feedbackResultsRef.current = [];
    return results;
  }, []);

  const reset = useCallback(() => {
    feedbackResultsRef.current = [];
    setState(INITIAL_STATE);
  }, []);

  return {
    state,
    setActions,
    confirmTier2,
    denyTier2,
    cancelAll,
    consumeResults,
    reset,
  };
}
