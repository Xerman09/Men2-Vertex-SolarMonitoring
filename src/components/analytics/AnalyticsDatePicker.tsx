'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  RotateCcw,
  Sparkles,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HoverInfo } from '@/components/ui/tooltip';

export type DatePreset =
  | 'TODAY'
  | 'YESTERDAY'
  | '7D'
  | '30D'
  | 'THIS_MONTH'
  | '12M'
  | 'CUSTOM_DATE';

export interface AnalyticsDatePickerValue {
  preset: DatePreset;
  selectedDate: string; // 'YYYY-MM-DD'
  startDate?: string;   // 'YYYY-MM-DD'
  endDate?: string;     // 'YYYY-MM-DD'
}

interface AnalyticsDatePickerProps {
  value: AnalyticsDatePickerValue;
  onChange: (value: AnalyticsDatePickerValue) => void;
  className?: string;
}

// Helpers for timezone-safe YYYY-MM-DD operations
export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseLocalIsoDate(isoStr: string): Date {
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function shiftDays(dateStr: string, deltaDays: number): string {
  const date = parseLocalIsoDate(dateStr);
  date.setDate(date.getDate() + deltaDays);
  return toLocalIsoDate(date);
}

export function formatHumanDate(
  isoStr: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
): string {
  const date = parseLocalIsoDate(isoStr);
  return new Intl.DateTimeFormat('en-US', options).format(date);
}

export function AnalyticsDatePicker({
  value,
  onChange,
  className = '',
}: AnalyticsDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derived today reference
  const todayIso = useMemo(() => toLocalIsoDate(new Date()), []);
  const isSelectedToday = value.selectedDate === todayIso && value.preset === 'TODAY';
  const isSelectedFuture = value.selectedDate > todayIso;

  // Internal calendar month view state
  const initialDate = parseLocalIsoDate(value.selectedDate || todayIso);
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth()); // 0-indexed

  // Sync calendar view month when selectedDate changes externally
  useEffect(() => {
    if (value.selectedDate) {
      const d = parseLocalIsoDate(value.selectedDate);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value.selectedDate]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Quick Preset Actions
  const applyPreset = useCallback(
    (preset: DatePreset) => {
      const now = new Date();
      const today = toLocalIsoDate(now);

      if (preset === 'TODAY') {
        onChange({
          preset: 'TODAY',
          selectedDate: today,
        });
      } else if (preset === 'YESTERDAY') {
        const yesterday = shiftDays(today, -1);
        onChange({
          preset: 'YESTERDAY',
          selectedDate: yesterday,
        });
      } else if (preset === '7D') {
        const start = shiftDays(today, -6);
        onChange({
          preset: '7D',
          selectedDate: today,
          startDate: start,
          endDate: today,
        });
      } else if (preset === '30D') {
        const start = shiftDays(today, -29);
        onChange({
          preset: '30D',
          selectedDate: today,
          startDate: start,
          endDate: today,
        });
      } else if (preset === 'THIS_MONTH') {
        const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        onChange({
          preset: 'THIS_MONTH',
          selectedDate: today,
          startDate: start,
          endDate: today,
        });
      } else if (preset === '12M') {
        const startYear = now.getFullYear() - 1;
        const start = `${startYear}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        onChange({
          preset: '12M',
          selectedDate: today,
          startDate: start,
          endDate: today,
        });
      }
      setIsOpen(false);
    },
    [onChange]
  );

  // Stepper handlers (< and > buttons)
  const handleStepDay = (delta: number) => {
    const nextDate = shiftDays(value.selectedDate, delta);
    if (nextDate > todayIso) return; // Prevent picking future date

    if (nextDate === todayIso) {
      onChange({
        preset: 'TODAY',
        selectedDate: todayIso,
      });
    } else {
      onChange({
        preset: 'CUSTOM_DATE',
        selectedDate: nextDate,
      });
    }
  };

  // Click on a calendar day
  const handleSelectDay = (dayIso: string) => {
    if (dayIso > todayIso) return; // Disable future dates

    if (dayIso === todayIso) {
      onChange({
        preset: 'TODAY',
        selectedDate: todayIso,
      });
    } else {
      onChange({
        preset: 'CUSTOM_DATE',
        selectedDate: dayIso,
      });
    }
    setIsOpen(false);
  };

  // Calendar Month Navigation
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    const now = new Date();
    // Prevent going past current month/year
    if (viewYear > now.getFullYear() || (viewYear === now.getFullYear() && viewMonth >= now.getMonth())) {
      return;
    }
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Month Grid Calculation
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{
      dateIso: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      isFuture: boolean;
      isInRange: boolean;
    }> = [];

    // Leading days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevDate = new Date(viewYear, viewMonth - 1, dayNum);
      const iso = toLocalIsoDate(prevDate);
      days.push({
        dateIso: iso,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: iso === todayIso,
        isSelected: iso === value.selectedDate,
        isFuture: iso > todayIso,
        isInRange: Boolean(value.startDate && value.endDate && iso >= value.startDate && iso <= value.endDate),
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const currDate = new Date(viewYear, viewMonth, d);
      const iso = toLocalIsoDate(currDate);
      days.push({
        dateIso: iso,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: iso === todayIso,
        isSelected: iso === value.selectedDate,
        isFuture: iso > todayIso,
        isInRange: Boolean(value.startDate && value.endDate && iso >= value.startDate && iso <= value.endDate),
      });
    }

    // Trailing days from next month to make 35 or 42 cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(viewYear, viewMonth + 1, i);
      const iso = toLocalIsoDate(nextDate);
      days.push({
        dateIso: iso,
        dayNumber: i,
        isCurrentMonth: false,
        isToday: iso === todayIso,
        isSelected: iso === value.selectedDate,
        isFuture: iso > todayIso,
        isInRange: Boolean(value.startDate && value.endDate && iso >= value.startDate && iso <= value.endDate),
      });
    }

    return days;
  }, [viewYear, viewMonth, value.selectedDate, value.startDate, value.endDate, todayIso]);

  const monthLabel = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
      new Date(viewYear, viewMonth, 1)
    );
  }, [viewYear, viewMonth]);

  // Display trigger label
  const triggerLabel = useMemo(() => {
    if (value.preset === 'TODAY') {
      return `Today · ${formatHumanDate(todayIso, { month: 'short', day: 'numeric' })}`;
    }
    if (value.preset === 'YESTERDAY') {
      return `Yesterday · ${formatHumanDate(value.selectedDate, { month: 'short', day: 'numeric' })}`;
    }
    if (value.preset === '7D') {
      const start = value.startDate ? formatHumanDate(value.startDate, { month: 'short', day: 'numeric' }) : '';
      const end = formatHumanDate(value.selectedDate, { month: 'short', day: 'numeric' });
      return `Last 7 Days · ${start} – ${end}`;
    }
    if (value.preset === '30D') {
      const start = value.startDate ? formatHumanDate(value.startDate, { month: 'short', day: 'numeric' }) : '';
      const end = formatHumanDate(value.selectedDate, { month: 'short', day: 'numeric' });
      return `Last 30 Days · ${start} – ${end}`;
    }
    if (value.preset === 'THIS_MONTH') {
      return formatHumanDate(value.selectedDate, { month: 'long', year: 'numeric' });
    }
    if (value.preset === '12M') {
      return '12 Months (Seasonal)';
    }
    return formatHumanDate(value.selectedDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }, [value, todayIso]);

  const isNextDisabled = value.selectedDate >= todayIso;
  const isCurrentMonthView = (() => {
    const now = new Date();
    return viewYear === now.getFullYear() && viewMonth === now.getMonth();
  })();

  const presetsList: Array<{ id: DatePreset; label: string; desc: string }> = [
    { id: 'TODAY', label: 'Today (5m Live)', desc: 'Real-time 5-minute sampling for today.' },
    { id: 'YESTERDAY', label: 'Yesterday', desc: 'Full 24-hour diurnal profile of yesterday.' },
    { id: '7D', label: 'Last 7 Days', desc: '7-day rolling generation & consumption balance.' },
    { id: '30D', label: 'Last 30 Days', desc: 'Monthly diurnal pattern and grid exchange.' },
    { id: 'THIS_MONTH', label: 'This Month', desc: 'Current calendar month accumulation.' },
    { id: '12M', label: '12 Months', desc: 'Yearly seasonal generation trends in MWh.' },
  ];

  return (
    <div className={`relative inline-flex items-center gap-1.5 ${className}`} ref={containerRef}>
      {/* 1-Day Step Back */}
      <HoverInfo title="Previous Day" content="Step backward 1 day in solar telemetry history." side="bottom">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleStepDay(-1)}
          className="h-9 w-9 p-0 rounded-xl border-border/70 hover:bg-card cursor-pointer shadow-xs text-muted-foreground hover:text-foreground"
          aria-label="Previous day"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </HoverInfo>

      {/* Main Date Picker Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Select date or timeframe for solar analytics"
        className={`h-9 px-3.5 flex items-center gap-2 rounded-xl border text-xs font-medium transition-all cursor-pointer shadow-xs ${
          isOpen
            ? 'bg-primary/10 border-primary/50 text-foreground ring-2 ring-primary/20'
            : 'bg-card hover:bg-muted/50 border-border/70 text-foreground'
        }`}
      >
        <CalendarIcon className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="font-semibold tracking-tight whitespace-nowrap">{triggerLabel}</span>
        {isSelectedToday && (
          <span className="flex h-2 w-2 relative shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-foreground' : ''
          }`}
        />
      </button>

      {/* 1-Day Step Forward */}
      <HoverInfo
        title="Next Day"
        content={isNextDisabled ? 'Cannot view future dates.' : 'Step forward 1 day toward today.'}
        side="bottom"
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isNextDisabled}
          onClick={() => handleStepDay(1)}
          className="h-9 w-9 p-0 rounded-xl border-border/70 hover:bg-card cursor-pointer shadow-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Next day"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </HoverInfo>

      {/* Quick "Today" Reset Pill (shown when viewing any past date) */}
      {!isSelectedToday && (
        <HoverInfo title="Jump to Today" content="Return immediately to real-time live today telemetry." side="bottom">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => applyPreset('TODAY')}
            className="h-9 px-2.5 text-xs text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl border border-emerald-500/30 flex items-center gap-1 cursor-pointer font-medium shadow-2xs"
          >
            <RotateCcw className="w-3 h-3" />
            Today
          </Button>
        </HoverInfo>
      )}

      {/* Interactive Popover Dropdown */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Solar Date Picker"
          className="absolute top-full right-0 mt-2 z-50 w-[340px] sm:w-[480px] bg-popover/95 border border-border/70 rounded-2xl shadow-2xl p-4 backdrop-blur-md animate-in fade-in-50 zoom-in-95 duration-150 select-none text-foreground"
        >
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Left: Quick Presets Sidebar */}
            <div className="flex flex-col sm:w-44 shrink-0 gap-1 border-b sm:border-b-0 sm:border-r border-border/50 pb-3 sm:pb-0 sm:pr-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 font-semibold px-2">
                Quick Ranges
              </span>
              {presetsList.map((preset) => {
                const isActive = value.preset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    className={`flex items-center justify-between text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-xs font-bold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`}
                  >
                    <span>{preset.label}</span>
                    {isActive && <Check className="w-3.5 h-3.5 ml-1 shrink-0" />}
                  </button>
                );
              })}

              {/* Native Date Input for Direct Typing / OS Picker */}
              <div className="mt-3 pt-2 border-t border-border/40 px-2 flex flex-col gap-1">
                <label htmlFor="direct-date-input" className="text-[10px] font-mono text-muted-foreground uppercase">
                  Direct Date
                </label>
                <input
                  id="direct-date-input"
                  type="date"
                  value={value.selectedDate}
                  max={todayIso}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleSelectDay(e.target.value);
                    }
                  }}
                  className="bg-card border border-border/70 rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-full cursor-pointer font-mono"
                />
              </div>
            </div>

            {/* Right: Calendar Month Grid */}
            <div className="flex-1 flex flex-col">
              {/* Month / Year Header */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/40">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handlePrevMonth}
                  className="h-7 w-7 p-0 rounded-lg hover:bg-muted cursor-pointer"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </Button>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold font-mono tracking-tight text-foreground">
                    {monthLabel}
                  </span>
                  {!isCurrentMonthView && (
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        setViewYear(now.getFullYear());
                        setViewMonth(now.getMonth());
                      }}
                      className="text-[10px] font-mono text-primary hover:underline ml-1 cursor-pointer"
                      title="Jump to current month"
                    >
                      (Current)
                    </button>
                  )}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isCurrentMonthView}
                  onClick={handleNextMonth}
                  className="h-7 w-7 p-0 rounded-lg hover:bg-muted cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </Button>
              </div>

              {/* Day of Week Headers */}
              <div className="grid grid-cols-7 gap-1 text-center mb-1 text-[11px] font-mono text-muted-foreground font-semibold">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((dow) => (
                  <div key={dow} className="py-0.5">
                    {dow}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {calendarDays.map((cell, idx) => {
                  const isSelected = cell.dateIso === value.selectedDate;
                  const isCurrentDay = cell.dateIso === todayIso;
                  const isFutureDay = cell.isFuture;
                  const isDimmed = !cell.isCurrentMonth || isFutureDay;

                  return (
                    <button
                      key={`${cell.dateIso}-${idx}`}
                      type="button"
                      disabled={isFutureDay}
                      onClick={() => handleSelectDay(cell.dateIso)}
                      className={`h-7 w-full rounded-lg font-mono text-xs flex items-center justify-center transition-all cursor-pointer relative ${
                        isSelected
                          ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                          : cell.isInRange
                          ? 'bg-primary/20 text-foreground font-medium'
                          : isDimmed
                          ? 'text-muted-foreground/40 hover:text-muted-foreground cursor-not-allowed'
                          : 'text-foreground hover:bg-muted/70 hover:scale-105'
                      } ${isCurrentDay && !isSelected ? 'ring-1 ring-primary/70 font-bold text-primary' : ''}`}
                      title={cell.isFuture ? 'Future date' : cell.dateIso}
                    >
                      <span>{cell.dayNumber}</span>
                      {isCurrentDay && !isSelected && (
                        <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-emerald-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Bottom Quick Info & Close */}
              <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-mono text-[10px]">
                  Selected: <span className="font-bold text-foreground">{value.selectedDate}</span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="h-6 px-2 text-[11px] rounded-md border-border/60 hover:bg-card cursor-pointer"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
