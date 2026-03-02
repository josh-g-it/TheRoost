import { useEffect, useRef, type DependencyList } from "react";
import { listen, type Event } from "@tauri-apps/api/event";

interface UseEventListenerOptions {
  enabled?: boolean;
}

/**
 * Safely subscribes to a Tauri event with proper async cleanup.
 *
 * Handles the race condition where a component unmounts before `listen()`
 * resolves its unlisten function. The handler is stored in a ref so
 * re-subscription only happens when eventName or deps change, not when
 * the handler closure updates.
 */
export function useEventListener<T>(
  eventName: string,
  handler: (event: Event<T>) => void,
  deps: DependencyList = [],
  options?: UseEventListenerOptions,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;
    let unlistenFn: (() => void) | null = null;

    listen<T>(eventName, (event) => {
      if (!isMounted) return;
      handlerRef.current(event);
    }).then((fn) => {
      if (isMounted) {
        unlistenFn = fn;
      } else {
        fn();
      }
    });

    return () => {
      isMounted = false;
      unlistenFn?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName, enabled, ...deps]);
}
