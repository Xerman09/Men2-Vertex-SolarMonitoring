'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  Sun,
  TrendingUp,
  Sliders,
  Send,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HoverInfo } from '@/components/ui/tooltip';
import type {
  AnalyticsFindingCategory,
  AnalyticsInsightsResult,
  AnalyticsTariffInput,
} from '@/lib/gemini-analytics';

interface AiAnalyticsPanelProps {
  accountId?: string;
  stationId?: string;
  deviceSn?: string;
  range: 'TODAY' | 'WEEK' | 'MONTH' | 'YEAR';
  date: string;
  startDate?: string;
  endDate?: string;
  historyIsLive: boolean;
  noLiveData: boolean;
  isPending: boolean;
  tariff: AnalyticsTariffInput;
}

function findingMeta(category: AnalyticsFindingCategory) {
  switch (category) {
    case 'economics':
      return {
        icon: TrendingUp,
        accent: 'text-emerald-400',
        border: 'border-emerald-500/30',
      };
    case 'action':
      return {
        icon: Sliders,
        accent: 'text-cyan-400',
        border: 'border-cyan-500/30',
      };
    default:
      return {
        icon: Sun,
        accent: 'text-amber-500',
        border: 'border-amber-500/30',
      };
  }
}

export function AiAnalyticsPanel({
  accountId,
  stationId,
  deviceSn,
  range,
  date,
  startDate,
  endDate,
  historyIsLive,
  noLiveData,
  isPending,
  tariff,
}: AiAnalyticsPanelProps) {
  const inputId = useId();
  const [insights, setInsights] = useState<AnalyticsInsightsResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [question, setQuestion] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  const runAnalysis = useCallback(
    async (opts: { force?: boolean; userQuestion?: string } = {}) => {
      if (!historyIsLive || noLiveData || isPending) return;

      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch('/api/analytics/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            accountId,
            stationId,
            deviceSn,
            range,
            date,
            startDate,
            endDate,
            force: Boolean(opts.force),
            question: opts.userQuestion?.trim() || undefined,
            tariff,
          }),
        });

        if (!res.ok) {
          const errJson = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errJson.error || `HTTP ${res.status}`);
        }

        const json = (await res.json()) as {
          isLive?: boolean;
          insights?: AnalyticsInsightsResult | null;
          notice?: string;
        };

        if (controller.signal.aborted) return;

        if (json.isLive && json.insights) {
          setInsights(json.insights);
        } else {
          setInsights(null);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setErrorMsg(err instanceof Error ? err.message : 'Unable to analyze telemetry');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [
      accountId,
      stationId,
      deviceSn,
      range,
      date,
      startDate,
      endDate,
      historyIsLive,
      noLiveData,
      isPending,
      tariff,
    ]
  );

  // Automatically load cached/fresh analysis when live scope telemetry settles
  useEffect(() => {
    if (!historyIsLive || noLiveData || isPending) {
      setInsights(null);
      return;
    }
    void runAnalysis({ force: false });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [runAnalysis, historyIsLive, noLiveData, isPending]);

  const handleAskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = question.trim();
    if (!clean || loading) return;
    void runAnalysis({ force: true, userQuestion: clean });
  };

  return (
    <Card className="border-border/70 shadow-sm overflow-hidden">
      <CardHeader className="py-3 px-4 border-b border-border/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <HoverInfo
              title="AI Telemetry Analysis"
              side="bottom"
              align="start"
              content={
                <div className="space-y-1 text-[11px] max-w-[260px]">
                  <p className="text-muted-foreground">
                    Structured performance, ₱ tariff arbitrage, and asset triage analysis powered by Gemini 3.5 Flash-Lite strictly grounded in live DeyeCloud telemetry.
                  </p>
                  {insights && (
                    <div className="pt-1 border-t border-border/50 font-mono text-[10px] flex justify-between gap-2">
                      <span className="text-muted-foreground">Engine</span>
                      <span className="font-semibold text-foreground">
                        {insights.source === 'gemini' ? insights.model : 'Deterministic fallback'}
                      </span>
                    </div>
                  )}
                </div>
              }
              showIcon
            >
              <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2 cursor-help">
                <Sparkles className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                <span>AI Telemetry Analysis</span>
              </CardTitle>
            </HoverInfo>

            {insights?.status === 'critical' && (
              <Badge variant="destructive" className="font-mono text-[10px]">
                Critical
              </Badge>
            )}
            {insights?.status === 'watch' && (
              <Badge variant="warning" className="font-mono text-[10px]">
                Watch
              </Badge>
            )}
          </div>

          <form
            onSubmit={handleAskSubmit}
            className="flex items-center gap-2 w-full lg:w-auto"
          >
            <label htmlFor={inputId} className="visually-hidden">
              Ask AI about this telemetry
            </label>
            <input
              id={inputId}
              type="text"
              maxLength={240}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={!historyIsLive || noLiveData || isPending}
              placeholder="Ask about yield, grid balance, or ₱ tariff..."
              className="h-8 flex-1 lg:w-72 rounded-lg border border-border/70 bg-background/70 px-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={!historyIsLive || noLiveData || isPending || loading || !question.trim()}
              className="h-8 px-2.5 text-xs font-mono gap-1 cursor-pointer shrink-0"
            >
              <Send className="w-3 h-3" aria-hidden="true" />
              <span>Ask</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Refresh AI analysis"
              onClick={() => void runAnalysis({ force: true, userQuestion: question.trim() || undefined })}
              disabled={!historyIsLive || noLiveData || isPending || loading}
              className="h-8 w-8 p-0 cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </Button>
          </form>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3" aria-live="polite">
        {isPending || (loading && !insights) ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-xl border border-border/40 bg-muted/30 animate-pulse"
              />
            ))}
          </div>
        ) : !historyIsLive || noLiveData ? (
          <div className="py-3 text-center text-xs font-mono text-muted-foreground">
            No live DeyeCloud telemetry to analyze for this selection
          </div>
        ) : errorMsg ? (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400 font-mono">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        ) : insights ? (
          <>
            <p className="text-xs sm:text-sm font-medium text-foreground leading-snug">
              {insights.summary}
            </p>

            {insights.answer && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
                {insights.answer}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {insights.findings.map((finding) => {
                const meta = findingMeta(finding.category);
                const Icon = meta.icon;
                return (
                  <div
                    key={finding.category}
                    className={`rounded-xl border ${meta.border} bg-muted/20 p-3 flex flex-col justify-between gap-1.5 min-w-0`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider font-mono text-muted-foreground truncate">
                        {finding.title}
                      </span>
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.accent}`} aria-hidden="true" />
                    </div>
                    <div className={`text-base font-bold font-mono tabular-nums truncate ${meta.accent}`}>
                      {finding.metric}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {finding.detail}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
