'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { StationSummary } from '@/lib/types';
import { usePolling } from '@/lib/usePolling';

export interface UseStationTelemetryOptions {
  stationId?: string;
  accountId?: string;
  intervalMs?: number;
  autoPoll?: boolean;
}

export interface UseStationTelemetryReturn {
  data: StationSummary | null;
  loading: boolean;
  error: string | null;
  isLive: boolean;
  refresh: () => Promise<void>;
}

export function useStationTelemetry({
  stationId,
  accountId,
  intervalMs = 15000,
  autoPoll = true,
}: UseStationTelemetryOptions = {}): UseStationTelemetryReturn {
  const [data, setData] = useState<StationSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState<boolean>(false);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const params = new URLSearchParams();
      if (stationId) params.set('stationId', stationId);
      if (accountId) params.set('accountId', accountId);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/deye/station${qs}`);

      if (!res.ok) {
        throw new Error(`Station telemetry request failed with status ${res.status}`);
      }

      const json = await res.json();
      setData(json.data || null);
      setIsLive(Boolean(json.isLive));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve telemetry');
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [stationId, accountId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  usePolling(refresh, {
    intervalMs,
    enabled: autoPoll,
    pauseOnHidden: true,
  });

  return { data, loading, error, isLive, refresh };
}
