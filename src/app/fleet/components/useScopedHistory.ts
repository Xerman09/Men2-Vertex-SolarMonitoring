'use client';

import { useEffect, useState } from 'react';
import { getManilaToday } from '@/lib/manila-time';

export interface ScopedHistoryPoint {
  hour?: string;
  solarYieldKw?: number | null;
  loadDemandKw?: number | null;
  gridFlowKw?: number | null;
  isElapsed?: boolean;
}

export interface HistoryScope {
  accountId?: string;
  stationId?: string;
}

export interface ScopedHistoryState {
  status: 'loading' | 'ready' | 'empty';
  points: ScopedHistoryPoint[];
}

const POLL_MS = 5 * 60_000;
const FRESH_MS = 60_000;

interface CacheEntry {
  state: ScopedHistoryState;
  ts: number;
}

// Shared across all cards so N cards on the same scope cause a single request.
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ScopedHistoryState>>();

function scopeKey(scope: HistoryScope, date: string): string {
  return `fleet-curve:v1:${scope.accountId || 'ALL'}:${scope.stationId || 'ALL'}:${date}`;
}

async function loadScopedHistory(scope: HistoryScope, date: string, force: boolean): Promise<ScopedHistoryState> {
  const key = scopeKey(scope, date);
  const cached = cache.get(key);
  if (!force && cached && Date.now() - cached.ts < FRESH_MS) return cached.state;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async (): Promise<ScopedHistoryState> => {
    try {
      const qs = new URLSearchParams({ range: 'TODAY', step: '5', part: 'day', date });
      if (scope.accountId && scope.accountId !== 'ALL') qs.set('accountId', scope.accountId);
      if (scope.stationId && scope.stationId !== 'ALL') qs.set('station_id', scope.stationId);
      const res = await fetch(`/api/deye/history?${qs.toString()}`);
      if (!res.ok) throw new Error(`history ${res.status}`);
      const json = (await res.json()) as { data?: ScopedHistoryPoint[]; isLive?: boolean };
      // Never plot simulated fallback data: only real DeyeCloud telemetry is accepted.
      const state: ScopedHistoryState =
        json.isLive && Array.isArray(json.data) && json.data.length > 0
          ? { status: 'ready', points: json.data }
          : { status: 'empty', points: [] };
      cache.set(key, { state, ts: Date.now() });
      return state;
    } catch {
      // Keep the last good data on transient failures instead of blanking the graph.
      return cached?.state ?? { status: 'empty', points: [] };
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
  const [state, setState] = useState<ScopedHistoryState>(() => {
    const hit = cache.get(scopeKey({ accountId, stationId }, getManilaToday()));
    return hit ? hit.state : { status: 'loading', points: [] };
  });

  useEffect(() => {
    let active = true;
    const run = async (force: boolean) => {
      if (typeof document !== 'undefined' && document.hidden && !force) return;
      const next = await loadScopedHistory({ accountId, stationId }, getManilaToday(), force);
      if (active) setState(next);
    };
    run(false);
    const timer = setInterval(() => run(true), POLL_MS);
    const onVisible = () => {
      if (!document.hidden) run(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [accountId, stationId]);

  return state;
}

