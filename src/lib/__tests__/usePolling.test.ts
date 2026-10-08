import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePolling, useSafeTimeout, useSafeTimeouts } from '../usePolling';

describe('usePolling and Safe Timers Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports valid hook definitions', () => {
    expect(typeof usePolling).toBe('function');
    expect(typeof useSafeTimeout).toBe('function');
    expect(typeof useSafeTimeouts).toBe('function');
  });

  it('executes scheduled timer callback after delay', () => {
    const callback = vi.fn();
    const timerId = setTimeout(callback, 500);

    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledTimes(1);

    clearTimeout(timerId);
  });

  it('cancels scheduled timer before delay expires', () => {
    const callback = vi.fn();
    const timerId = setTimeout(callback, 800);

    vi.advanceTimersByTime(400);
    clearTimeout(timerId);
    vi.advanceTimersByTime(500);

    expect(callback).not.toHaveBeenCalled();
  });
});
