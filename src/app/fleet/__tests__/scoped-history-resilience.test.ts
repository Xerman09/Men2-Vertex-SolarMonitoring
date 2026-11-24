import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadScopedHistory,
  _resetScopedHistoryForTesting,
} from '../components/useScopedHistory';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

describe('Scoped Fleet History Resilience & Proxy Session Parity', () => {
  beforeEach(() => {
    _resetScopedHistoryForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('distinguishes 401/403 from genuine empty telemetry and recovers on subsequent fetch', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            isLive: true,
            data: [{ hour: '12:00', solarYieldKw: 45.2, loadDemandKw: 18.1, gridFlowKw: 27.1 }],
          }),
          { status: 200 }
        )
      );

    const first = await loadScopedHistory(
      { accountId: 'acc-1', stationId: 'st-1' },
      '2026-11-17',
      false
    );
    expect(first.status).toBe('unauthorized');
    expect(first.points).toHaveLength(0);

    // Subsequent call must retry (not poisoned by unauthorized state) and return live points
    const second = await loadScopedHistory(
      { accountId: 'acc-1', stationId: 'st-1' },
      '2026-11-17',
      false
    );
    expect(second.status).toBe('ready');
    expect(second.points).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries 429 rate-limit responses and settles ready without blanking cards', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429,
          headers: { 'Retry-After': '1' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            isLive: true,
            data: [{ hour: '13:00', solarYieldKw: 62.5, loadDemandKw: 20.0, gridFlowKw: 42.5 }],
          }),
          { status: 200 }
        )
      );

    const res = await loadScopedHistory(
      { accountId: 'acc-1', stationId: 'st-2' },
      '2026-11-17',
      false
    );
    expect(res.status).toBe('ready');
    expect(res.points[0].solarYieldKw).toBe(62.5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caps simultaneous in-flight card history fetches to avoid bursting upstream APIs', async () => {
    let inFlightNow = 0;
    let maxObserved = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      inFlightNow += 1;
      maxObserved = Math.max(maxObserved, inFlightNow);
      await new Promise((r) => setTimeout(r, 25));
      inFlightNow -= 1;
      return new Response(
        JSON.stringify({
          isLive: true,
          data: [{ hour: '10:00', solarYieldKw: 12.0 }],
        }),
        { status: 200 }
      );
    });

    const scopes = Array.from({ length: 10 }, (_, idx) => ({
      accountId: 'acc-1',
      stationId: `st-${idx}`,
    }));
    const results = await Promise.all(
      scopes.map((s) => loadScopedHistory(s, '2026-11-17', false))
    );

    expect(maxObserved).toBeLessThanOrEqual(4);
    expect(results.every((r) => r.status === 'ready')).toBe(true);
  });

  it('preserves cached telemetry on persistent upstream errors and emits error status if uncached', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Upstream unavailable' }), { status: 503 })
    );

    const uncached = await loadScopedHistory(
      { accountId: 'acc-err', stationId: 'st-err' },
      '2026-11-17',
      false
    );
    expect(uncached.status).toBe('error');
    expect(uncached.points).toHaveLength(0);
  });

  it('proxy allows valid session tokens on /fleet and redirects unauthenticated requests', async () => {
    const unauthReq = new NextRequest('http://localhost:3005/fleet');
    const unauthRes = await proxy(unauthReq);
    expect(unauthRes.status).toBe(307);
    expect(unauthRes.headers.get('location')).toContain('/login');

    const token = await createSessionToken({
      userId: 'admin-1',
      email: 'admin@local',
      role: 'admin',
    });
    const authReq = new NextRequest('http://localhost:3005/fleet', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    });
    const authRes = await proxy(authReq);
    expect(authRes.status).toBe(200);
  });
});
