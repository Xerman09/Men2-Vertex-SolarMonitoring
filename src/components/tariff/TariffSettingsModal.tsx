'use client';

import React, { useState, useEffect } from 'react';
import {
  Zap,
  Sparkles,
  Check,
  X,
  Sliders,
  RotateCcw,
  Info,
} from 'lucide-react';
import { useTariff } from '@/lib/tariff-context';
import { Button } from '@/components/ui/button';
import { HoverInfo } from '@/components/ui/tooltip';

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => setIsConfigModalOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Minimal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/70 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500 shrink-0">
              <Zap size={16} />
            </div>
            <h2 className="text-sm font-bold text-foreground font-headline">
              Tariff Schedule
            </h2>
          </div>

          <button
            onClick={() => setIsConfigModalOpen(false)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Compact Mode Switcher */}
        <div className="px-5 pt-3.5">
          <div className="flex gap-1.5 p-0.5 bg-muted/40 rounded-lg border border-border/50">
            <button
              type="button"
              onClick={() => setMode('preset')}
              className={`flex-1 py-1.5 rounded-md font-semibold text-xs transition-all flex items-center justify-center gap-1.5 ${
                mode === 'preset'
                  ? 'bg-card text-foreground shadow-xs border border-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles size={13} className="text-amber-500" />
              Presets & Auto
            </button>
            <button
              type="button"
              onClick={() => setMode('custom')}
              className={`flex-1 py-1.5 rounded-md font-semibold text-xs transition-all flex items-center justify-center gap-1.5 ${
                mode === 'custom'
                  ? 'bg-card text-foreground shadow-xs border border-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sliders size={13} className="text-cyan-400" />
              Custom Bill
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="px-5 py-3 overflow-y-auto space-y-2 text-xs flex-1">
          {mode === 'preset' ? (
            <div className="space-y-1.5">
              {/* Clean Auto-Detect Row with Hover Description */}
              <HoverInfo
                className="w-full block"
                title="Location Auto-Detect"
                content="Automatically maps to local distribution utility (e.g., DECORP for Dagupan) based on plant address."
                side="top"
              >
                <div
                  onClick={() => setSelectedPresetId('auto')}
                  className={`w-full p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    selectedPresetId === 'auto'
                      ? 'border-emerald-500/60 bg-emerald-500/10'
                      : 'border-border/60 hover:border-border hover:bg-muted/30 bg-card/40'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-md bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                      <Sparkles size={13} />
                    </div>
                    <div className="font-semibold text-foreground truncate text-xs">
                      Auto-Detect (Recommended)
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">
                      Plant Address Match
                    </span>
                    {selectedPresetId === 'auto' && <Check size={14} className="text-emerald-400" />}
                  </div>
                </div>
              </HoverInfo>

              {/* Minimal Preset List with Hover Tooltips for Details */}
              <div className="space-y-1.5 pt-1">
                {presets.map((preset) => {
                  const isSelected = selectedPresetId === preset.id;
                  return (
                    <HoverInfo
                      key={preset.id}
                      className="w-full block"
                      title={preset.name}
                      content={
                        <div className="space-y-1 text-[11px]">
                          <p>{preset.description}</p>
                          <div className="pt-1 border-t border-border/40 font-mono text-[10px] space-y-0.5 text-muted-foreground">
                            <div>Coverage: {preset.region}</div>
                            <div>Peak Window: {preset.peakStartHour}:00 - {preset.peakEndHour}:00 (₱{preset.peakRatePerKwh.toFixed(2)}/kWh)</div>
                            <div>Off-Peak: ₱{preset.offPeakRatePerKwh.toFixed(2)}/kWh</div>
                            <div>Net Export Credit: ₱{preset.exportCreditPerKwh.toFixed(2)}/kWh</div>
                          </div>
                        </div>
                      }
                      side="top"
                    >
                      <div
                        onClick={() => setSelectedPresetId(preset.id)}
                        className={`w-full p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'border-primary/60 bg-primary/10'
                            : 'border-border/60 hover:border-border hover:bg-muted/30 bg-card/40'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <span className="font-medium text-foreground truncate text-xs">
                            {preset.shortName}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                            · {(preset.region || '').split(',')[0]}
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0 font-mono text-xs">
                          <span className="font-bold text-foreground">
                            ₱{preset.offPeakRatePerKwh.toFixed(2)} / ₱{preset.peakRatePerKwh.toFixed(2)}
                          </span>
                          {isSelected ? (
                            <Check size={14} className="text-primary" />
                          ) : (
                            <span className="w-3.5" />
                          )}
                        </div>
                      </div>
                    </HoverInfo>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-3 gap-2.5 font-mono">
                <div>
                  <HoverInfo
                    title="Off-Peak Retail Rate"
                    content="Electricity base rate during morning, midday, and late evening hours."
                    side="top"
                  >
                    <label className="text-[10px] font-sans font-semibold text-muted-foreground block mb-1">
                      Off-Peak (₱/kWh)
                    </label>
                  </HoverInfo>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      value={customOffPeak}
                      onChange={(e) => setCustomOffPeak(e.target.value)}
                      className="w-full pl-6 pr-2 py-1.5 bg-background border border-border/80 rounded-lg text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <HoverInfo
                    title="Peak Retail Rate"
                    content="Highest utility tariff rate during 2:00 PM - 8:00 PM peak demand window."
                    side="top"
                  >
                    <label className="text-[10px] font-sans font-semibold text-muted-foreground block mb-1">
                      Peak Rate (₱/kWh)
                    </label>
                  </HoverInfo>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      value={customPeak}
                      onChange={(e) => setCustomPeak(e.target.value)}
                      className="w-full pl-6 pr-2 py-1.5 bg-background border border-border/80 rounded-lg text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <HoverInfo
                    title="Net-Metering Export Credit"
                    content="ERC generation charge credit per kWh pushed back onto the grid."
                    side="top"
                  >
                    <label className="text-[10px] font-sans font-semibold text-muted-foreground block mb-1">
                      Export (₱/kWh)
                    </label>
                  </HoverInfo>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      value={customExport}
                      onChange={(e) => setCustomExport(e.target.value)}
                      className="w-full pl-6 pr-2 py-1.5 bg-background border border-border/80 rounded-lg text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1">
                <Info size={12} className="text-cyan-400 shrink-0" />
                <span>Hover over fields to see definitions or match with your electric bill.</span>
              </div>
            </div>
          )}
        </div>

        {/* Clean Footer */}
        <div className="px-5 py-3 border-t border-border/70 bg-muted/20 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={resetToAuto}
            className="text-muted-foreground hover:text-foreground text-xs h-8 flex items-center gap-1.5 px-2"
          >
            <RotateCcw size={12} />
            Reset Auto
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConfigModalOpen(false)}
              className="text-xs h-8 px-3"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              className="text-xs h-8 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4"
            >
              Apply Rates
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
