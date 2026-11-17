'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tv, AlertTriangle } from 'lucide-react';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import { useTariff } from '@/lib/tariff-context';
import { getManilaNowParts, getManilaToday } from '@/lib/manila-time';
import { loadScopedHistory, type HistoryScope } from '@/app/fleet/components/useScopedHistory';
import type { DailyAnalyticsPoint } from '@/lib/analytics-data';
import type { TvBriefResult } from '@/lib/gemini-tv-brief';
import type { AggregatedFleetSummary } from '@/lib/types';
import {
  DEFAULT_TV_INTERVAL_SEC,
  TvHudBar,
  type TvIntervalSeconds,
  type TvScopeAccountOption,
  type TvScopeStationOption,
} from './components/TvHudBar';
import { TvSlideDeck } from './components/TvSlideDeck';
import {
  buildTvSlides,
  filterTvAuthorizedAccounts,
  getSlideTickerCommentary,
  getTvScopeKey,
} from './types';

const AGGREGATE_POLL_MS = 30_000;
const BRIEF_POLL_MS = 5 * 60_000;
const WEEKLY_SERIES_TTL_MS = 5 * 60_000;
const HUD_IDLE_HIDE_MS = 3_000;
const PIXEL_SHIFT_INTERVAL_MS = 10 * 60_000;

const SHIFT_OFFSETS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 2, y: 1 },
  { x: 1, y: -2 },
  { x: -2, y: -1 },
  { x: -1, y: 2 },
];

interface WeeklyCacheEntry {
  series: DailyAnalyticsPoint[] | null;
  ts: number;
}

