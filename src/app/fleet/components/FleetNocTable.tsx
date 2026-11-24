'use client';

import React, { useId, useMemo, useState } from 'react';
import {
  ArrowUp,
  Copy,
  Check,
  Zap,
  Sliders,
  AlertTriangle,
  WifiOff,
} from 'lucide-react';
import {
  sortNocTableRows,
  type NocInverterRow,
  type NocSortColumn,
  type NocSortDirection,
} from '../types';

interface FleetNocTableProps {
  rows: NocInverterRow[];
  scopeLabel: string;
  copiedSn: string | null;
  onCopySn: (sn: string, e: React.MouseEvent) => void;
  onNavigateToDevice: (
    accountId: string,
    stationId: string,
    deviceSn: string,
    destination: '/hardware-telemetry' | '/energy-flow'
  ) => void;
}

const COLUMNS: Array<{
  key: NocSortColumn;
  label: string;
  type: 'string' | 'number';
  align?: 'left' | 'right';
}> = [
  { key: 'deviceSn', label: 'Inverter SN / Model', type: 'string', align: 'left' },
  { key: 'stationName', label: 'Station', type: 'string', align: 'left' },
  { key: 'status', label: 'Status', type: 'number', align: 'left' },
  { key: 'loggerSn', label: 'Logger', type: 'string', align: 'left' },
  { key: 'liveSolarPowerKw', label: 'Live kW', type: 'number', align: 'right' },
  { key: 'ratedKw', label: 'Rated kWp', type: 'number', align: 'right' },
  { key: 'utilizationPct', label: 'Load %', type: 'number', align: 'right' },
  { key: 'dailyYieldKwh', label: 'Daily kWh', type: 'number', align: 'right' },
  { key: 'specificYieldKwhKwp', label: 'Spec. Yield', type: 'number', align: 'right' },
  { key: 'batterySoc', label: 'BESS', type: 'number', align: 'right' },
];

