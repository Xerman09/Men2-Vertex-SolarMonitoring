import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoleProvider } from '@/lib/role-context';
import { TrigonometricHistoryGraph } from '../TrigonometricHistoryGraph';
import { renderNowReferenceLabel } from '../GraphTooltip';
import { HourlySolarPoint } from '@/lib/trigonometric-math';

describe('TrigonometricHistoryGraph Component & Architecture', () => {
  const samplePoints: HourlySolarPoint[] = [
    {
      hour: '06:00',
      hourDecimal: 6.0,
      solarYieldKw: 5.2,
      loadDemandKw: 12.0,
      batteryFlowKw: 2.1,
      gridExportKw: -4.7,
      isElapsed: true,
    },
    {
      hour: '12:00',
      hourDecimal: 12.0,
      solarYieldKw: 85.5,
      loadDemandKw: 35.0,
      batteryFlowKw: 15.0,
      gridExportKw: 35.5,
      isElapsed: true,
    },
    {
      hour: '18:00',
      hourDecimal: 18.0,
      solarYieldKw: 8.0,
      loadDemandKw: 25.0,
      batteryFlowKw: -10.0,
      gridExportKw: -7.0,
      isElapsed: true,
    },
  ];

  it('renders correctly with default mock data and initial controls', () => {
    const html = renderToStaticMarkup(
      <RoleProvider>
        <TrigonometricHistoryGraph installedCapacityKw={120} />
      </RoleProvider>
    );

    // Verify header controls render
    expect(html).toContain('5-Minute Telemetry &amp; Power Curves');
    expect(html).toContain('Power Curves');
    expect(html).toContain('Self-Consumption');
    expect(html).not.toContain('Diurnal Fit');
    expect(html).not.toContain('Fourier');
    expect(html).not.toContain('Polar Radar');
    expect(html).not.toContain('3-Phase AC');
    // Verify resolution buttons
    expect(html).toContain('5m');
    expect(html).toContain('15m');
    expect(html).toContain('1h');
  });

  it('renders with supplied hourly points in compact mode', () => {
    const html = renderToStaticMarkup(
      <RoleProvider>
        <TrigonometricHistoryGraph
          data={samplePoints}
          installedCapacityKw={100}
          compact={true}
        />
      </RoleProvider>
    );

    expect(html).toBeDefined();
    expect(html).toContain('PV Power');
    expect(html).toContain('Load');
    expect(html).toContain('Grid Flow');
    expect(html).toContain('Battery');
  });

  it('renders all telemetry power sub-view controls without style line/area option', () => {
    const html = renderToStaticMarkup(
      <RoleProvider>
        <TrigonometricHistoryGraph
          data={samplePoints}
          installedCapacityKw={150}
        />
      </RoleProvider>
    );

    expect(html).toContain('Combined');
    expect(html).toContain('PV');
    expect(html).toContain('Load');
    expect(html).toContain('Grid');
    expect(html).not.toContain('Style:');
    expect(html).not.toContain('Line');
  });

  it('renders live KPI badges with computed metrics when 5-minute telemetry is supplied', () => {
    const html = renderToStaticMarkup(
      <RoleProvider>
        <TrigonometricHistoryGraph
          data={samplePoints}
          installedCapacityKw={120}
        />
      </RoleProvider>
    );

    expect(html).toContain('PV Power');
    expect(html).toContain('Load (');
    expect(html).toContain('Grid Flow (');
    expect(html).toContain('Self-Consumption');
  });

  describe('renderNowReferenceLabel non-clipping behavior', () => {
    it('renders label with safe top margin and centered anchor in normal range', () => {
      const LabelComp = renderNowReferenceLabel('● Now', '#94a3b8');
      const html = renderToStaticMarkup(<LabelComp viewBox={{ x: 250, y: 24, width: 600, height: 200 }} />);

      expect(html).toContain('● Now');
      expect(html).toContain('text-anchor="middle"');
      expect(html).toContain('y="17"');
      expect(html).toContain('x="250"');
    });

    it('avoids left clipping when reference line is near left boundary', () => {
      const LabelComp = renderNowReferenceLabel('● Now', '#94a3b8');
      const html = renderToStaticMarkup(<LabelComp viewBox={{ x: 10, y: 24, width: 600, height: 200 }} />);

      expect(html).toContain('text-anchor="start"');
      expect(html).toContain('x="14"');
    });

    it('avoids right clipping when reference line is near right boundary', () => {
      const LabelComp = renderNowReferenceLabel('● Now', '#94a3b8');
      const html = renderToStaticMarkup(<LabelComp viewBox={{ x: 580, y: 24, width: 600, height: 200 }} />);

      expect(html).toContain('text-anchor="end"');
      expect(html).toContain('x="576"');
    });

    it('returns null if viewBox or viewBox.x is missing', () => {
      const LabelComp = renderNowReferenceLabel('● Now', '#94a3b8');
      expect(renderToStaticMarkup(<LabelComp viewBox={undefined} />)).toBe('');
      expect(renderToStaticMarkup(<LabelComp viewBox={{ y: 24 }} />)).toBe('');
    });
  });
});

