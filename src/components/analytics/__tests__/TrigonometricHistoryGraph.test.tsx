import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoleProvider } from '@/lib/role-context';
import { TrigonometricHistoryGraph } from '../TrigonometricHistoryGraph';
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
    expect(html).toContain('Diurnal Fit');
    expect(html).toContain('Fourier');
    expect(html).toContain('Polar Radar');
    expect(html).toContain('3-Phase AC');
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

  it('renders all telemetry power sub-view controls and style options', () => {
    const html = renderToStaticMarkup(
      <RoleProvider>
        <TrigonometricHistoryGraph
          data={samplePoints}
          installedCapacityKw={150}
        />
      </RoleProvider>
    );

    expect(html).toContain('Combined');
    expect(html).toContain('PV (Green)');
    expect(html).toContain('Load (Yellow)');
    expect(html).toContain('Grid (Purple)');
    expect(html).toContain('Style:');
    expect(html).toContain('Line');
    expect(html).toContain('Area');
  });
});