export function FleetNocTable({
  rows,
  scopeLabel,
  copiedSn,
  onCopySn,
  onNavigateToDevice,
}: FleetNocTableProps) {
  const captionId = useId();
  const [sortCol, setSortCol] = useState<NocSortColumn>('status');
  const [sortDir, setSortDir] = useState<NocSortDirection>('descending');
  const [sortAnnouncement, setSortAnnouncement] = useState<string>('');

  const sortedRows = useMemo(
    () => sortNocTableRows(rows, sortCol, sortDir),
    [rows, sortCol, sortDir]
  );

  const handleSort = (column: NocSortColumn, label: string) => {
    const nextDir: NocSortDirection =
      sortCol === column
        ? sortDir === 'ascending'
          ? 'descending'
          : 'ascending'
        : column === 'deviceSn' || column === 'stationName' || column === 'loggerSn'
        ? 'ascending'
        : 'descending';

    setSortCol(column);
    setSortDir(nextDir);
    setSortAnnouncement(
      `Sorted by ${label}, ${nextDir}, ${rows.length} inverters`
    );
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-card/50 p-10 text-center">
        <p className="text-sm font-semibold text-foreground">
          No inverter telemetry matching the active scope or filters
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 fleet-containment">
      <p role="status" className="visually-hidden">
        {sortAnnouncement}
      </p>

      <div
        tabIndex={0}
        role="region"
        aria-labelledby={captionId}
        className="fleet-table-wrapper rounded-2xl border border-border/70 bg-card shadow-xs"
      >
        <table className="fleet-noc-table text-xs">
          <caption id={captionId} className="visually-hidden">
            NOC Inverter Telemetry Matrix for {scopeLabel}
          </caption>

          <thead>
            <tr className="border-b border-border/70 text-[10.5px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
              {COLUMNS.map((col) => {
                const isSorted = sortCol === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    data-type={col.type}
                    data-align={col.align || 'left'}
                    aria-sort={isSorted ? sortDir : undefined}
                    className={`whitespace-nowrap border-b border-border/70 ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(col.key, col.label)}
                    >
                      <span>{col.label}</span>
                      <ArrowUp
                        size={11}
                        aria-hidden="true"
                        data-sort-indicator="true"
                        className="shrink-0"
                      />
                    </button>
                  </th>
                );
              })}
              <th
                scope="col"
                className="px-3 py-2.5 text-right whitespace-nowrap border-b border-border/70"
              >
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border/50">
            {sortedRows.map((row) => {
              const isFault = row.status === 'FAULT';
              const isOffline = row.status === 'OFFLINE';
              const isStandby = row.status === 'STANDBY';
              const isCopied = copiedSn === row.deviceSn;

              return (
                <tr key={row.rowId} className="transition-colors">
                  <th
                    scope="row"
                    className="px-3 py-2.5 text-left font-normal whitespace-nowrap border-r border-border/30"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-foreground">
                        {row.deviceSn}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => onCopySn(row.deviceSn, e)}
                        aria-label={`Copy serial number ${row.deviceSn}`}
                        className="p-0.5 text-muted-foreground hover:text-foreground rounded cursor-pointer shrink-0"
                      >
                        {isCopied ? (
                          <Check size={11} className="text-emerald-500" aria-hidden="true" />
                        ) : (
                          <Copy size={11} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[190px]">
                      {row.model}
                    </div>
                  </th>

                  <td
                    data-label="Station"
                    className="px-3 py-2.5 whitespace-nowrap"
                  >
                    <div className="font-medium text-foreground truncate max-w-[170px]">
                      {row.stationName}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[170px]">
                      {row.accountName}
                    </div>
                  </td>

                  <td
                    data-label="Status"
                    className="px-3 py-2.5 whitespace-nowrap font-mono"
                  >
                    <span
                      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                        isFault
                          ? 'text-destructive'
                          : isOffline
                          ? 'text-muted-foreground'
                          : isStandby
                          ? 'text-amber-500'
                          : 'text-emerald-500'
                      }`}
                    >
                      {isFault ? (
                        <AlertTriangle size={11} aria-hidden="true" />
                      ) : isOffline ? (
                        <WifiOff size={11} aria-hidden="true" />
                      ) : (
                        <span
                          className={`size-1.5 rounded-full ${
                            isStandby ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          aria-hidden="true"
                        />
                      )}
                      {row.status}
                    </span>
                  </td>

                  <td
                    data-label="Logger"
                    className="px-3 py-2.5 whitespace-nowrap font-mono text-[11px]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={
                          row.loggerStatus === 'OFFLINE'
                            ? 'text-destructive font-semibold'
                            : 'text-muted-foreground'
                        }
                      >
                        {row.loggerSn}
                      </span>
                      {row.loggerStatus === 'OFFLINE' && (
                        <span className="text-[9.5px] uppercase text-destructive font-bold">
                          Offline
                        </span>
                      )}
                    </div>
                  </td>

                  <td
                    data-label="Live kW"
                    className="px-3 py-2.5 text-right whitespace-nowrap font-mono tabular-nums font-bold text-amber-500"
                  >
                    {row.liveSolarPowerKw.toFixed(2)} kW
                  </td>

                  <td
                    data-label="Rated kWp"
                    className="px-3 py-2.5 text-right whitespace-nowrap font-mono tabular-nums text-muted-foreground"
                  >
                    {row.ratedKw > 0 ? `${row.ratedKw} kW` : '--'}
                  </td>

                  <td
                    data-label="Load %"
                    className="px-3 py-2.5 text-right whitespace-nowrap font-mono tabular-nums"
                  >
                    <div className="inline-flex items-center justify-end gap-2 min-w-[72px]">
                      <div className="w-10 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            isFault ? 'bg-destructive' : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.min(100, row.utilizationPct)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-foreground w-8 text-right">
                        {row.ratedKw > 0 ? `${row.utilizationPct.toFixed(0)}%` : '--'}
                      </span>
                    </div>
                  </td>

                  <td
                    data-label="Daily kWh"
                    className="px-3 py-2.5 text-right whitespace-nowrap font-mono tabular-nums font-semibold text-foreground"
                  >
                    {row.dailyYieldKwh.toFixed(1)} kWh
                  </td>

                  <td
                    data-label="Spec. Yield"
                    className="px-3 py-2.5 text-right whitespace-nowrap font-mono tabular-nums text-foreground"
                  >
                    {row.specificYieldKwhKwp !== null
                      ? `${row.specificYieldKwhKwp.toFixed(2)} kWh/kWp`
                      : '--'}
                  </td>

                  <td
                    data-label="BESS SoC"
                    className="px-3 py-2.5 text-right whitespace-nowrap font-mono tabular-nums"
                  >
                    {row.batterySoc > 0 ? (
                      <span className="text-cyan-400 font-semibold">
                        {row.batterySoc.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </td>

                  <td
                    data-label="Actions"
                    className="px-3 py-2.5 text-right whitespace-nowrap"
                  >
                    <div className="inline-flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          onNavigateToDevice(
                            row.accountId,
                            row.stationId,
                            row.deviceSn,
                            '/energy-flow'
                          )
                        }
                        aria-label={`Open Energy Flow for ${row.deviceSn}`}
                        title="Open Energy Flow"
                        className="px-2 py-1 rounded-md border border-border/70 bg-background hover:bg-muted text-[10.5px] font-mono font-medium text-foreground inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Zap size={11} className="text-amber-500" aria-hidden="true" />
                        <span>Flow</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onNavigateToDevice(
                            row.accountId,
                            row.stationId,
                            row.deviceSn,
                            '/hardware-telemetry'
                          )
                        }
                        aria-label={`Open Hardware Telemetry for ${row.deviceSn}`}
                        title="Open Hardware Telemetry"
                        className="px-2 py-1 rounded-md border border-border/70 bg-background hover:bg-muted text-[10.5px] font-mono font-medium text-foreground inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Sliders size={11} className="text-primary" aria-hidden="true" />
                        <span>Telem</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
