'use client';

import React from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Maximize2,
  Minimize2,
  X,
  AlertTriangle,
  Radio,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { TvBriefSeverity } from '@/lib/gemini-tv-brief';
import type { TvSlide } from '../types';

export const TV_INTERVAL_OPTIONS_SEC = [15, 30, 60] as const;
export type TvIntervalSeconds = (typeof TV_INTERVAL_OPTIONS_SEC)[number];
export const DEFAULT_TV_INTERVAL_SEC: TvIntervalSeconds = 15;

export interface TvScopeAccountOption {
  id: string;
  name: string;
}

export interface TvScopeStationOption {
  stationId: string;
  stationName: string;
  accountId: string;
}

interface TvHudBarProps {
  slides: TvSlide[];
  activeIndex: number;
  paused: boolean;
  intervalSec: TvIntervalSeconds;
  progressRatio: number;
  hudVisible: boolean;
  isFullscreen: boolean;
  isStale: boolean;
  manilaClock: string;
  headline: string;
  severity: TvBriefSeverity;
  scopeAccountOptions?: TvScopeAccountOption[];
  scopeStationOptions?: TvScopeStationOption[];
  selectedAccountId?: string;
  selectedStationId?: string;
  onSelectAccount?: (accountId: string) => void;
  onSelectStation?: (stationId: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectSlide: (idx: number) => void;
  onTogglePause: () => void;
  onChangeInterval: (sec: TvIntervalSeconds) => void;
  onToggleFullscreen: () => void;
}

export function TvHudBar({
  slides,
  activeIndex,
  paused,
  intervalSec,
  progressRatio,
  hudVisible,
  isFullscreen,
  isStale,
  manilaClock,
  headline,
  severity,
  scopeAccountOptions = [],
  scopeStationOptions = [],
  selectedAccountId = 'ALL',
  selectedStationId = 'ALL',
  onSelectAccount,
  onSelectStation,
  onPrev,
  onNext,
  onSelectSlide,
  onTogglePause,
  onChangeInterval,
  onToggleFullscreen,
}: TvHudBarProps) {
  const showOverlay = hudVisible || paused;
  const showAccountFilter = scopeAccountOptions.length > 1 && Boolean(onSelectAccount);
  const showStationFilter = scopeStationOptions.length > 1 && Boolean(onSelectStation);

  const tickerAccent =
    severity === 'critical'
      ? 'text-rose-400'
      : severity === 'warning'
        ? 'text-amber-400'
        : 'text-emerald-400';

  return (
    <>
      {/* Auto-hiding top-right TV control dock (always keyboard-reachable via focus-within) */}
      <div
        className={`tv-hud-fade fixed top-4 right-4 z-40 flex flex-wrap items-center justify-end gap-1.5 rounded-2xl border border-border/80 bg-card/90 px-2.5 py-1.5 shadow-xl backdrop-blur-md focus-within:opacity-100 focus-within:translate-y-0 max-w-[calc(100vw-2rem)] ${
          showOverlay
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-1.5 pointer-events-none focus-within:pointer-events-auto'
        }`}
      >
        {(showAccountFilter || showStationFilter) && (
          <>
            <div className="flex items-center gap-1.5" role="group" aria-label="Scope filter">
              {showAccountFilter && (
                <select
                  aria-label="Filter TV by account"
                  value={selectedAccountId}
                  onChange={(e) => onSelectAccount?.(e.target.value)}
                  className="min-h-[30px] max-w-[160px] rounded-lg border border-border/70 bg-background/80 px-2 text-[11px] font-mono font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-ring cursor-pointer"
                >
                  <option value="ALL">All Accounts</option>
                  {scopeAccountOptions.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              )}
              {showStationFilter && (
                <select
                  aria-label="Filter TV by station"
                  value={selectedStationId}
                  onChange={(e) => onSelectStation?.(e.target.value)}
                  className="min-h-[30px] max-w-[170px] rounded-lg border border-border/70 bg-background/80 px-2 text-[11px] font-mono font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-ring cursor-pointer"
                >
                  <option value="ALL">All Stations</option>
                  {scopeStationOptions.map((st) => (
                    <option key={`${st.accountId}:${st.stationId}`} value={st.stationId}>
                      {st.stationName}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="h-5 w-px bg-border/70 mx-0.5" aria-hidden="true" />
          </>
        )}

        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous slide"
          className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-xl text-foreground hover:bg-muted transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-ring touch-manipulation"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onTogglePause}
          aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}
          className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center gap-1 rounded-xl px-2.5 text-xs font-mono font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-ring touch-manipulation"
        >
          {paused ? (
            <>
              <Play size={14} aria-hidden="true" />
              <span>Play</span>
            </>
          ) : (
            <>
              <Pause size={14} aria-hidden="true" />
              <span>Pause</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onNext}
          aria-label="Next slide"
          className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-xl text-foreground hover:bg-muted transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-ring touch-manipulation"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>

        <div className="h-5 w-px bg-border/70 mx-0.5" aria-hidden="true" />

        <div className="flex items-center gap-1" role="group" aria-label="Slide duration">
          {TV_INTERVAL_OPTIONS_SEC.map((sec) => {
            const active = intervalSec === sec;
            return (
              <button
                key={sec}
                type="button"
                onClick={() => onChangeInterval(sec)}
                aria-current={active ? 'true' : undefined}
                className={`min-h-[30px] min-w-[34px] px-2 rounded-lg text-[11px] font-mono font-semibold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-ring touch-manipulation ${
                  active
                    ? 'bg-primary text-primary-foreground border border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
                }`}
              >
                {sec}s
              </button>
            );
          })}
        </div>

        <div className="h-5 w-px bg-border/70 mx-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-xl text-foreground hover:bg-muted transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-ring touch-manipulation"
        >
          {isFullscreen ? (
            <Minimize2 size={16} aria-hidden="true" />
          ) : (
            <Maximize2 size={16} aria-hidden="true" />
          )}
        </button>

        <Link
          href="/fleet"
          aria-label="Exit TV Slideshow"
          className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center gap-1 rounded-xl px-2.5 text-xs font-mono font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-ring touch-manipulation"
        >
          <X size={15} aria-hidden="true" />
          <span>Exit</span>
        </Link>
      </div>

      {/* Persistent bottom ticker, markers & progress bar */}
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-card/88 backdrop-blur-md">
        <div className="h-[3px] w-full bg-muted/40 overflow-hidden" aria-hidden="true">
          <div
            className="tv-progress-fill h-full w-full origin-left bg-primary"
            style={{
              transform: `scaleX(${Math.max(0, Math.min(1, progressRatio))})`,
            }}
          />
        </div>

        <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-4 px-5 py-2.5">
          {/* Status Ticker */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {severity === 'critical' ? (
              <AlertTriangle size={16} className="text-rose-400 shrink-0" aria-hidden="true" />
            ) : (
              <Radio size={15} className={`${tickerAccent} shrink-0`} aria-hidden="true" />
            )}
            <p className="truncate font-mono text-xs sm:text-sm font-semibold text-foreground">
              {headline}
            </p>
            {isStale && (
              <Badge variant="warning" className="font-mono text-[10px] shrink-0">
                Stale
              </Badge>
            )}
          </div>

          {/* Slide Navigation Markers (non-color active distinction via shape + border, adaptive for dynamic decks) */}
          {slides.length > 1 && slides.length <= 12 && (
            <nav aria-label="Choose a slide" className="hidden md:flex items-center gap-1 shrink-0">
              {slides.map((s, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelectSlide(idx)}
                    aria-label={`Go to slide ${idx + 1}: ${s.title}`}
                    aria-current={isActive ? 'true' : undefined}
                    className="inline-flex min-h-[28px] min-w-[28px] items-center justify-center rounded-full cursor-pointer focus-visible:outline-2 focus-visible:outline-ring touch-manipulation"
                  >
                    <span
                      aria-hidden="true"
                      className={`block rounded-full transition-all ${
                        isActive
                          ? 'h-2.5 w-7 bg-primary border border-primary-foreground/50'
                          : 'h-2 w-2 bg-muted-foreground/45 hover:bg-muted-foreground/80 border border-transparent'
                      }`}
                    />
                  </button>
                );
              })}
            </nav>
          )}

          {slides.length > 12 && (
            <div className="hidden md:flex items-center shrink-0">
              <select
                aria-label="Choose a slide"
                value={activeIndex}
                onChange={(e) => onSelectSlide(Number(e.target.value))}
                className="min-h-[28px] max-w-[240px] rounded-lg border border-border/70 bg-background/80 px-2 text-xs font-mono font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-ring cursor-pointer"
              >
                {slides.map((s, idx) => (
                  <option key={s.id} value={idx}>
                    {idx + 1}. {s.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Slide Counter & Manila Clock */}
          <div className="flex items-center gap-3 font-mono text-xs sm:text-sm tabular-nums shrink-0 text-muted-foreground">
            <span>
              <strong className="text-foreground">{activeIndex + 1}</strong> / {slides.length}
            </span>
            <span className="h-3.5 w-px bg-border/60" aria-hidden="true" />
            <time className="font-semibold text-foreground">{manilaClock}</time>
          </div>
        </div>
      </footer>
    </>
  );
}
