'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tv, AlertTriangle } from 'lucide-react';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import { useTariff } from '@/lib/tariff-context';
import { getManilaNowParts, getManilaToday } from '@/lib/manila-time';
import { loadScopedHistory } from '@/app/fleet/components/useScopedHistory';
import type { DailyAnalyticsPoint } from '@/lib/analytics-data';
import type { TvBriefResult } from '@/lib/gemini-tv-brief';
import type { AggregatedFleetSummary } from '@/lib/types';
import { TvHudBar, type TvIntervalSeconds } from './components/TvHudBar';
import { TvSlideDeck } from './components/TvSlideDeck';
import { buildTvSlides, filterTvAuthorizedAccounts } from './types';

const AGGREGATE_POLL_MS = 30_000;
const BRIEF_POLL_MS = 5 * 60_000;
const HUD_IDLE_HIDE_MS = 3_000;
const PIXEL_SHIFT_INTERVAL_MS = 10 * 60_000;

const SHIFT_OFFSETS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 2, y: 1 },
  { x: 1, y: -2 },
  { x: -2, y: -1 },
  { x: -1, y: 2 },
];

export default function TvSlideshowPage() {
  const { accounts: contextAccounts } = useAccount();
  const { isAdmin, isConsumer, user, isInitialized } = useRole();
  const { activeTariff } = useTariff();

  const [aggregate, setAggregate] = useState<AggregatedFleetSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [brief, setBrief] = useState<TvBriefResult | null>(null);
  const [weeklySeries, setWeeklySeries] = useState<DailyAnalyticsPoint[] | null>(null);

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [paused, setPaused] = useState<boolean>(false);
  const [intervalSec, setIntervalSec] = useState<TvIntervalSeconds>(30);
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  const [hudVisible, setHudVisible] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [shiftIndex, setShiftIndex] = useState<number>(0);
  const [manilaClock, setManilaClock] = useState<string>(() => {
    const p = getManilaNowParts();
    return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')} PHT`;
  });

  const [announcement, setAnnouncement] = useState<string>('');
  const didMountSlideRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tariffRatePhp = activeTariff?.peakRate ?? 13.9;
  const tariffLabel = activeTariff?.schedule?.shortName || 'Standard PHP';

  // Fetch fleet aggregate every 30s, retaining last verified telemetry on transient errors
  const fetchAggregate = useCallback(async () => {
    try {
      const res = await fetch('/api/deye/aggregate');
      if (!res.ok) throw new Error(`aggregate ${res.status}`);
      const json = (await res.json()) as AggregatedFleetSummary;
      setAggregate(json);
      consecutiveFailuresRef.current = 0;
      setIsStale(false);
    } catch {
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= 2) {
        setIsStale(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAggregate();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetchAggregate();
    }, AGGREGATE_POLL_MS);
    return () => clearInterval(timer);
  }, [fetchAggregate]);

  const authorizedAccounts = useMemo(() => {
    const source =
      aggregate?.accounts && aggregate.accounts.length > 0
        ? aggregate.accounts
        : contextAccounts;
    return filterTvAuthorizedAccounts(source, { isAdmin, isConsumer, user });
  }, [aggregate, contextAccounts, isAdmin, isConsumer, user]);

  const slides = useMemo(
    () =>
      buildTvSlides(authorizedAccounts, aggregate?.nodes || [], {
        isConsumer,
        priorityStationId: brief?.priorityStationId,
      }),
    [authorizedAccounts, aggregate?.nodes, isConsumer, brief?.priorityStationId]
  );

  // Clamp activeIndex if slides count changes (e.g. triage slide appears/disappears)
  useEffect(() => {
    if (slides.length > 0 && activeIndex >= slides.length) {
      setActiveIndex(0);
      setElapsedMs(0);
    }
  }, [slides.length, activeIndex]);

  // Fetch Gemini 3.5 grounded TV ticker brief every 5m
  const consumerTargetAccountId =
    isConsumer && authorizedAccounts[0] ? authorizedAccounts[0].id : undefined;

  const fetchBrief = useCallback(async () => {
    if (!isInitialized || !user) return;
    try {
      const qs = new URLSearchParams({ tariffRate: String(tariffRatePhp) });
      if (consumerTargetAccountId) qs.set('accountId', consumerTargetAccountId);
      const res = await fetch(`/api/tv/brief?${qs.toString()}`);
      if (!res.ok) return;
      const json = (await res.json()) as TvBriefResult;
      if (json.headline) setBrief(json);
    } catch {
      // Retain previous brief or deterministic local summary
    }
  }, [isInitialized, user, tariffRatePhp, consumerTargetAccountId]);

  useEffect(() => {
    void fetchBrief();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetchBrief();
    }, BRIEF_POLL_MS);
    return () => clearInterval(timer);
  }, [fetchBrief]);

  // Fetch real 7D harvest summary for Financial slide
  useEffect(() => {
    if (!isInitialized || !user) return;
    let active = true;
    const qs = new URLSearchParams({
      range: 'WEEK',
      step: '5',
      part: 'period',
      date: getManilaToday(),
    });
    if (consumerTargetAccountId) qs.set('accountId', consumerTargetAccountId);
    fetch(`/api/deye/history?${qs.toString()}`)
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as { dailySeries?: DailyAnalyticsPoint[] | null };
        if (active && Array.isArray(json.dailySeries) && json.dailySeries.length > 0) {
          setWeeklySeries(json.dailySeries);
        }
      })
      .catch(() => {
        // Keep last verified weekly series
      });
    return () => {
      active = false;
    };
  }, [isInitialized, user, consumerTargetAccountId]);

  // Manila clock ticker + anti-burn-in pixel shift every 10 minutes
  useEffect(() => {
    const clockTimer = setInterval(() => {
      const p = getManilaNowParts();
      setManilaClock(`${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')} PHT`);
    }, 15_000);

    const shiftTimer = setInterval(() => {
      setShiftIndex((prev) => (prev + 1) % SHIFT_OFFSETS.length);
    }, PIXEL_SHIFT_INTERVAL_MS);

    return () => {
      clearInterval(clockTimer);
      clearInterval(shiftTimer);
    };
  }, []);

  // Screen Wake Lock while TV slideshow is mounted and visible
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let active = true;

    const requestLock = async () => {
      try {
        if (
          typeof navigator !== 'undefined' &&
          'wakeLock' in navigator &&
          document.visibilityState === 'visible'
        ) {
          sentinel = await navigator.wakeLock.request('screen');
        }
      } catch {
        // Ignore browser WakeLock denial / unsupported environments
      }
    };

    void requestLock();
    const onVisible = () => {
      if (active && document.visibilityState === 'visible') {
        void requestLock();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      if (sentinel) {
        void sentinel.release().catch(() => {});
      }
    };
  }, []);

  // Sync fullscreen state listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen denial without user gesture
    }
  }, []);

  // Auto-hide HUD after 3s of pointer inactivity
  const bumpHud = useCallback(() => {
    setHudVisible(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setHudVisible(false);
    }, HUD_IDLE_HIDE_MS);
  }, []);

  useEffect(() => {
    bumpHud();
    const onPointerOrKey = () => bumpHud();
    window.addEventListener('mousemove', onPointerOrKey);
    window.addEventListener('touchstart', onPointerOrKey, { passive: true });
    window.addEventListener('keydown', onPointerOrKey);
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.removeEventListener('mousemove', onPointerOrKey);
      window.removeEventListener('touchstart', onPointerOrKey);
      window.removeEventListener('keydown', onPointerOrKey);
    };
  }, [bumpHud]);

  const goPrev = useCallback(() => {
    if (slides.length <= 1) return;
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
    setElapsedMs(0);
  }, [slides.length]);

  const goNext = useCallback(() => {
    if (slides.length <= 1) return;
    setActiveIndex((prev) => (prev + 1) % slides.length);
    setElapsedMs(0);
  }, [slides.length]);

  const selectSlide = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= slides.length) return;
      setActiveIndex(idx);
      setElapsedMs(0);
    },
    [slides.length]
  );

  // Auto-advance timer & preload next slide's curve ~4s before transition
  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const totalMs = intervalSec * 1000;
    const tickMs = 250;
    let preloadedIndex = -1;

    const timer = setInterval(() => {
      setElapsedMs((prev) => {
        const nextElapsed = prev + tickMs;
        if (totalMs - nextElapsed <= 4_000) {
          const nextIdx = (activeIndex + 1) % slides.length;
          if (preloadedIndex !== nextIdx && slides[nextIdx]) {
            preloadedIndex = nextIdx;
            void loadScopedHistory(slides[nextIdx].scope, getManilaToday(), false);
          }
        }
        if (nextElapsed >= totalMs) {
          setActiveIndex((cur) => (cur + 1) % slides.length);
          return 0;
        }
        return nextElapsed;
      });
    }, tickMs);

    return () => clearInterval(timer);
  }, [paused, intervalSec, slides, activeIndex]);

  // Announce slide change after initial load for screen readers
  useEffect(() => {
    const current = slides[activeIndex];
    if (!current) return;
    if (!didMountSlideRef.current) {
      didMountSlideRef.current = true;
      return;
    }
    setAnnouncement(`Slide ${activeIndex + 1} of ${slides.length}: ${current.title}`);
  }, [activeIndex, slides]);

  // Keyboard shortcuts preserving native control behavior on buttons/links/inputs
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === ' ') {
        if (tag === 'button' || tag === 'a') return;
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        void toggleFullscreen();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goPrev, goNext, toggleFullscreen]);

  const currentSlide = slides[activeIndex] || null;
  const shift = SHIFT_OFFSETS[shiftIndex];
  const progressRatio = slides.length <= 1 ? 1 : elapsedMs / (intervalSec * 1000);

  const fallbackHeadline = useMemo(() => {
    const overview = slides.find((s) => s.kind === 'overview');
    if (!overview || overview.kind !== 'overview') {
      return 'Awaiting live DeyeCloud station telemetry';
    }
    if (overview.faultCount > 0) {
      return `ALERT: ${overview.faultCount} inverter fault · Solar ${overview.liveSolarKw.toFixed(1)} kW`;
    }
    if (overview.offlineCount > 0) {
      return `Solar ${overview.liveSolarKw.toFixed(1)} kW · ${overview.offlineCount} inverter offline`;
    }
    return `Solar ${overview.liveSolarKw.toFixed(1)} kW · ${overview.dailyYieldKwh.toFixed(0)} kWh today · ₱${Math.round(overview.dailyYieldKwh * tariffRatePhp).toLocaleString('en-US')} saved`;
  }, [slides, tariffRatePhp]);

  return (
    <main
      className="tv-pixel-shift-surface relative min-h-screen w-full overflow-x-hidden bg-background text-foreground"
      style={{ translate: `${shift.x}px ${shift.y}px` }}
    >
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      {loading && slides.length === 0 ? (
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3 font-mono text-sm text-muted-foreground">
            <Tv size={36} className="text-primary animate-pulse" aria-hidden="true" />
            <span>Loading TV telemetry…</span>
          </div>
        </div>
      ) : !currentSlide ? (
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle size={34} className="text-amber-500" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground">No Authorized Stations</h1>
          </div>
        </div>
      ) : (
        <section
          aria-roledescription="carousel"
          aria-label="Solar telemetry slideshow"
          className="min-h-screen flex flex-col"
        >
          <TvSlideDeck
            slide={currentSlide}
            slideIndex={activeIndex}
            totalSlides={slides.length}
            tariffRatePhp={tariffRatePhp}
            tariffLabel={tariffLabel}
            weeklySeries={weeklySeries}
          />
        </section>
      )}

      <TvHudBar
        slides={slides}
        activeIndex={activeIndex}
        paused={paused}
        intervalSec={intervalSec}
        progressRatio={progressRatio}
        hudVisible={hudVisible}
        isFullscreen={isFullscreen}
        isStale={isStale}
        manilaClock={manilaClock}
        headline={brief?.headline || fallbackHeadline}
        severity={brief?.severity || 'normal'}
        onPrev={goPrev}
        onNext={goNext}
        onSelectSlide={selectSlide}
        onTogglePause={() => setPaused((p) => !p)}
        onChangeInterval={(sec) => {
          setIntervalSec(sec);
          setElapsedMs(0);
        }}
        onToggleFullscreen={toggleFullscreen}
      />
    </main>
  );
}
