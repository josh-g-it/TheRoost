import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  /** Override Tier 1 execution (e.g., overlay relays actions to main window via IPC). */
  executeTier1?: (action: ResolvedAction) => ActionResult;
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
    if (r.error === "canceled (dependency)") {
      return `- ${id} → canceled (dependency)`;
    }
    return `- ${id} → failed: ${r.error ?? "unknown error"}`;
  });

  return `[System] Previous actions:\n${lines.join("\n")}`;
}

export function useActionPipeline({ navigate, executeTier1 }: UseActionPipelineOptions) {
  const [state, setState] = useState<ActionPipelineState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Ref for synchronous access to completed results (survives React batching)
  const feedbackResultsRef = useRef<ActionResult[]>([]);

  // Delay timer ref for cleanup
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // Without delay: batch-execute all consecutive T1 actions in a single synchronous pass
  // so that navigation + filter actions all fire before any component unmount
  // (from route change) can interrupt the sequence.
  // With delay: execute one T1, enter "delaying" status, then resume after timeout.
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
      logger.info("useActionPipeline", "ai", "Paused for T2 confirmation", {
        actionId: action.originalActionId,
      });
      setState((prev) => ({ ...prev, status: "paused" }));
      return;
    }

    const delay = useSettingsStore.getState().settings?.assistantActionDelay ?? 0;

    if (delay > 0) {
      // With delay: execute one T1 action, then enter "delaying" status
      const result = executeTier1 ? executeTier1(action) : executeAction(action);
      const hasMore = currentIndex + 1 < actions.length;

      if (hasMore) {
        setState((prev) => ({
          ...prev,
          currentIndex: prev.currentIndex + 1,
          results: [...prev.results, result],
          status: "delaying",
        }));
        delayTimerRef.current = setTimeout(() => {
          delayTimerRef.current = null;
          setState((prev) => ({ ...prev, status: "running" }));
        }, delay);
      } else {
        // Last action — advance immediately (completed on next effect cycle)
        setState((prev) => ({
          ...prev,
          currentIndex: prev.currentIndex + 1,
          results: [...prev.results, result],
        }));
      }
    } else {
      // No delay: batch-execute all consecutive T1 actions synchronously
      let idx = currentIndex;
      const batchResults: ActionResult[] = [];
      while (idx < actions.length && actions[idx].tier === 1) {
        batchResults.push(
          executeTier1 ? executeTier1(actions[idx]) : executeAction(actions[idx]),
        );
        idx++;
      }
      logger.info("useActionPipeline", "ai", "Batch T1 executed", {
        count: batchResults.length,
        next: idx < actions.length ? `T${actions[idx].tier} at index ${idx}` : "end",
      });
      setState((prev) => ({
        ...prev,
        currentIndex: idx,
        results: [...prev.results, ...batchResults],
      }));
    }

    return () => {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
    };
  }, [state, executeAction, executeTier1]);

  // v1.12.1: Actions execute in AI-specified order (no T2-before-T1 reordering).
  // The persistent bubble + ConversationProvider ensures pipeline state survives
  // T1 navigation actions, eliminating the v1.12.0 unmount concern.
  const setActions = useCallback((actions: ResolvedAction[]) => {
    feedbackResultsRef.current = [];
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
    if (actions.length === 0) {
      setState({ ...INITIAL_STATE, status: "completed" });
      return;
    }
    logger.info("useActionPipeline", "ai", "Pipeline started", {
      actionCount: actions.length,
    });
    setState({
      actions,
      currentIndex: 0,
      status: "running",
      results: [],
    });
  }, []);

  const confirmTier2 = useCallback(
    (action: ResolvedAction, precomputedResult?: ActionResult) => {
      const result = precomputedResult ?? executeAction(action);
      const confirmedResult = { ...result, confirmed: true };
      const delay = useSettingsStore.getState().settings?.assistantActionDelay ?? 0;

      setState((prev) => {
        const nextIndex = prev.currentIndex + 1;
        const hasMore = nextIndex < prev.actions.length;

        if (delay > 0 && hasMore) {
          // Enter delaying state after T2 confirmation
          delayTimerRef.current = setTimeout(() => {
            delayTimerRef.current = null;
            setState((p) => ({ ...p, status: "running" }));
          }, delay);
          return {
            ...prev,
            status: "delaying" as PipelineStatus,
            currentIndex: nextIndex,
            results: [...prev.results, confirmedResult],
          };
        }

        return {
          ...prev,
          status: "running",
          currentIndex: nextIndex,
          results: [...prev.results, confirmedResult],
        };
      });
    },
    [executeAction],
  );

  const denyTier2 = useCallback(() => {
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
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
          error: "canceled (dependency)",
          executedAt: new Date().toISOString(),
        }));
      const allResults = [...prev.results, deniedResult, ...remainingResults];
      feedbackResultsRef.current = allResults;
      return { ...prev, status: "canceled" as const, results: allResults };
    });
    logger.info("useActionPipeline", "ai", "Tier 2 denied — pipeline canceled");
  }, []);

  const cancelAll = useCallback(() => {
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
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
          error: "canceled (dependency)",
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
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
    feedbackResultsRef.current = [];
    setState(INITIAL_STATE);
  }, []);

  return useMemo(
    () => ({
      state,
      setActions,
      confirmTier2,
      denyTier2,
      cancelAll,
      consumeResults,
      reset,
    }),
    [state, setActions, confirmTier2, denyTier2, cancelAll, consumeResults, reset],
  );
}
