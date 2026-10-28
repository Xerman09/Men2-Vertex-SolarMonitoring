'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Building2,
  Cpu,
  Layers,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Radio,
  Sliders,
  ExternalLink,
  Sparkles,
  Zap,
  Activity,
  Gauge,
  X,
  Maximize2,
  Minimize2,
  Share2,
  Filter,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  GripVertical,
  Move,
  Compass,
  Workflow,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InverterSolarCurve } from './InverterSolarCurve';
import { PlantSolarCurve } from './PlantSolarCurve';

export interface FleetTopologyAccount {
  account: {
    id: string;
    name: string;
    status?: string;
  };
  isDemo: boolean;
  plants: Array<{
    plantKey: string;
    plant: {
      stationId: string | number;
      stationName: string;
    };
    inverters: Array<{
      deviceSn: string;
      model?: string;
      ratedKw: number;
      liveSolarPowerKw: number;
      dailyYieldKwh: number;
      status: string;
      loggerSn?: string;
      batterySoc?: number;
    }>;
    loggers: any[];
    livePowerKw: number;
    dailyYieldKwh: number;
    capacityKw: number;
    demandKw?: number;
    gridPowerKw?: number;
    status: 'ONLINE' | 'STANDBY' | 'FAULT' | 'OFFLINE';
  }>;
  livePowerKw: number;
  dailyYieldKwh: number;
  capacityKw: number;
  demandKw?: number;
  gridPowerKw?: number;
  invertersCount: number;
  loggersCount: number;
}

interface FleetTopologyNodesViewProps {
  accounts: FleetTopologyAccount[];
  telemetryHistory?: Array<{
    hour?: string;
    solarYieldKw?: number | null;
    loadDemandKw?: number | null;
    gridFlowKw?: number | null;
    isElapsed?: boolean;
  }> | null;
  onNavigateToDevice: (
    accountId: string,
    stationId: string,
    deviceSn: string,
    destination: '/hardware-telemetry' | '/energy-flow'
  ) => void;
  copiedSn: string | null;
  onCopySn: (sn: string, e: React.MouseEvent) => void;
  searchQuery: string;
}

type SelectedNode =
  | { type: 'account'; data: FleetTopologyAccount }
  | { type: 'plant'; data: FleetTopologyAccount['plants'][0]; accountName: string; accountId: string }
  | {
      type: 'inverter';
      data: FleetTopologyAccount['plants'][0]['inverters'][0];
      plantName: string;
      stationId: string;
      accountName: string;
      accountId: string;
    }
  | null;

// Node dimension constants for calculating ports & layout
const ACCOUNT_WIDTH = 320;
const ACCOUNT_HEIGHT = 165;
const PLANT_WIDTH = 300;
const PLANT_HEIGHT = 155;
const INVERTER_WIDTH = 270;
const INVERTER_HEIGHT = 145;

