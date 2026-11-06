'use client';

import React, { useState, useEffect } from 'react';
import {
  Zap,
  Building2,
  Clock,
  Sparkles,
  Check,
  X,
  Sliders,
  RotateCcw,
  Info,
  DollarSign,
} from 'lucide-react';
import { useTariff } from '@/lib/tariff-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export function TariffSettingsModal() {
  const {
    activeTariff,
    tariffConfig,
    setPreset,
    setCustomRates,
    resetToAuto,
    presets,
    isConfigModalOpen,
    setIsConfigModalOpen,
  } = useTariff();

  const [mode, setMode] = useState<'preset' | 'custom'>(tariffConfig.presetId === 'custom' ? 'custom' : 'preset');
  const [selectedPresetId, setSelectedPresetId] = useState(tariffConfig.presetId);
  const [customPeak, setCustomPeak] = useState(String(activeTariff.peakRate));
  const [customOffPeak, setCustomOffPeak] = useState(String(activeTariff.offPeakRate));
  const [customExport, setCustomExport] = useState(String(activeTariff.exportCredit));

  useEffect(() => {
    if (isConfigModalOpen) {
      setMode(tariffConfig.presetId === 'custom' ? 'custom' : 'preset');
      setSelectedPresetId(tariffConfig.presetId);
      setCustomPeak(String(activeTariff.peakRate));
      setCustomOffPeak(String(activeTariff.offPeakRate));
      setCustomExport(String(activeTariff.exportCredit));
    }
  }, [isConfigModalOpen, tariffConfig, activeTariff]);

  if (!isConfigModalOpen) return null;

  const handleSave = () => {
    if (mode === 'custom') {
      const peak = parseFloat(customPeak) || activeTariff.peakRate;
      const offPeak = parseFloat(customOffPeak) || activeTariff.offPeakRate;
      const exportCr = parseFloat(customExport) || activeTariff.exportCredit;
      setCustomRates({
        peakRatePerKwh: peak,
        offPeakRatePerKwh: offPeak,
        exportCreditPerKwh: exportCr,
        peakStartHour: 14,
        peakEndHour: 20,
      });
    } else {
      setPreset(selectedPresetId);
    }
    setIsConfigModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/70 bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <Zap size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground font-headline flex items-center gap-2">
                Electricity Tariff Schedule
                {activeTariff.isAutoDetected && (
                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                    Auto-Detected
                  </Badge>
                )}
              </h2>
              <p className="text-xs text-muted-foreground">
                Configures Time-of-Use electricity rates and solar net-metering export credits
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsConfigModalOpen(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Active Summary Banner */}
          <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
                Currently Active Schedule
              </span>
              <p className="font-bold text-sm text-foreground flex items-center gap-2">
                {activeTariff.schedule.name}
              </p>
              <p className="text-muted-foreground text-[11px]">
                {activeTariff.schedule.region}
              </p>
            </div>
            <div className="text-right font-mono">
              <div className="text-emerald-400 font-bold text-sm">
                ₱{activeTariff.offPeakRate.toFixed(2)} - ₱{activeTariff.peakRate.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Export: ₱{activeTariff.exportCredit.toFixed(2)}/kWh
              </div>
            </div>
          </div>

          {/* Mode Switch Tabs */}
          <div className="flex gap-2 p-1 bg-muted/40 rounded-xl border border-border/50">
            <button
              type="button"
              onClick={() => setMode('preset')}
              className={`flex-1 py-2 rounded-lg font-semibold text-xs transition-all flex items-center justify-center gap-1.5 ${
                mode === 'preset'
                  ? 'bg-card text-foreground shadow-xs border border-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles size={14} className="text-amber-500" />
              Utility Presets & Auto-Detect
            </button>
            <button
              type="button"
              onClick={() => setMode('custom')}
              className={`flex-1 py-2 rounded-lg font-semibold text-xs transition-all flex items-center justify-center gap-1.5 ${
                mode === 'custom'
                  ? 'bg-card text-foreground shadow-xs border border-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sliders size={14} className="text-cyan-400" />
              Custom Bill Override
            </button>
          </div>

          {mode === 'preset' ? (
            <div className="space-y-2.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                Select Electric Utility Provider
              </label>

              {/* Automatic detection option */}
              <div
                onClick={() => setSelectedPresetId('auto')}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  selectedPresetId === 'auto'
                    ? 'border-emerald-500/60 bg-emerald-500/10'
                    : 'border-border/60 hover:border-border bg-card/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <div className="font-bold text-foreground flex items-center gap-2">
                      Auto-Detect by Plant Location (Recommended)
                      {selectedPresetId === 'auto' && (
                        <Check size={14} className="text-emerald-400" />
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Automatically selects utility company from plant address (e.g. DECORP for Dagupan)
                    </div>
                  </div>
                </div>
              </div>

              {/* Preset List */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {presets.map((preset) => {
                  const isSelected = selectedPresetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => setSelectedPresetId(preset.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'border-primary/60 bg-primary/10'
                          : 'border-border/60 hover:border-border bg-card/40'
                      }`}
                    >
                      <div className="space-y-0.5 pr-2">
                        <div className="font-semibold text-foreground flex items-center gap-2">
                          {preset.name}
                          {isSelected && <Check size={14} className="text-primary" />}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {preset.region}
                        </div>
                      </div>
                      <div className="text-right shrink-0 font-mono text-[11px]">
                        <div className="text-foreground font-semibold">
                          ₱{preset.offPeakRatePerKwh.toFixed(2)} - ₱{preset.peakRatePerKwh.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Exp: ₱{preset.exportCreditPerKwh.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-[11px] text-cyan-300 leading-relaxed">
                <Info size={14} className="inline mr-1 text-cyan-400 -mt-0.5" />
                Look at your latest electric bill summary to input your exact retail rates.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono">
                <div>
                  <label className="text-[11px] font-sans font-semibold text-muted-foreground block mb-1">
                    Off-Peak Rate (₱/kWh)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      value={customOffPeak}
                      onChange={(e) => setCustomOffPeak(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 bg-background border border-border/80 rounded-xl text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground font-sans block mt-1">Daytime base rate</span>
                </div>

                <div>
                  <label className="text-[11px] font-sans font-semibold text-muted-foreground block mb-1">
                    Peak Rate (₱/kWh)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      value={customPeak}
                      onChange={(e) => setCustomPeak(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 bg-background border border-border/80 rounded-xl text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground font-sans block mt-1">2:00 PM - 8:00 PM</span>
                </div>

                <div>
                  <label className="text-[11px] font-sans font-semibold text-muted-foreground block mb-1">
                    Net Export Credit (₱/kWh)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      value={customExport}
                      onChange={(e) => setCustomExport(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 bg-background border border-border/80 rounded-xl text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground font-sans block mt-1">Surplus feed-in rate</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-border/70 bg-muted/20 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={resetToAuto}
            className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1.5"
          >
            <RotateCcw size={13} />
            Reset to Auto
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConfigModalOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4"
            >
              Apply Rates
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