export default function TvSlideshowPage() {
  const { accounts: contextAccounts } = useAccount();
  const { isAdmin, isConsumer, user, isInitialized } = useRole();
  const { activeTariff } = useTariff();

  const [aggregate, setAggregate] = useState<AggregatedFleetSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [brief, setBrief] = useState<TvBriefResult | null>(null);

  const [filterAccountId, setFilterAccountId] = useState<string>('ALL');
  const [filterStationId, setFilterStationId] = useState<string>('ALL');

  const [weeklyByScope, setWeeklyByScope] = useState<Record<string, WeeklyCacheEntry>>({});
  const [weeklyLoadingKeys, setWeeklyLoadingKeys] = useState<Record<string, boolean>>({});
  const weeklyCacheRef = useRef<Record<string, WeeklyCacheEntry>>({});
  const weeklyInFlightRef = useRef<Map<string, Promise<void>>>(new Map());

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [slideDirection, setSlideDirection] = useState<'forward' | 'backward'>('forward');
  const [paused, setPaused] = useState<boolean>(false);
  const [intervalSec, setIntervalSec] = useState<TvIntervalSeconds>(DEFAULT_TV_INTERVAL_SEC);
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

  // Read optional initial URL scope (?accountId=...&stationId=...) safely client-side
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const accParam = params.get('accountId')?.trim();
    const staParam = params.get('stationId')?.trim();
    if (accParam && accParam !== 'ALL') setFilterAccountId(accParam);
    if (staParam && staParam !== 'ALL') setFilterStationId(staParam);
  }, []);

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

  // Dynamic Account & Station options for HUD scope filtering (respecting tenant isolation)
  const scopeAccountOptions: TvScopeAccountOption[] = useMemo(
    () =>
      authorizedAccounts.map((acc) => ({
        id: acc.id,
        name: acc.name || acc.id,
      })),
    [authorizedAccounts]
  );

  const scopeStationOptions: TvScopeStationOption[] = useMemo(() => {
    const targetAccs =
      filterAccountId !== 'ALL'
        ? authorizedAccounts.filter((a) => a.id === filterAccountId)
        : authorizedAccounts;

    const list: TvScopeStationOption[] = [];
    for (const acc of targetAccs) {
      for (const plant of acc.plants || []) {
        list.push({
          stationId: String(plant.stationId),
          stationName: plant.stationName || `Station ${plant.stationId}`,
          accountId: acc.id,
        });
      }
    }
    return list;
  }, [authorizedAccounts, filterAccountId]);

  const slides = useMemo(
    () =>
      buildTvSlides(authorizedAccounts, aggregate?.nodes || [], {
        isConsumer,
        priorityStationId: brief?.priorityStationId,
        filterAccountId: filterAccountId !== 'ALL' ? filterAccountId : null,
        filterStationId: filterStationId !== 'ALL' ? filterStationId : null,
      }),
    [
      authorizedAccounts,
      aggregate?.nodes,
      isConsumer,
      brief?.priorityStationId,
      filterAccountId,
      filterStationId,
    ]
  );

  // Clamp activeIndex if slides count changes (e.g. scope filter or triage slide changes)
  useEffect(() => {
    if (slides.length > 0 && activeIndex >= slides.length) {
      setActiveIndex(0);
      setElapsedMs(0);
    }
  }, [slides.length, activeIndex]);

  // Fetch Gemini 3.5 grounded TV ticker brief every 5m scoped to selected Account/Station
  const effectiveBriefAccountId =
    filterAccountId !== 'ALL'
      ? filterAccountId
      : isConsumer && authorizedAccounts[0]
        ? authorizedAccounts[0].id
        : undefined;
  const effectiveBriefStationId =
    filterStationId !== 'ALL' ? filterStationId : undefined;

  const fetchBrief = useCallback(async () => {
    if (!isInitialized || !user) return;
    try {
      const qs = new URLSearchParams({ tariffRate: String(tariffRatePhp) });
      if (effectiveBriefAccountId) qs.set('accountId', effectiveBriefAccountId);
      if (effectiveBriefStationId) qs.set('stationId', effectiveBriefStationId);
      const res = await fetch(`/api/tv/brief?${qs.toString()}`);
      if (!res.ok) return;
      const json = (await res.json()) as TvBriefResult;
      if (json.headline) setBrief(json);
    } catch {
      // Retain previous brief or deterministic local summary
    }
  }, [
    isInitialized,
    user,
    tariffRatePhp,
    effectiveBriefAccountId,
    effectiveBriefStationId,
  ]);

  useEffect(() => {
    void fetchBrief();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetchBrief();
    }, BRIEF_POLL_MS);
    return () => clearInterval(timer);
  }, [fetchBrief]);

  // Dynamically load & cache real 7D harvest series per scope (Fleet, Account, or Station)
  const ensureWeeklySeriesForScope = useCallback(
    (scope: HistoryScope, force = false) => {
      if (!isInitialized || !user) return;
      const key = getTvScopeKey(scope);
      const cached = weeklyCacheRef.current[key];
      if (!force && cached && Date.now() - cached.ts < WEEKLY_SERIES_TTL_MS) {
        return;
      }
      if (weeklyInFlightRef.current.has(key)) return;

      setWeeklyLoadingKeys((prev) => ({ ...prev, [key]: true }));
      const qs = new URLSearchParams({
        range: 'WEEK',
        step: '5',
        part: 'period',
        date: getManilaToday(),
      });
      if (scope.accountId && scope.accountId !== 'ALL') {
        qs.set('accountId', scope.accountId);
      }
      if (scope.stationId && scope.stationId !== 'ALL') {
        qs.set('station_id', scope.stationId);
      }

      const promise = fetch(`/api/deye/history?${qs.toString()}`)
        .then(async (res) => {
          if (!res.ok) return;
          const json = (await res.json()) as { dailySeries?: DailyAnalyticsPoint[] | null };
          const nextSeries =
            Array.isArray(json.dailySeries) && json.dailySeries.length > 0
              ? json.dailySeries
              : null;
          const entry: WeeklyCacheEntry = { series: nextSeries, ts: Date.now() };
          weeklyCacheRef.current[key] = entry;
          setWeeklyByScope((prev) => ({ ...prev, [key]: entry }));
        })
        .catch(() => {
          // Retain last verified weekly series for this scope
        })
        .finally(() => {
          weeklyInFlightRef.current.delete(key);
          setWeeklyLoadingKeys((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          });
        });

      weeklyInFlightRef.current.set(key, promise);
    },
    [isInitialized, user]
  );

  // Trigger weekly analytics load when displaying any financial slide
  const currentSlide = slides[activeIndex] || null;
  useEffect(() => {
    if (!currentSlide || currentSlide.kind !== 'financial') return;
    ensureWeeklySeriesForScope(currentSlide.scope);
  }, [currentSlide, ensureWeeklySeriesForScope]);

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

  const updateUrlScope = useCallback((nextAcc: string, nextSta: string) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (nextAcc && nextAcc !== 'ALL') {
      params.set('accountId', nextAcc);
    } else {
      params.delete('accountId');
    }
    if (nextSta && nextSta !== 'ALL') {
      params.set('stationId', nextSta);
    } else {
      params.delete('stationId');
    }
    const qs = params.toString();
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    window.history.replaceState(null, '', nextUrl);
  }, []);

  const handleSelectAccount = useCallback(
    (nextAccountId: string) => {
      setFilterAccountId(nextAccountId);
      setFilterStationId('ALL');
      setSlideDirection('forward');
      setActiveIndex(0);
      setElapsedMs(0);
      updateUrlScope(nextAccountId, 'ALL');
    },
    [updateUrlScope]
  );

  const handleSelectStation = useCallback(
    (nextStationId: string) => {
      let nextAcc = filterAccountId;
      if (nextStationId !== 'ALL' && nextAcc === 'ALL') {
        const matchedStation = scopeStationOptions.find((s) => s.stationId === nextStationId);
        if (matchedStation) {
          nextAcc = matchedStation.accountId;
          setFilterAccountId(nextAcc);
        }
      }
      setFilterStationId(nextStationId);
      setSlideDirection('forward');
      setActiveIndex(0);
      setElapsedMs(0);
      updateUrlScope(nextAcc, nextStationId);
    },
    [filterAccountId, scopeStationOptions, updateUrlScope]
  );

  const goPrev = useCallback(() => {
    if (slides.length <= 1) return;
    setSlideDirection('backward');
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
    setElapsedMs(0);
  }, [slides.length]);

  const goNext = useCallback(() => {
    if (slides.length <= 1) return;
    setSlideDirection('forward');
    setActiveIndex((prev) => (prev + 1) % slides.length);
    setElapsedMs(0);
  }, [slides.length]);

  const selectSlide = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= slides.length) return;
      setSlideDirection(idx >= activeIndex ? 'forward' : 'backward');
      setActiveIndex(idx);
      setElapsedMs(0);
    },
    [slides.length, activeIndex]
  );

  // Auto-advance timer & preload next slide's curve/7D series ~4s before transition
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
            const nextSlide = slides[nextIdx];
            if (nextSlide.kind === 'financial') {
              ensureWeeklySeriesForScope(nextSlide.scope);
            } else {
              void loadScopedHistory(nextSlide.scope, getManilaToday(), false);
            }
          }
        }
        if (nextElapsed >= totalMs) {
          setSlideDirection('forward');
          setActiveIndex((cur) => (cur + 1) % slides.length);
          return 0;
        }
        return nextElapsed;
      });
    }, tickMs);

    return () => clearInterval(timer);
  }, [paused, intervalSec, slides, activeIndex, ensureWeeklySeriesForScope]);

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

  const currentScopeKey = currentSlide ? getTvScopeKey(currentSlide.scope) : 'FLEET';
  const currentWeeklySeries = weeklyByScope[currentScopeKey]?.series ?? null;
  const currentWeeklyLoading = Boolean(weeklyLoadingKeys[currentScopeKey]);

  const shift = SHIFT_OFFSETS[shiftIndex];
  const progressRatio = slides.length <= 1 ? 1 : elapsedMs / (intervalSec * 1000);

  const ticker = useMemo(
    () => getSlideTickerCommentary(currentSlide, tariffRatePhp, currentWeeklySeries, brief),
    [currentSlide, tariffRatePhp, currentWeeklySeries, brief]
  );

  return (
    <main
      className="tv-stage-atmosphere tv-pixel-shift-surface relative flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground"
      style={{ translate: `${shift.x}px ${shift.y}px` }}
    >
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      {loading && slides.length === 0 ? (
        <div className="flex flex-1 min-h-0 items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3 font-mono text-sm text-muted-foreground">
            <Tv size={36} className="text-primary animate-pulse" aria-hidden="true" />
            <span>Loading TV telemetry…</span>
          </div>
        </div>
      ) : !currentSlide ? (
        <div className="flex flex-1 min-h-0 items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle size={34} className="text-amber-500" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground">No Authorized Stations</h1>
          </div>
        </div>
      ) : (
        <section
          aria-roledescription="carousel"
          aria-label="Solar telemetry slideshow"
          className="flex flex-1 min-h-0 w-full"
        >
          <TvSlideDeck
            key={currentSlide.id}
            slide={currentSlide}
            slideIndex={activeIndex}
            totalSlides={slides.length}
            direction={slideDirection}
            tariffRatePhp={tariffRatePhp}
            tariffLabel={tariffLabel}
            weeklySeries={currentWeeklySeries}
            weeklyLoading={currentWeeklyLoading}
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
        headline={ticker.headline}
        severity={ticker.severity}
        scopeAccountOptions={scopeAccountOptions}
        scopeStationOptions={scopeStationOptions}
        selectedAccountId={filterAccountId}
        selectedStationId={filterStationId}
        onSelectAccount={handleSelectAccount}
        onSelectStation={handleSelectStation}
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
