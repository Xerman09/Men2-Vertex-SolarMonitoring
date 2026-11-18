import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ANALYTICS_INSIGHTS_MODEL,
  _resetAnalyticsInsightsCacheForTesting,
  buildDeterministicAnalyticsInsights,
  extractAnalyticsTelemetryFacts,
  getCachedOrGenerateAnalyticsInsights,
} from '../gemini-analytics';
import { AiAnalyticsPanel } from '@/components/analytics/AiAnalyticsPanel';
import { computeAnalyticsSummary } from '../analytics-data';
import type { HourlyEnergyPoint } from '../types';

function makeSamplePoints(): HourlyEnergyPoint[] {
  const pts: HourlyEnergyPoint[] = [];
  for (let h = 0; h < 24; h += 1) {
    const isDay = h >= 6 && h <= 17;
    const solar = isDay ? Number((Math.sin(((h - 6) / 11) * Math.PI) * 80).toFixed(1)) : 0;
    const load = 22.0;
    pts.push({
      hour: `${String(h).padStart(2, '0')}:00`,
      hourDecimal: h,
      solarYieldKw: solar,
      loadDemandKw: load,
      batteryFlowKw: 0,
      gridFlowKw: Number((solar - load).toFixed(1)),
      gridExportKw: Math.max(0, Number((solar - load).toFixed(1))),
      tariffRateUsd: 13.9,
      tariffRatePhp: 13.9,
      isElapsed: h <= 16,
    });
  }
  return pts;
}

describe('Gemini 3.5 AI Telemetry Analytics Engine', () => {
  beforeEach(() => {
    _resetAnalyticsInsightsCacheForTesting();
  });

  it('extracts grounded peak, midday, and PHP tariff metrics without synthesizing missing data', () => {
    const points = makeSamplePoints();
    const summary = computeAnalyticsSummary(points, 120, false, { allowZeroYield: true });
    const facts = extractAnalyticsTelemetryFacts({
      cacheKey: 'acc-1:ALL:ALL:TODAY:2026-11-17',
      scopeLabel: 'Hanvin Solar (5 Plants)',
      range: 'TODAY',
      dateStr: '2026-11-17',
      capacityKw: 120,
      recordedFrames: 180,
      summary,
      points,
      tariff: {
        utilityName: 'DECORP',
        peakRatePhp: 13.9,
        offPeakRatePhp: 10.2,
        exportCreditPhp: 5.5,
        peakStartHour: 14,
        peakEndHour: 20,
      },
      faultCount: 0,
      offlineCount: 1,
    });

    expect(facts.peakSolarKw).toBeGreaterThan(70);
    expect(facts.peakSolarHour).toBeTruthy();
    expect(facts.estimatedSavingsPhp).toBeGreaterThan(0);
    expect(facts.offlineCount).toBe(1);
    expect(facts.tariff.utilityName).toBe('DECORP');
  });

  it('calls gemini-3.5-flash-lite with store=false, caches standard insights, and skips cache on Q&A', async () => {
    const points = makeSamplePoints();
    const summary = computeAnalyticsSummary(points, 120, false, { allowZeroYield: true });
    const facts = extractAnalyticsTelemetryFacts({
      cacheKey: 'acc-1:st-1:ALL:TODAY:2026-11-17',
      scopeLabel: 'La Salette School',
      range: 'TODAY',
      dateStr: '2026-11-17',
      capacityKw: 120,
      recordedFrames: 180,
      summary,
      points,
    });

    const createInteraction = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        summary: 'La Salette School peaked at 79.2 kW with ₱4,920 estimated daily savings.',
        status: 'optimal',
        findings: [
          {
            category: 'performance',
            title: 'Peak Generation',
            metric: '79.2 kW',
            detail: 'Midday array utilization stayed strong across 10:00–14:00.',
          },
          {
            category: 'economics',
            title: 'DECORP Savings',
            metric: '₱4,920 saved',
            detail: 'Daytime solar offset base demand and exported surplus cleanly.',
          },
          {
            category: 'action',
            title: 'Load Scheduling',
            metric: '64% self-used',
            detail: 'Shift chiller pre-cooling into 11:00–13:00 export window.',
          },
        ],
        answer: 'Peak solar output reached 79.2 kW during midday intervals.',
      }),
    });

    const first = await getCachedOrGenerateAnalyticsInsights(facts, {
      deps: { apiKey: 'test-key', createInteraction },
    });
    const second = await getCachedOrGenerateAnalyticsInsights(facts, {
      deps: { apiKey: 'test-key', createInteraction },
    });
    expect(createInteraction).toHaveBeenCalledTimes(1);
    expect(createInteraction.mock.calls[0][0].model).toBe(ANALYTICS_INSIGHTS_MODEL);
    expect(createInteraction.mock.calls[0][0].store).toBe(false);
    expect(first.source).toBe('gemini');
    expect(second.summary).toBe(first.summary);

    // Asking a custom question bypasses standard cache cleanly
    const qaRes = await getCachedOrGenerateAnalyticsInsights(facts, {
      question: 'When did output peak today?',
      deps: { apiKey: 'test-key', createInteraction },
    });
    expect(createInteraction).toHaveBeenCalledTimes(2);
    expect(qaRes.answer).toContain('79.2 kW');
  });

  it('falls back deterministically without key or on malformed output and renders clean empty UI state', async () => {
    const points = makeSamplePoints();
    const summary = computeAnalyticsSummary(points, 120, false, { allowZeroYield: true });
    const facts = extractAnalyticsTelemetryFacts({
      cacheKey: 'acc-1:empty:ALL:TODAY:2026-11-17',
      scopeLabel: 'Empty Scope',
      range: 'TODAY',
      dateStr: '2026-11-17',
      capacityKw: 120,
      recordedFrames: 100,
      summary,
      points,
      faultCount: 1,
    });

    const fallback = await getCachedOrGenerateAnalyticsInsights(facts, {
      question: 'What is faulted?',
      deps: { apiKey: '' },
    });
    expect(fallback.source).toBe('fallback');
    expect(fallback.status).toBe('critical');
    expect(fallback.findings).toHaveLength(3);
    expect(fallback.answer).toContain('₱');

    const directFallback = buildDeterministicAnalyticsInsights(facts);
    expect(directFallback.findings.map((f) => f.category)).toEqual([
      'performance',
      'economics',
      'action',
    ]);

    const emptyHtml = renderToStaticMarkup(
      React.createElement(AiAnalyticsPanel, {
        range: 'TODAY',
        date: '2026-11-17',
        historyIsLive: false,
        noLiveData: true,
        isPending: false,
        tariff: facts.tariff,
      })
    );
    expect(emptyHtml).toContain('No live DeyeCloud telemetry to analyze');
    expect(emptyHtml).toContain('AI Telemetry Analysis');

    // While telemetry fetch is still in flight (isPending=true), never show premature empty message
    const pendingHtml = renderToStaticMarkup(
      React.createElement(AiAnalyticsPanel, {
        range: 'TODAY',
        date: '2026-11-17',
        historyIsLive: false,
        noLiveData: true,
        isPending: true,
        tariff: facts.tariff,
      })
    );
    expect(pendingHtml).not.toContain('No live DeyeCloud telemetry');
    expect(pendingHtml).toContain('animate-pulse');
  });
});
