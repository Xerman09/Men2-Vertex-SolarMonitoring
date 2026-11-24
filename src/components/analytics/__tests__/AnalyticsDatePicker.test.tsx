import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import {
  toLocalIsoDate,
  parseLocalIsoDate,
  shiftDays,
  formatHumanDate,
} from '../AnalyticsDatePicker';

describe('AnalyticsDatePicker Helpers & Timezone-Safe Operations', () => {
  it('formats dates to YYYY-MM-DD correctly without timezone shifts', () => {
    const d = new Date(2026, 9, 14); // month is 0-indexed, so 9 is October
    expect(toLocalIsoDate(d)).toBe('2026-10-14');
  });

  it('parses YYYY-MM-DD string into a valid local Date', () => {
    const d = parseLocalIsoDate('2026-10-14');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(14);
  });

  it('shifts days forward and backward accurately', () => {
    expect(shiftDays('2026-10-14', -1)).toBe('2026-10-13');
    expect(shiftDays('2026-10-14', 1)).toBe('2026-10-15');
    // Month boundary rollover
    expect(shiftDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('formats human readable dates', () => {
    const formatted = formatHumanDate('2026-10-14', { month: 'short', day: 'numeric', year: 'numeric' });
    expect(formatted).toContain('Oct');
    expect(formatted).toContain('14');
    expect(formatted).toContain('2026');
  });
});
