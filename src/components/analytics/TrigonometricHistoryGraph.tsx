'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { HourlySolarPoint } from '@/lib/trigonometric-math';
import { useTrigonometricGraph } from './useTrigonometricGraph';
import { GraphHeaderControls } from './graph/GraphHeaderControls';
import { PowerFlowChart } from './graph/PowerFlowChart';
import { SelfConsumptionChart } from './graph/SelfConsumptionChart';
import { AdvancedMathCharts } from './graph/AdvancedMathCharts';

export interface TrigonometricHistoryGraphProps {
  data?: HourlySolarPoint[];
  installedCapacityKw?: number;
  compact?: boolean;
}

export function TrigonometricHistoryGraph({
  data,
  installedCapacityKw = 120,
  compact = false,
}: TrigonometricHistoryGraphProps) {
  const graph = useTrigonometricGraph({
    data,
    installedCapacityKw,
  });

  return (
    <Card className={compact ? 'w-full border-border/40 bg-card/60 shadow-none' : 'w-full border-border/60 bg-card/80 shadow-xs'}>
      <GraphHeaderControls
        compact={compact}
        timeResolution={graph.timeResolution}
        isLiveStreaming={graph.isLiveStreaming}
        activeTab={graph.activeTab}
        onResolutionChange={graph.handleResolutionChange}
        onToggleStreaming={() => graph.setIsLiveStreaming(!graph.isLiveStreaming)}
        onManualTick={graph.handleManualTick}
        onTabChange={graph.setActiveTab}
      />

      <CardContent className={compact ? 'p-3 pt-2.5 space-y-3' : 'p-4 pt-3.5 space-y-4'}>
        {graph.activeTab === 'power' && (
          <PowerFlowChart
            compact={compact}
            powerSeriesData={graph.powerSeriesData}
            currentLivePoint={graph.currentLivePoint}
            peakPv={graph.peakPv}
            peakLoad={graph.peakLoad}
            powerSubView={graph.powerSubView}
            chartRenderMode={graph.chartRenderMode}
            timeResolution={graph.timeResolution}
            nowSlotStr={graph.nowSlotStr}
            nowExactTimeStr={graph.nowExactTimeStr}
            majorXTicks={graph.majorXTicks}
            combinedYDomain={graph.combinedYDomain}
            pvYDomain={graph.pvYDomain}
            consumptionYDomain={graph.consumptionYDomain}
            gridYDomain={graph.gridYDomain}
            onSubViewChange={graph.setPowerSubView}
            onRenderModeChange={graph.setChartRenderMode}
          />
        )}

        {graph.activeTab === 'selfconsumption' && (
          <SelfConsumptionChart
            compact={compact}
            selfConsumptionMetrics={graph.selfConsumptionMetrics}
            majorXTicks={graph.majorXTicks}
            nowSlotStr={graph.nowSlotStr}
          />
        )}

        {(graph.activeTab === 'sinusoidal' ||
          graph.activeTab === 'fourier' ||
          graph.activeTab === 'polar' ||
          graph.activeTab === 'waveform') && (
          <AdvancedMathCharts
            compact={compact}
            activeTab={graph.activeTab}
            timeResolution={graph.timeResolution}
            nowSlotStr={graph.nowSlotStr}
            majorXTicks={graph.majorXTicks}
            fitResults={graph.fitResults}
            fourierData={graph.fourierData}
            polarData={graph.polarData}
            acResults={graph.acResults}
            sinusoidalYDomain={graph.sinusoidalYDomain}
            fourierYDomain={graph.fourierYDomain}
            acVoltage={graph.acVoltage}
            acCurrent={graph.acCurrent}
            powerFactor={graph.powerFactor}
            onAcVoltageChange={graph.setAcVoltage}
            onAcCurrentChange={graph.setAcCurrent}
            onPowerFactorChange={graph.setPowerFactor}
          />
        )}
      </CardContent>
    </Card>
  );
}
