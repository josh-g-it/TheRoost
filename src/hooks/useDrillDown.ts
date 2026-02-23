import { useState, useCallback } from "react";

interface DrillDownState<T> {
  isOpen: boolean;
  context: T | null;
  open: (ctx: T) => void;
  close: () => void;
}

export function useDrillDown<T>(): DrillDownState<T> {
  const [context, setContext] = useState<T | null>(null);

  const open = useCallback((ctx: T) => setContext(ctx), []);
  const close = useCallback(() => setContext(null), []);

  return {
    isOpen: context !== null,
    context,
    open,
    close,
  };
}
