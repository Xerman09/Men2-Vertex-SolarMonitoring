import { describe, expect, it } from 'vitest';
import {
  computeSignedYAxisBounds,
  formatSignedKwLabel,
  rechartsBipolarMax,
  rechartsBipolarMin,
  rechartsSignedMin,
  valueToSvgY,
} from '@/lib/chart-domain';

describe('chart-domain signed Y-axis utilities', () => {
  it('keeps min=0 when all values are non-negative', () => {
    const bounds = computeSignedYAxisBounds([0, 12.4, 48.2], 50, 0.1);
    expect(bounds.min).toBe(0);
    expect(bounds.max).toBe(54);
  });

  it('expands min below zero with headroom when negative readings appear', () => {
    const bounds = computeSignedYAxisBounds([35, -18.4, 2.1], 50, 0.1);
    expect(bounds.min).toBe(-21);
    expect(bounds.max).toBe(50);

    const smallNeg = computeSignedYAxisBounds([5, -0.2], 10, 0.1);
    expect(smallNeg.min).toBe(-1);
    expect(smallNeg.max).toBe(10);
  });

  it('maps positive, zero, and negative values linearly within the SVG plot box', () => {
    const paddingY = 4;
    const plotHeight = 52;
    const yMax = valueToSvgY(50, -50, 50, paddingY, plotHeight);
    const yZero = valueToSvgY(0, -50, 50, paddingY, plotHeight);
    const yMin = valueToSvgY(-50, -50, 50, paddingY, plotHeight);

    expect(yMax).toBe(paddingY);
    expect(yZero).toBe(paddingY + plotHeight / 2);
    expect(yMin).toBe(paddingY + plotHeight);
  });

  it('formats signed axis labels without -0 artifacts', () => {
    expect(formatSignedKwLabel(-0)).toBe('0');
    expect(formatSignedKwLabel(-0.0000001)).toBe('0');
    expect(formatSignedKwLabel(-12)).toBe('-12');
    expect(formatSignedKwLabel(-4.25)).toBe('-4.3');
    expect(formatSignedKwLabel(-1500)).toBe('-1.5M');
    expect(formatSignedKwLabel(1200)).toBe('1.2M');
  });

  it('computes Recharts signed and bipolar domain bounds safely', () => {
    expect(rechartsSignedMin(5)).toBe(0);
    expect(rechartsSignedMin(0)).toBe(0);
    expect(rechartsSignedMin(-20)).toBe(-23);
    expect(rechartsSignedMin(-0.1)).toBe(-1);

    const minFn = rechartsBipolarMin(-35);
    const maxFn = rechartsBipolarMax(35);
    expect(minFn(-10)).toBe(-35);
    expect(minFn(-50)).toBe(-58);
    expect(maxFn(10)).toBe(35);
    expect(maxFn(60)).toBe(69);
  });
});