export function FleetTopologyNodesView({
  accounts,
  telemetryHistory,
  onNavigateToDevice,
  copiedSn,
  onCopySn,
  searchQuery,
}: FleetTopologyNodesViewProps) {
  // Expansion state: which accounts and which plants are expanded
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(() => {
    return new Set(accounts.map((a) => a.account.id));
  });

  const [expandedPlantKeys, setExpandedPlantKeys] = useState<Set<string>>(() => {
    return new Set(
      accounts.flatMap((a) => a.plants.slice(0, 2).map((p) => p.plantKey))
    );
  });

  // Selected node for the telemetry inspector drawer
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showMinimap, setShowMinimap] = useState<boolean>(true);

  // Canvas Pan & Zoom State
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [zoom, setZoom] = useState<number>(0.85);

  // Calculate hierarchical auto-layout positions
  const computeAutoLayout = useCallback(
    (accs: FleetTopologyAccount[], expAccs: Set<string>, expPlants: Set<string>) => {
      const positions: Record<string, { x: number; y: number }> = {};
      let currentAccY = 60;

      accs.forEach((acc) => {
        const accId = `acc_${acc.account.id}`;
        const isAccExp = expAccs.has(acc.account.id);
        const accX = 60;

        if (!isAccExp || acc.plants.length === 0) {
          positions[accId] = { x: accX, y: currentAccY };
          currentAccY += ACCOUNT_HEIGHT + 60;
          return;
        }

        // Calculate heights of all visible plants
        let plantStartY = currentAccY;
        acc.plants.forEach((p) => {
          const plantId = `plant_${acc.account.id}_${p.plantKey}`;
          const isPlantExp = expPlants.has(p.plantKey);
          const plantX = accX + ACCOUNT_WIDTH + 140;

          if (!isPlantExp || p.inverters.length === 0) {
            positions[plantId] = { x: plantX, y: plantStartY };
            plantStartY += PLANT_HEIGHT + 40;
          } else {
            // Distribute inverters
            const invCount = p.inverters.length;
            const invertersTotalHeight = invCount * (INVERTER_HEIGHT + 24) - 24;
            const plantBlockHeight = Math.max(PLANT_HEIGHT, invertersTotalHeight);

            // Center plant node vertically relative to its inverters
            const plantCenterY = plantStartY + plantBlockHeight / 2 - PLANT_HEIGHT / 2;
            positions[plantId] = { x: plantX, y: Math.round(plantCenterY) };

            // Inverters column
            const invX = plantX + PLANT_WIDTH + 140;
            let invCurrentY = plantStartY;
            p.inverters.forEach((inv) => {
              const invId = `inv_${acc.account.id}_${p.plantKey}_${inv.deviceSn}`;
              positions[invId] = { x: invX, y: Math.round(invCurrentY) };
              invCurrentY += INVERTER_HEIGHT + 24;
            });

            plantStartY += plantBlockHeight + 50;
          }
        });

        // Center parent account node relative to its children plants
        const totalPlantsHeight = plantStartY - currentAccY - 50;
        const accCenterY = currentAccY + Math.max(0, (totalPlantsHeight - ACCOUNT_HEIGHT) / 2);
        positions[accId] = { x: accX, y: Math.round(accCenterY) };

        currentAccY = Math.max(currentAccY + ACCOUNT_HEIGHT + 60, plantStartY + 40);
      });

      return positions;
    },
    []
  );

  // Node Positions: key -> { x, y }
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>(() => {
    return computeAutoLayout(
      accounts,
      new Set(accounts.map((a) => a.account.id)),
      new Set(accounts.flatMap((a) => a.plants.slice(0, 2).map((p) => p.plantKey)))
    );
  });

  // Keep refs synchronized to prevent any stale closures during mouse movement
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const nodePositionsRef = useRef(nodePositions);
  nodePositionsRef.current = nodePositions;

  // Canvas container reference
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Interaction tracking (panning vs dragging node)
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number }>({
    mouseX: 0,
    mouseY: 0,
    panX: 0,
    panY: 0,
  });

  const draggingNodeRef = useRef<{
    nodeId: string;
    startMouseX: number;
    startMouseY: number;
    startNodeX: number;
    startNodeY: number;
    hasMoved: boolean;
  } | null>(null);

  const [activeDraggingNodeId, setActiveDraggingNodeId] = useState<string | null>(null);

  // Update layout positions when accounts list changes, while strictly preserving user-moved node positions
  useEffect(() => {
    setNodePositions((prev) => {
      const baseline = computeAutoLayout(accounts, expandedAccountIds, expandedPlantKeys);
      const merged: Record<string, { x: number; y: number }> = { ...prev };
      Object.keys(baseline).forEach((k) => {
        if (!merged[k]) {
          merged[k] = baseline[k];
        }
      });
      return merged;
    });
  }, [accounts, expandedAccountIds, expandedPlantKeys, computeAutoLayout]);

  // Reset to clean auto-layout
  const handleAutoLayout = useCallback(() => {
    const fresh = computeAutoLayout(accounts, expandedAccountIds, expandedPlantKeys);
    setNodePositions(fresh);
    setPan({ x: 50, y: 50 });
    setZoom(0.85);
  }, [accounts, expandedAccountIds, expandedPlantKeys, computeAutoLayout]);

  // Expand / Collapse Toggles
  const toggleAccount = useCallback((accId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setExpandedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(accId)) next.delete(accId);
      else next.add(accId);
      return next;
    });
  }, []);

  const togglePlant = useCallback((plantKey: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setExpandedPlantKeys((prev) => {
      const next = new Set(prev);
      if (next.has(plantKey)) next.delete(plantKey);
      else next.add(plantKey);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedAccountIds(new Set(accounts.map((a) => a.account.id)));
    setExpandedPlantKeys(new Set(accounts.flatMap((a) => a.plants.map((p) => p.plantKey))));
  }, [accounts]);

  const collapseAll = useCallback(() => {
    setExpandedAccountIds(new Set());
    setExpandedPlantKeys(new Set());
  }, []);

  // Zoom helpers
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(2.0, parseFloat((z + 0.15).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.3, parseFloat((z - 0.15).toFixed(2))));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(0.85);
    setPan({ x: 50, y: 50 });
  }, []);

  // Fit view to content
  const handleFitView = useCallback(() => {
    const keys = Object.keys(nodePositionsRef.current);
    if (keys.length === 0 || !containerRef.current) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    keys.forEach((k) => {
      const p = nodePositionsRef.current[k];
      if (!p) return;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + ACCOUNT_WIDTH);
      maxY = Math.max(maxY, p.y + ACCOUNT_HEIGHT);
    });

    const rect = containerRef.current.getBoundingClientRect();
    const contentW = maxX - minX + 160;
    const contentH = maxY - minY + 160;

    const scaleX = rect.width / contentW;
    const scaleY = rect.height / contentH;
    const fitScale = Math.min(1.2, Math.max(0.3, Math.min(scaleX, scaleY)));

    setZoom(fitScale);
    setPan({
      x: Math.round(rect.width / 2 - ((minX + maxX) / 2) * fitScale),
      y: Math.round(rect.height / 2 - ((minY + maxY) / 2) * fitScale),
    });
  }, []);

  // Canvas Mouse Wheel: Zoom towards cursor
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      const curZoom = zoomRef.current;
      const newZoom = Math.min(2.0, Math.max(0.3, parseFloat((curZoom * factor).toFixed(3))));

      const curPan = panRef.current;
      const newPanX = mouseX - (mouseX - curPan.x) * (newZoom / curZoom);
      const newPanY = mouseY - (mouseY - curPan.y) * (newZoom / curZoom);

      setZoom(newZoom);
      setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
    },
    []
  );

  // Canvas Pan (Drag Background)
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only pan on left or middle mouse button
    if (e.button !== 0 && e.button !== 1) return;
    const target = e.target as HTMLElement;
    // Do not pan if clicking inside any node card
    if (target.closest('[data-node-card="true"]')) return;

    isPanningRef.current = true;
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
  }, []);

  // Node Drag Start Handler
  const handleNodeDragStart = useCallback((nodeId: string, e: React.MouseEvent) => {
    // Do not initiate drag if user clicked an interactive control (button, input, etc.)
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) {
      return;
    }

    // Crucial: prevent native text selection and HTML5 ghost-drag
    e.preventDefault();
    e.stopPropagation();

    const currentPos = nodePositionsRef.current[nodeId] || { x: 0, y: 0 };
    draggingNodeRef.current = {
      nodeId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startNodeX: currentPos.x,
      startNodeY: currentPos.y,
      hasMoved: false,
    };
    setActiveDraggingNodeId(nodeId);
  }, []);

  // Global MouseMove and MouseUp listeners for drag and pan
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 1. If currently dragging a node card
      if (draggingNodeRef.current) {
        const { nodeId, startMouseX, startMouseY, startNodeX, startNodeY } = draggingNodeRef.current;
        const rawDx = e.clientX - startMouseX;
        const rawDy = e.clientY - startMouseY;

        if (Math.hypot(rawDx, rawDy) > 3) {
          draggingNodeRef.current.hasMoved = true;
        }

        const z = zoomRef.current;
        const dx = rawDx / z;
        const dy = rawDy / z;

        setNodePositions((prev) => ({
          ...prev,
          [nodeId]: {
            x: Math.round(startNodeX + dx),
            y: Math.round(startNodeY + dy),
          },
        }));
        return;
      }

      // 2. If currently panning canvas
      if (isPanningRef.current) {
        const dx = e.clientX - panStartRef.current.mouseX;
        const dy = e.clientY - panStartRef.current.mouseY;
        setPan({
          x: Math.round(panStartRef.current.panX + dx),
          y: Math.round(panStartRef.current.panY + dy),
        });
      }
    };

    const handleMouseUp = () => {
      isPanningRef.current = false;
      draggingNodeRef.current = null;
      setActiveDraggingNodeId(null);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Node Click: only selects for inspector if the user did NOT drag the card
  const handleNodeClick = useCallback((node: SelectedNode) => {
    if (draggingNodeRef.current?.hasMoved) return;
    setSelectedNode(node);
  }, []);

  // Compute all visible connection lines (edges) with dynamic Bézier curves
  const edges = useMemo(() => {
    const list: Array<{
      id: string;
      fromId: string;
      toId: string;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      status: string;
      livePowerKw: number;
    }> = [];

    accounts.forEach((acc) => {
      const accId = `acc_${acc.account.id}`;
      const accPos = nodePositions[accId];
      if (!accPos || !expandedAccountIds.has(acc.account.id)) return;

      const accFromX = accPos.x + ACCOUNT_WIDTH;
      const accFromY = accPos.y + ACCOUNT_HEIGHT / 2;

      acc.plants.forEach((p) => {
        const plantId = `plant_${acc.account.id}_${p.plantKey}`;
        const plantPos = nodePositions[plantId];
        if (!plantPos) return;

        const plantToX = plantPos.x;
        const plantToY = plantPos.y + PLANT_HEIGHT / 2;

        list.push({
          id: `edge_${accId}_${plantId}`,
          fromId: accId,
          toId: plantId,
          fromX: accFromX,
          fromY: accFromY,
          toX: plantToX,
          toY: plantToY,
          status: p.status,
          livePowerKw: p.livePowerKw,
        });

        if (expandedPlantKeys.has(p.plantKey)) {
          const plantFromX = plantPos.x + PLANT_WIDTH;
          const plantFromY = plantPos.y + PLANT_HEIGHT / 2;

          p.inverters.forEach((inv) => {
            const invId = `inv_${acc.account.id}_${p.plantKey}_${inv.deviceSn}`;
            const invPos = nodePositions[invId];
            if (!invPos) return;

            const invToX = invPos.x;
            const invToY = invPos.y + INVERTER_HEIGHT / 2;

            list.push({
              id: `edge_${plantId}_${invId}`,
              fromId: plantId,
              toId: invId,
              fromX: plantFromX,
              fromY: plantFromY,
              toX: invToX,
              toY: invToY,
              status: inv.status,
              livePowerKw: inv.liveSolarPowerKw,
            });
          });
        }
      });
    });

    return list;
  }, [accounts, expandedAccountIds, expandedPlantKeys, nodePositions]);

  // Minimap calculation
  const minimapData = useMemo(() => {
    const keys = Object.keys(nodePositions);
    if (keys.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    keys.forEach((k) => {
      const p = nodePositions[k];
      if (!p) return;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + 320);
      maxY = Math.max(maxY, p.y + 170);
    });

    const padding = 200;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const mapW = maxX - minX;
    const mapH = maxY - minY;

    return { minX, minY, maxX, maxY, mapW, mapH };
  }, [nodePositions]);

  // Total visible node count
  const totalVisibleNodes = Object.keys(nodePositions).length;

  return (
    <div
      className={`relative w-full rounded-2xl border border-border/80 bg-slate-950/95 overflow-hidden select-none transition-all duration-300 shadow-xl ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none h-screen w-screen border-none'
          : 'h-[780px]'
      }`}
    >
      {/* Dynamic Cyber Dot Grid Canvas Background */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleCanvasMouseDown}
        style={{
          cursor: isPanningRef.current ? 'grabbing' : activeDraggingNodeId ? 'grabbing' : 'grab',
          backgroundImage: `radial-gradient(circle, rgba(255, 255, 255, 0.12) 1px, transparent 1px)`,
          backgroundSize: `${Math.max(12, Math.round(26 * zoom))}px ${Math.max(12, Math.round(26 * zoom))}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
        className="w-full h-full relative overflow-hidden"
      >
        {/* Transformable Canvas Layer */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          className="absolute inset-0 pointer-events-none"
        >
          {/* Dynamic Connected Lines Layer (SVG Edges) */}
          <svg className="absolute inset-0 w-[10000px] h-[10000px] overflow-visible pointer-events-none">
            <defs>
              <linearGradient id="edge-online" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="edge-standby" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#eab308" stopOpacity="0.6" />
              </linearGradient>
              <linearGradient id="edge-fault" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.9" />
              </linearGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {edges.map((edge) => {
              const dx = Math.max(60, Math.min(220, Math.abs(edge.toX - edge.fromX) * 0.5));
              const pathD = `M ${edge.fromX} ${edge.fromY} C ${edge.fromX + dx} ${edge.fromY}, ${edge.toX - dx} ${edge.toY}, ${edge.toX} ${edge.toY}`;
              const isFault = edge.status === 'FAULT';
              const isStandby = edge.status === 'STANDBY' || edge.livePowerKw === 0;
              const strokeColor = isFault
                ? 'url(#edge-fault)'
                : isStandby
                ? 'url(#edge-standby)'
                : 'url(#edge-online)';

              const pulseDuration = isFault ? 4 : Math.max(1.4, 4.5 - Math.min(3, edge.livePowerKw / 25));

              return (
                <g key={edge.id} className="transition-opacity duration-300">
                  {/* Outer glow line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isFault ? '#ef4444' : isStandby ? '#f59e0b' : '#10b981'}
                    strokeWidth="6"
                    strokeOpacity="0.15"
                    strokeLinecap="round"
                  />
                  {/* Core wire */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="2.5"
                    strokeDasharray={isStandby ? '6 4' : undefined}
                    strokeLinecap="round"
                    filter="url(#glow)"
                  />
                  {/* Animated Energy Flow Pulse (particle travelling along wire) */}
                  {!isFault && (
                    <circle r="3.5" fill={isStandby ? '#fbbf24' : '#34d399'}>
                      <animateMotion
                        path={pathD}
                        dur={`${pulseDuration}s`}
                        repeatCount="indefinite"
                        rotate="auto"
                      />
                    </circle>
                  )}
                  {/* Origin Port LED */}
                  <circle
                    cx={edge.fromX}
                    cy={edge.fromY}
                    r="4.5"
                    fill={isFault ? '#ef4444' : isStandby ? '#f59e0b' : '#10b981'}
                    stroke="#0f172a"
                    strokeWidth="2"
                  />
                  {/* Destination Port LED */}
                  <circle
                    cx={edge.toX}
                    cy={edge.toY}
                    r="4.5"
                    fill={isFault ? '#ef4444' : isStandby ? '#f59e0b' : '#06b6d4'}
                    stroke="#0f172a"
                    strokeWidth="2"
                  />
                </g>
              );
            })}
          </svg>

          {/* Draggable Node Cards (Pass-through container, individual cards are pointer-events-auto) */}
          <div className="absolute inset-0 pointer-events-none">
            {accounts.map((acc) => {
              const accId = `acc_${acc.account.id}`;
              const accPos = nodePositions[accId] || { x: 60, y: 60 };
              const isAccExp = expandedAccountIds.has(acc.account.id);
              const isDragging = activeDraggingNodeId === accId;
              const isSelected = selectedNode?.type === 'account' && selectedNode.data.account.id === acc.account.id;
              const accUtil =
                acc.capacityKw > 0 ? Math.min(100, (acc.livePowerKw / acc.capacityKw) * 100) : 0;

              return (
                <React.Fragment key={accId}>
                  {/* ACCOUNT NODE CARD */}
                  <div
                    data-node-card="true"
                    onMouseDown={(e) => handleNodeDragStart(accId, e)}
                    onClick={() => handleNodeClick({ type: 'account', data: acc })}
                    style={{
                      transform: `translate(${accPos.x}px, ${accPos.y}px)`,
                      width: `${ACCOUNT_WIDTH}px`,
                      zIndex: isDragging ? 50 : isSelected ? 35 : 20,
                    }}
                    className={`absolute rounded-2xl border pointer-events-auto cursor-grab active:cursor-grabbing transition-shadow duration-150 backdrop-blur-md ${
                      isSelected
                        ? 'border-primary shadow-[0_0_24px_rgba(59,130,246,0.4)] ring-2 ring-primary/60 bg-slate-900/95'
                        : isDragging
                        ? 'border-cyan-400/90 shadow-2xl scale-[1.02] bg-slate-900/95'
                        : 'border-slate-800 hover:border-slate-700 bg-slate-900/90 hover:shadow-lg'
                    }`}
                  >
                    {/* Node Header */}
                    <div className="p-3 pb-2 flex items-center justify-between border-b border-slate-800/80 rounded-t-2xl">
                      <div className="flex items-center gap-2 min-w-0">
                        <GripVertical size={14} className="text-slate-500 shrink-0" />
                        <div className="p-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          <Building2 size={13} />
                        </div>
                        <h3 className="font-bold text-xs text-slate-100 truncate">{acc.account.name}</h3>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono py-0 text-slate-400 border-slate-700 shrink-0">
                        Account
                      </Badge>
                    </div>

                    {/* Node Body */}
                    <div className="p-3 space-y-2.5">
                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                        <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800/60">
                          <span className="text-[9px] uppercase text-slate-500 block">Live Power</span>
                          <strong className="text-amber-400 text-xs font-bold">{acc.livePowerKw.toFixed(1)} kW</strong>
                        </div>
                        <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800/60">
                          <span className="text-[9px] uppercase text-slate-500 block">Capacity</span>
                          <strong className="text-slate-200 text-xs font-bold">{acc.capacityKw.toFixed(0)} kW</strong>
                        </div>
                      </div>

                      {/* Capacity Utilization Bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                          <span>Utilization</span>
                          <span className="text-emerald-400 font-bold">{accUtil.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full transition-all duration-300"
                            style={{ width: `${accUtil}%` }}
                          />
                        </div>
                      </div>

                      {/* Expand / Collapse Plants Child Branch */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-slate-500 font-mono">
                          {acc.plants.length} Connected Plants
                        </span>
                        <Button
                          variant={isAccExp ? 'secondary' : 'outline'}
                          size="xs"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => toggleAccount(acc.account.id, e)}
                          className="text-[10px] h-6 px-2 gap-1 cursor-pointer"
                        >
                          {isAccExp ? <ChevronUp size={12} /> : <ChevronRight size={12} />}
                          <span>{isAccExp ? 'Hide Plants' : 'Show Plants'}</span>
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* PLANTS NODES */}
                  {isAccExp &&
                    acc.plants.map((p) => {
                      const plantId = `plant_${acc.account.id}_${p.plantKey}`;
                      const plantPos = nodePositions[plantId] || { x: 440, y: 60 };
                      const isPlantExp = expandedPlantKeys.has(p.plantKey);
                      const isPlantDragging = activeDraggingNodeId === plantId;
                      const isPlantSelected =
                        selectedNode?.type === 'plant' && selectedNode.data.plantKey === p.plantKey;
                      const plantUtil =
                        p.capacityKw > 0 ? Math.min(100, (p.livePowerKw / p.capacityKw) * 100) : 0;
                      const isFault = p.status === 'FAULT';
                      const isStandby = p.status === 'STANDBY' || p.livePowerKw === 0;

                      return (
                        <React.Fragment key={plantId}>
                          {/* PLANT NODE CARD */}
                          <div
                            data-node-card="true"
                            onMouseDown={(e) => handleNodeDragStart(plantId, e)}
                            onClick={() =>
                              handleNodeClick({
                                type: 'plant',
                                data: p,
                                accountName: acc.account.name,
                                accountId: acc.account.id,
                              })
                            }
                            style={{
                              transform: `translate(${plantPos.x}px, ${plantPos.y}px)`,
                              width: `${PLANT_WIDTH}px`,
                              zIndex: isPlantDragging ? 50 : isPlantSelected ? 35 : 20,
                            }}
                            className={`absolute rounded-2xl border pointer-events-auto cursor-grab active:cursor-grabbing transition-shadow duration-150 backdrop-blur-md ${
                              isPlantSelected
                                ? 'border-emerald-500 shadow-[0_0_24px_rgba(16,185,129,0.4)] ring-2 ring-emerald-500/60 bg-slate-900/95'
                                : isPlantDragging
                                ? 'border-emerald-400/90 shadow-2xl scale-[1.02] bg-slate-900/95'
                                : 'border-slate-800 hover:border-slate-700 bg-slate-900/90 hover:shadow-lg'
                            }`}
                          >
                            {/* Plant Header */}
                            <div className="p-3 pb-2 flex items-center justify-between border-b border-slate-800/80 rounded-t-2xl">
                              <div className="flex items-center gap-2 min-w-0">
                                <GripVertical size={14} className="text-slate-500 shrink-0" />
                                <div className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  <Layers size={13} />
                                </div>
                                <h4 className="font-bold text-xs text-slate-100 truncate">
                                  {p.plant.stationName}
                                </h4>
                              </div>
                              <Badge
                                variant={isFault ? 'destructive' : isStandby ? 'warning' : 'success'}
                                className="text-[9px] font-mono py-0 gap-1 capitalize shrink-0"
                              >
                                <span
                                  className={`size-1.5 rounded-full ${
                                    isFault
                                      ? 'bg-destructive animate-ping'
                                      : isStandby
                                      ? 'bg-amber-400'
                                      : 'bg-emerald-400 animate-pulse'
                                  }`}
                                />
                                {p.status.toLowerCase()}
                              </Badge>
                            </div>

                            {/* Plant Body */}
                            <div className="p-3 space-y-2">
                              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                                <div className="bg-slate-950/60 p-1.5 rounded-xl border border-slate-800/60">
                                  <span className="text-[9px] uppercase text-slate-500 block">Live Output</span>
                                  <strong className="text-amber-400 text-xs font-bold">{p.livePowerKw.toFixed(1)} kW</strong>
                                </div>
                                <div className="bg-slate-950/60 p-1.5 rounded-xl border border-slate-800/60">
                                  <span className="text-[9px] uppercase text-slate-500 block">Today's Yield</span>
                                  <strong className="text-slate-200 text-xs font-bold">{p.dailyYieldKwh.toFixed(1)} kWh</strong>
                                </div>
                              </div>

                              {/* Capacity Bar */}
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                                  <span>Plant Load ({plantUtil.toFixed(0)}%)</span>
                                  <span className="text-slate-300 font-bold">{p.capacityKw.toFixed(0)} kW max</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                                  <div
                                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full transition-all duration-300"
                                    style={{ width: `${plantUtil}%` }}
                                  />
                                </div>
                              </div>

                              {/* Expand / Collapse Inverters */}
                              <div className="flex items-center justify-between pt-1">
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {p.inverters.length} Inverters
                                </span>
                                <Button
                                  variant={isPlantExp ? 'secondary' : 'outline'}
                                  size="xs"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => togglePlant(p.plantKey, e)}
                                  disabled={p.inverters.length === 0}
                                  className="text-[10px] h-6 px-2 gap-1 cursor-pointer"
                                >
                                  {isPlantExp ? <ChevronUp size={12} /> : <ChevronRight size={12} />}
                                  <span>{isPlantExp ? 'Hide Inverters' : 'Show Inverters'}</span>
                                </Button>
                              </div>
                            </div>
                          </div>

                          {/* INVERTER NODES */}
                          {isPlantExp &&
                            p.inverters.map((inv) => {
                              const invId = `inv_${acc.account.id}_${p.plantKey}_${inv.deviceSn}`;
                              const invPos = nodePositions[invId] || { x: 800, y: 60 };
                              const isInvDragging = activeDraggingNodeId === invId;
                              const isInvSelected =
                                selectedNode?.type === 'inverter' &&
                                selectedNode.data.deviceSn === inv.deviceSn;
                              const invUtil =
                                inv.ratedKw > 0
                                  ? Math.min(100, (inv.liveSolarPowerKw / inv.ratedKw) * 100)
                                  : 0;
                              const isInvFault = inv.status === 'FAULT';
                              const isInvStandby = inv.status === 'STANDBY' || inv.liveSolarPowerKw === 0;

                              return (
                                <div
                                  key={invId}
                                  data-node-card="true"
                                  onMouseDown={(e) => handleNodeDragStart(invId, e)}
                                  onClick={() =>
                                    handleNodeClick({
                                      type: 'inverter',
                                      data: inv,
                                      plantName: p.plant.stationName,
                                      stationId: String(p.plant.stationId),
                                      accountName: acc.account.name,
                                      accountId: acc.account.id,
                                    })
                                  }
                                  style={{
                                    transform: `translate(${invPos.x}px, ${invPos.y}px)`,
                                    width: `${INVERTER_WIDTH}px`,
                                    zIndex: isInvDragging ? 50 : isInvSelected ? 35 : 20,
                                  }}
                                  className={`absolute rounded-2xl border pointer-events-auto cursor-grab active:cursor-grabbing transition-shadow duration-150 backdrop-blur-md ${
                                    isInvSelected
                                      ? 'border-amber-500 shadow-[0_0_24px_rgba(245,158,11,0.4)] ring-2 ring-amber-500/60 bg-slate-900/95'
                                      : isInvDragging
                                      ? 'border-amber-400/90 shadow-2xl scale-[1.02] bg-slate-900/95'
                                      : 'border-slate-800 hover:border-slate-700 bg-slate-900/90 hover:shadow-lg'
                                  }`}
                                >
                                  {/* Inverter Header */}
                                  <div className="p-2.5 pb-2 flex items-center justify-between border-b border-slate-800/80 rounded-t-2xl">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <GripVertical size={13} className="text-slate-500 shrink-0" />
                                      <Cpu size={12} className="text-amber-400 shrink-0" />
                                      <span className="font-mono font-bold text-xs text-slate-100 truncate">
                                        {inv.deviceSn}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => onCopySn(inv.deviceSn, e)}
                                      className="p-0.5 text-slate-400 hover:text-slate-200 rounded cursor-pointer"
                                      title="Copy Serial Number"
                                    >
                                      {copiedSn === inv.deviceSn ? (
                                        <Check size={11} className="text-emerald-400" />
                                      ) : (
                                        <Copy size={11} />
                                      )}
                                    </button>
                                  </div>

                                  {/* Inverter Body */}
                                  <div className="p-2.5 space-y-2 text-[11px] font-mono">
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-400 text-[10px]">
                                        {inv.model || 'Inverter'} ({inv.ratedKw} kW)
                                      </span>
                                      <Badge
                                        variant={isInvFault ? 'destructive' : isInvStandby ? 'warning' : 'success'}
                                        className="text-[9px] font-mono py-0 gap-1 capitalize shrink-0"
                                      >
                                        <span
                                          className={`size-1.5 rounded-full ${
                                            isInvFault
                                              ? 'bg-destructive animate-ping'
                                              : isInvStandby
                                              ? 'bg-amber-400'
                                              : 'bg-emerald-400 animate-pulse'
                                          }`}
                                        />
                                        {inv.status.toLowerCase()}
                                      </Badge>
                                    </div>

                                    {/* Output Progress */}
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-slate-400">Live Yield</span>
                                        <span className="text-amber-400 font-bold">
                                          {inv.liveSolarPowerKw.toFixed(1)} kW ({invUtil.toFixed(0)}%)
                                        </span>
                                      </div>
                                      <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                                        <div
                                          className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full transition-all duration-300"
                                          style={{ width: `${invUtil}%` }}
                                        />
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5 border-t border-slate-800/60">
                                      <span>Day: <strong className="text-slate-200">{inv.dailyYieldKwh.toFixed(1)} kWh</strong></span>
                                      {inv.loggerSn && (
                                        <span className="flex items-center gap-1 text-[9px] text-slate-500 truncate max-w-[100px]" title={`Logger: ${inv.loggerSn}`}>
                                          <Radio size={9} /> {inv.loggerSn}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </React.Fragment>
                      );
                    })}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* FLOATING CANVAS HUD TOOLBAR */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-2 bg-slate-900/90 border border-slate-800/90 rounded-2xl p-1.5 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomIn}
            className="size-8 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer"
            title="Zoom In (Scroll Up)"
          >
            <ZoomIn size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomOut}
            className="size-8 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer"
            title="Zoom Out (Scroll Down)"
          >
            <ZoomOut size={15} />
          </Button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="px-2 py-1 text-xs font-mono font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
            title="Reset Zoom to 85%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <span className="text-slate-700">|</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleFitView}
            className="size-8 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer"
            title="Fit All Nodes in Viewport"
          >
            <Compass size={15} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAutoLayout}
            className="h-8 px-2.5 gap-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer"
            title="Auto-organize nodes into clean hierarchical tree"
          >
            <Workflow size={14} className="text-primary" />
            <span className="hidden sm:inline">Auto Layout</span>
          </Button>
        </div>

        <span className="text-slate-700">|</span>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={expandAll}
            className="text-[11px] h-7 px-2 text-slate-300 hover:text-white rounded-lg cursor-pointer"
            title="Expand All Branches"
          >
            Expand All
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={collapseAll}
            className="text-[11px] h-7 px-2 text-slate-300 hover:text-white rounded-lg cursor-pointer"
            title="Collapse to Root Accounts"
          >
            Collapse All
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="size-8 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </Button>
        </div>
      </div>

      {/* CANVAS HINT & STATS STRIP */}
      <div className="absolute bottom-4 left-4 z-30 flex items-center gap-3 bg-slate-900/85 border border-slate-800/80 rounded-xl px-3 py-1.5 text-[11px] font-mono text-slate-400 backdrop-blur-md shadow-lg pointer-events-none">
        <span className="flex items-center gap-1.5">
          <Move size={12} className="text-primary" /> Drag background to pan
        </span>
        <span>•</span>
        <span>Drag any card to reposition</span>
        <span>•</span>
        <span className="text-slate-300 font-semibold">{totalVisibleNodes} Nodes</span>
      </div>

      {/* MINIMAP RADAR */}
      {showMinimap && minimapData && (
        <div className="absolute bottom-4 right-4 z-30 w-44 h-32 bg-slate-900/90 border border-slate-800 rounded-2xl p-2 shadow-2xl backdrop-blur-md hidden sm:flex flex-col justify-between">
          <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 border-b border-slate-800/70 pb-1">
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> Radar
            </span>
            <button
              type="button"
              onClick={() => setShowMinimap(false)}
              className="text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              <X size={10} />
            </button>
          </div>

          <div className="relative w-full h-20 bg-slate-950/80 rounded-xl overflow-hidden border border-slate-800/50">
            {Object.keys(nodePositions).map((k) => {
              const p = nodePositions[k];
              if (!p) return null;
              const isAcc = k.startsWith('acc_');
              const isPlant = k.startsWith('plant_');

              const relX = ((p.x - minimapData.minX) / minimapData.mapW) * 100;
              const relY = ((p.y - minimapData.minY) / minimapData.mapH) * 100;

              return (
                <div
                  key={k}
                  style={{
                    left: `${Math.max(2, Math.min(94, relX))}%`,
                    top: `${Math.max(2, Math.min(94, relY))}%`,
                  }}
                  className={`absolute size-1.5 rounded-full ${
                    isAcc ? 'bg-blue-400' : isPlant ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[8.5px] font-mono text-slate-500 pt-0.5">
            <span className="text-blue-400">● Acc</span>
            <span className="text-emerald-400">● Plant</span>
            <span className="text-amber-400">● Inv</span>
          </div>
        </div>
      )}

      {!showMinimap && (
        <Button
          variant="outline"
          size="xs"
          onClick={() => setShowMinimap(true)}
          className="absolute bottom-4 right-4 z-30 bg-slate-900/90 text-[10px] text-slate-400 hover:text-white rounded-xl border-slate-800 cursor-pointer"
        >
          Show Radar
        </Button>
      )}

      {/* NODE TELEMETRY INSPECTOR DRAWER */}
      {selectedNode && (
        <div className="absolute top-0 right-0 bottom-0 w-full sm:w-[420px] bg-slate-900/95 border-l border-slate-800 shadow-2xl z-40 flex flex-col backdrop-blur-xl animate-in slide-in-from-right duration-200">
          {/* Drawer Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
            <div className="flex items-center gap-2">
              <div
                className={`p-1.5 rounded-xl ${
                  selectedNode.type === 'account'
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    : selectedNode.type === 'plant'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                {selectedNode.type === 'account' ? (
                  <Building2 size={16} />
                ) : selectedNode.type === 'plant' ? (
                  <Layers size={16} />
                ) : (
                  <Cpu size={16} />
                )}
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-100 truncate max-w-[240px]">
                  {selectedNode.type === 'account'
                    ? selectedNode.data.account.name
                    : selectedNode.type === 'plant'
                    ? selectedNode.data.plant.stationName
                    : selectedNode.data.deviceSn}
                </h3>
                <span className="text-[10px] font-mono text-slate-400 capitalize">
                  {selectedNode.type} Node Telemetry
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedNode(null)}
              className="size-8 text-slate-400 hover:text-white rounded-xl cursor-pointer"
            >
              <X size={16} />
            </Button>
          </div>

          {/* Drawer Content */}
          <div className="p-4 flex-1 overflow-y-auto space-y-4">
            {selectedNode.type === 'account' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center font-mono">
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="text-[9px] uppercase text-slate-500">Live Power</div>
                    <div className="text-sm font-bold text-amber-400 mt-0.5">
                      {selectedNode.data.livePowerKw.toFixed(1)} kW
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="text-[9px] uppercase text-slate-500">Harvest</div>
                    <div className="text-sm font-bold text-slate-100 mt-0.5">
                      {selectedNode.data.dailyYieldKwh.toFixed(1)} kWh
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="text-[9px] uppercase text-slate-500">Capacity</div>
                    <div className="text-sm font-bold text-slate-400 mt-0.5">
                      {selectedNode.data.capacityKw.toFixed(0)} kW
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/70">
                  <div className="text-xs font-bold text-slate-200 mb-2">Fleet Diurnal Curve</div>
                  <PlantSolarCurve
                    capacityKw={selectedNode.data.capacityKw}
                    livePowerKw={selectedNode.data.livePowerKw}
                    dailyYieldKwh={selectedNode.data.dailyYieldKwh}
                    demandKw={selectedNode.data.demandKw}
                    gridPowerKw={selectedNode.data.gridPowerKw}
                    historyPoints={telemetryHistory ?? undefined}
                    height={120}
                    className="w-full"
                    showLabels={true}
                  />
                </div>

                <div className="text-xs font-mono text-slate-400 space-y-1 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div>Account: <strong className="text-slate-200">{selectedNode.data.account.name}</strong></div>
                  <div>Registered Stations: <strong className="text-slate-200">{selectedNode.data.plants.length} Plants</strong></div>
                  <div>Hardware Matrix: <strong className="text-slate-200">{selectedNode.data.invertersCount} Inverter Nodes</strong></div>
                </div>
              </div>
            )}

            {selectedNode.type === 'plant' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center font-mono">
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="text-[9px] uppercase text-slate-500">Live Power</div>
                    <div className="text-sm font-bold text-amber-400 mt-0.5">
                      {selectedNode.data.livePowerKw.toFixed(1)} kW
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="text-[9px] uppercase text-slate-500">Harvest</div>
                    <div className="text-sm font-bold text-slate-100 mt-0.5">
                      {selectedNode.data.dailyYieldKwh.toFixed(1)} kWh
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="text-[9px] uppercase text-slate-500">Capacity</div>
                    <div className="text-sm font-bold text-slate-400 mt-0.5">
                      {selectedNode.data.capacityKw.toFixed(0)} kW
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/70">
                  <div className="text-xs font-bold text-slate-200 mb-2">Plant Solar Arc</div>
                  <PlantSolarCurve
                    capacityKw={selectedNode.data.capacityKw}
                    livePowerKw={selectedNode.data.livePowerKw}
                    dailyYieldKwh={selectedNode.data.dailyYieldKwh}
                    demandKw={selectedNode.data.demandKw}
                    gridPowerKw={selectedNode.data.gridPowerKw}
                    historyPoints={telemetryHistory ?? undefined}
                    height={120}
                    className="w-full"
                    showLabels={true}
                  />
                </div>

                <div className="text-xs font-mono text-slate-400 space-y-1 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div>Station: <strong className="text-slate-200">{selectedNode.data.plant.stationName}</strong></div>
                  <div>Parent Account: <strong className="text-slate-200">{selectedNode.accountName}</strong></div>
                  <div>Hardware Devices: <strong className="text-slate-200">{selectedNode.data.inverters.length} Inverters</strong></div>
                </div>
              </div>
            )}

            {selectedNode.type === 'inverter' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-center font-mono">
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="text-[9px] uppercase text-slate-500">Live Solar Output</div>
                    <div className="text-sm font-bold text-amber-400 mt-0.5">
                      {selectedNode.data.liveSolarPowerKw.toFixed(1)} kW
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="text-[9px] uppercase text-slate-500">Today's Harvest</div>
                    <div className="text-sm font-bold text-slate-100 mt-0.5">
                      {selectedNode.data.dailyYieldKwh.toFixed(1)} kWh
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/70">
                  <div className="text-xs font-bold text-slate-200 mb-2">Inverter Realtime Output</div>
                  <InverterSolarCurve
                    ratedKw={selectedNode.data.ratedKw}
                    liveSolarPowerKw={selectedNode.data.liveSolarPowerKw}
                    dailyYieldKwh={selectedNode.data.dailyYieldKwh}
                    height={75}
                    className="w-full"
                  />
                </div>

                <div className="text-xs font-mono text-slate-400 space-y-1.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div>Serial Number: <strong className="text-slate-100">{selectedNode.data.deviceSn}</strong></div>
                  <div>Model: <strong className="text-slate-300">{selectedNode.data.model || 'Deye Hybrid Inverter'}</strong></div>
                  <div>Rated Capacity: <strong className="text-slate-300">{selectedNode.data.ratedKw} kW</strong></div>
                  {selectedNode.data.status !== 'ONLINE' && (
                    <div>
                      Status:{' '}
                      <Badge
                        variant={selectedNode.data.status === 'FAULT' ? 'destructive' : 'warning'}
                        className="text-[9px] font-mono py-0 ml-1"
                      >
                        {selectedNode.data.status}
                      </Badge>
                    </div>
                  )}
                  {selectedNode.data.loggerSn && (
                    <div>Paired Logger: <strong className="text-slate-300">{selectedNode.data.loggerSn}</strong></div>
                  )}
                  <div>Location: <strong className="text-slate-300">{selectedNode.plantName}</strong></div>
                </div>

                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    onNavigateToDevice(
                      selectedNode.accountId,
                      selectedNode.stationId,
                      selectedNode.data.deviceSn,
                      '/hardware-telemetry'
                    );
                  }}
                  className="w-full gap-2 text-xs font-mono cursor-pointer"
                >
                  <Sliders size={13} />
                  <span>Open Full Hardware Telemetry Studio</span>
                  <ExternalLink size={13} />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
