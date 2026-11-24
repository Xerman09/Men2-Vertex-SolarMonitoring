'use client';

import { useEffect, useRef, useCallback } from 'react';

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

/**
 * Safe transient timeout hook that auto-cleans on unmount
 * and cancels any active timer when a new one is scheduled.
 */
export function useSafeTimeout() {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const setSafeTimeout = useCallback((fn: () => void, delayMs: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(fn, delayMs);
    return timeoutRef.current;
  }, []);

  const clearSafeTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return { setSafeTimeout, clearSafeTimeout, timeoutRef };
}

/**
 * Multi-timer registry hook that tracks and auto-cleans all spawned timeouts on unmount.
 */
export function useSafeTimeouts() {
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, []);

  const safeTimeout = useCallback((fn: () => void, delayMs: number) => {
    const id = setTimeout(fn, delayMs);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  return { safeTimeout, clearAllTimeouts, timeoutsRef };
}
