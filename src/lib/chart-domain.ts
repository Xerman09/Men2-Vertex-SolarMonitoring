/**
 * Shared signed Y-axis domain helpers for telemetry SVG curves and Recharts panels.
 *
 * Ensures charts render negative power/energy readings smoothly below zero while keeping
 * `0` as the bottom baseline whenever all observed telemetry points are non-negative.
 */

export interface SignedYAxisBounds {
  min: number;
  max: number;
}

/** Formats signed kW axis labels cleanly without producing `-0`. */
export function formatSignedKwLabel(val: number): string {
  const safe = Number.isFinite(val) ? (Math.abs(val) < 1e-6 ? 0 : val) : 0;
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);

  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}M`;
  }
  if (abs >= 100) {
    return `${sign}${Math.round(abs)}`;
  }
  if (abs % 1 === 0) {
    return `${sign}${abs}`;
  }
  return `${sign}${abs.toFixed(1)}`;
}

/**
 * Computes `[min, max]` bounds for a cartesian plot.
 * - `max` is at least `minCeiling` with `headroomPct` headroom above the largest positive value.
 * - `min` stays `0` when all finite inputs are >= 0, or drops below `Math.min(...values)` with headroom when any value is negative.
 */
export function computeSignedYAxisBounds(
  values: number[],
  minCeiling: number = 10,
  headroomPct: number = 0.1
): SignedYAxisBounds {
  const safeCeiling = Number.isFinite(minCeiling) && minCeiling > 0 ? minCeiling : 10;
  let peakPos = 0;
  let minNeg = 0;

  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v > peakPos) peakPos = v;
    if (v < minNeg) minNeg = v;
  }

  const maxCandidate = Math.max(safeCeiling, peakPos * (1 + headroomPct));
  const max = Math.max(safeCeiling, Math.ceil(maxCandidate));

  if (minNeg < 0) {
    const rawMin = minNeg * (1 + headroomPct);
    const min = Math.min(-1, Math.floor(rawMin));
    return { min, max };
  }

  return { min: 0, max };
}

/** Maps a data value inside `[min, max]` to an SVG Y coordinate inside `[paddingY, paddingY + plotHeight]`. */
export function valueToSvgY(
  value: number,
  min: number,
  max: number,
  paddingY: number,
  plotHeight: number
): number {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) {
    return paddingY + plotHeight;
  }
  const safeVal = Number.isFinite(value) ? value : 0;
  const clamped = Math.max(min, Math.min(max, safeVal));
  const ratio = (clamped - min) / span;
  const y = paddingY + plotHeight - ratio * plotHeight;
  return Math.max(paddingY, Math.min(paddingY + plotHeight, y));
}

/** Recharts YAxis lower-bound callback that preserves `0` for non-negative series and adds 15% headroom below negative minima. */
export function rechartsSignedMin(dataMin: number): number {
  if (!Number.isFinite(dataMin) || dataMin >= 0) return 0;
  return Math.min(-1, Math.floor(dataMin * 1.15));
}

/** Returns a Recharts bipolar lower-bound resolver bounded at or below `floorMin`. */
export function rechartsBipolarMin(floorMin: number): (dataMin: number) => number {
  return (dataMin: number) => {
    if (!Number.isFinite(dataMin)) return floorMin;
    const padded = dataMin < 0 ? Math.floor(dataMin * 1.15) : floorMin;
    return Math.min(floorMin, padded);
  };
}

/** Returns a Recharts bipolar upper-bound resolver bounded at or above `ceilMax`. */
export function rechartsBipolarMax(ceilMax: number): (dataMax: number) => number {
  return (dataMax: number) => {
    if (!Number.isFinite(dataMax)) return ceilMax;
    const padded = dataMax > 0 ? Math.ceil(dataMax * 1.15) : ceilMax;
    return Math.max(ceilMax, padded);
  };
}
