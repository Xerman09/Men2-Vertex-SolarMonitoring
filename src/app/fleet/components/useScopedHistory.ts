'use client';

import { useEffect, useState } from 'react';
import { getManilaToday } from '@/lib/manila-time';

export interface ScopedHistoryPoint {
  hour?: string;
  solarYieldKw?: number | null;
  loadDemandKw?: number | null;
  batteryFlowKw?: number | null;
  gridFlowKw?: number | null;
  isElapsed?: boolean;
}

export interface HistoryScope {
  accountId?: string;
  stationId?: string;
  deviceSn?: string;
}

export interface ScopedHistoryState {
  status: 'loading' | 'ready' | 'empty' | 'unauthorized' | 'error';
  points: ScopedHistoryPoint[];
}

const POLL_MS = 5 * 60_000;
const RETRY_POLL_MS = 20_000;
const FRESH_MS = 60_000;
const MAX_CONCURRENT_FETCHES = 4;
const MAX_TRANSIENT_RETRIES = 2;

export const SCOPED_HISTORY_AUTH_EVENT = 'dsm:auth-changed';
export const SCOPED_HISTORY_REFRESH_EVENT = 'dsm:history-refresh';

interface CacheEntry {
  state: ScopedHistoryState;
  ts: number;
}

// Shared across all cards so N cards on the same scope cause a single request.
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ScopedHistoryState>>();

let activeFetches = 0;
const fetchWaiters: Array<() => void> = [];

async function runWithConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (activeFetches >= MAX_CONCURRENT_FETCHES) {
    await new Promise<void>((resolve) => {
      fetchWaiters.push(resolve);
    });
  }
  activeFetches += 1;
  try {
    return await fn();
  } finally {
    activeFetches = Math.max(0, activeFetches - 1);
    const next = fetchWaiters.shift();
    if (next) next();
  }
}

function parseRetryDelayMs(res: Response, attempt: number): number {
  const retryHeader = res.headers.get('Retry-After');
  const parsedSec = retryHeader ? Number.parseInt(retryHeader, 10) : NaN;
  if (Number.isFinite(parsedSec) && parsedSec > 0) {
    return Math.min(10_000, Math.max(1_000, parsedSec * 1_000));
  }
  return Math.min(8_000, 1_500 * (attempt + 1));
}

export function clearScopedHistoryCache(): void {
  cache.clear();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SCOPED_HISTORY_REFRESH_EVENT));
  }
}

export function _resetScopedHistoryForTesting(): void {
  cache.clear();
  inFlight.clear();
  activeFetches = 0;
  fetchWaiters.length = 0;
}

function scopeKey(scope: HistoryScope, date: string): string {
  return `fleet-curve:v1:${scope.accountId || 'ALL'}:${scope.stationId || 'ALL'}:${scope.deviceSn || 'ALL'}:${date}`;
}

export async function loadScopedHistory(scope: HistoryScope, date: string, force: boolean): Promise<ScopedHistoryState> {
  const key = scopeKey(scope, date);
  const cached = cache.get(key);
  if (
    !force &&
    cached &&
    (cached.state.status === 'ready' || cached.state.status === 'empty') &&
    Date.now() - cached.ts < FRESH_MS
  ) {
    return cached.state;
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async (): Promise<ScopedHistoryState> => {
    const qs = new URLSearchParams({ range: 'TODAY', step: '5', part: 'day', date });
    if (scope.accountId && scope.accountId !== 'ALL') qs.set('accountId', scope.accountId);
    if (scope.stationId && scope.stationId !== 'ALL') qs.set('station_id', scope.stationId);
    if (scope.deviceSn && scope.deviceSn !== 'ALL') qs.set('device_sn', scope.deviceSn);
    const url = `/api/deye/history?${qs.toString()}`;

    try {
      for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
        try {
          const res = await runWithConcurrencyLimit(() => fetch(url));

          if (res.status === 401 || res.status === 403) {
            return cached?.state.status === 'ready'
              ? cached.state
              : { status: 'unauthorized', points: [] };
          }

          if (res.status === 429 || res.status >= 500) {
            if (attempt < MAX_TRANSIENT_RETRIES) {
              const delayMs = parseRetryDelayMs(res, attempt);
              await new Promise((resolve) => setTimeout(resolve, delayMs));
              continue;
            }
            return cached?.state ?? { status: 'error', points: [] };
          }

          if (!res.ok) {
            return cached?.state ?? { status: 'error', points: [] };
          }

          const json = (await res.json()) as { data?: ScopedHistoryPoint[]; isLive?: boolean };
          // Never plot simulated fallback data: only real DeyeCloud telemetry is accepted.
          const state: ScopedHistoryState =
            json.isLive && Array.isArray(json.data) && json.data.length > 0
              ? { status: 'ready', points: json.data }
              : { status: 'empty', points: [] };
          cache.set(key, { state, ts: Date.now() });
          return state;
        } catch {
          if (attempt < MAX_TRANSIENT_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, 1_200 * (attempt + 1)));
            continue;
          }
          // Keep last good telemetry on transient errors; surface error state if no cache exists.
          return cached?.state ?? { status: 'error', points: [] };
        }
      }

      return cached?.state ?? { status: 'error', points: [] };
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

export function useScopedHistory(scope: HistoryScope): ScopedHistoryState {
  const accountId = scope.accountId;
  const stationId = scope.stationId;
  const deviceSn = scope.deviceSn;

  const [state, setState] = useState<ScopedHistoryState>(() => {
    const hit = cache.get(scopeKey({ accountId, stationId, deviceSn }, getManilaToday()));
    return hit ? hit.state : { status: 'loading', points: [] };
  });

  useEffect(() => {
    let active = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const scoped: HistoryScope = { accountId, stationId, deviceSn };
    const cachedHit = cache.get(scopeKey(scoped, getManilaToday()));
    setState(cachedHit ? cachedHit.state : { status: 'loading', points: [] });

    const scheduleNext = (result: ScopedHistoryState) => {
      if (!active) return;
      if (pollTimer) clearTimeout(pollTimer);
      const nextDelay =
        result.status === 'error' || result.status === 'unauthorized' ? RETRY_POLL_MS : POLL_MS;
      pollTimer = setTimeout(() => {
        void run(true);
      }, nextDelay);
    };

    const run = async (force: boolean) => {
      if (typeof document !== 'undefined' && document.hidden && !force) return;
      const next = await loadScopedHistory(scoped, getManilaToday(), force);
      if (active) {
        setState(next);
        scheduleNext(next);
      }
    };

    void run(false);

    const onVisible = () => {
      if (!document.hidden) void run(false);
    };
    const onAuthOrRefresh = () => {
      void run(true);
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(SCOPED_HISTORY_AUTH_EVENT, onAuthOrRefresh);
    window.addEventListener(SCOPED_HISTORY_REFRESH_EVENT, onAuthOrRefresh);

    return () => {
      active = false;
      if (pollTimer) clearTimeout(pollTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(SCOPED_HISTORY_AUTH_EVENT, onAuthOrRefresh);
      window.removeEventListener(SCOPED_HISTORY_REFRESH_EVENT, onAuthOrRefresh);
    };
  }, [accountId, stationId, deviceSn]);

  return state;
}
