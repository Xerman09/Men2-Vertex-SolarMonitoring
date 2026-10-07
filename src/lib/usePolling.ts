'use client';

import { useEffect, useRef } from 'react';

export interface UsePollingOptions {
  intervalMs: number;
  enabled?: boolean;
  pauseOnHidden?: boolean;
}

/**
 * Robust interval polling hook with automatic cleanup and tab-visibility pause
 */
export function usePolling(
  callback: () => void | Promise<void>,
  { intervalMs, enabled = true, pauseOnHidden = true }: UsePollingOptions
) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let timerId: NodeJS.Timeout | null = null;

    const tick = () => {
      if (pauseOnHidden && typeof document !== 'undefined' && document.hidden) {
        return;
      }
      savedCallback.current();
    };

    timerId = setInterval(tick, intervalMs);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden && enabled) {
        // Run immediately upon tab becoming visible again
        savedCallback.current();
      }
    };

    if (pauseOnHidden && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (timerId) clearInterval(timerId);
      if (pauseOnHidden && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [intervalMs, enabled, pauseOnHidden]);
}
