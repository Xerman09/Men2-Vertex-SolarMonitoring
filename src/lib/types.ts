export interface PlantTelemetrySummary {
  stationId: string;
  stationName: string;
  capacityKw: number;
  liveSolarPowerKw: number;
  dailyYieldKwh: number;
  totalYieldMwh: number;
  batterySoc: number;
  batteryPowerKw: number;
  gridPowerKw: number;
  loadPowerKw: number;
  status: 'ONLINE' | 'OFFLINE' | 'ALARM';
  lastUpdated: string;
}

export interface StationSummary {
  stationId: string;
  name: string;
  capacityKw: number;
  liveSolarPowerKw: number;
  dailyYieldKwh: number;
  totalYieldMwh: number;
  batterySoc: number;
  batteryPowerKw: number; // positive = charging, negative = discharging
  gridPowerKw: number; // positive = exporting/feed-in, negative = importing
  loadPowerKw: number;
  status: 'ONLINE' | 'OFFLINE' | 'ALARM';
  lastUpdated: string;
  plantsSummary?: PlantTelemetrySummary[];
}

export interface MPPTStringData {
  stringId: string;
  voltageV: number;
  currentA: number;
  powerKw: number;
}

export interface PhaseData {
  phase: 'L1' | 'L2' | 'L3';
  voltageV: number;
  currentA: number;
  frequencyHz: number;
}

export interface InverterTelemetry {
  deviceSn: string;
  model: string;
  firmwareVersion: string;
  connectionStatus: 'ONLINE' | 'STANDBY' | 'FAULT';
  efficiencyPct: number;
  heatsinkTempC: number;
  ambientTempC: number;
  powerFactor: number;
  thdPct: number;
  gridFrequencyHz: number;
  mpptStrings: MPPTStringData[];
  phases: PhaseData[];
  totalActivePowerKw: number;
  totalReactivePowerKvar: number;
  todayEnergyKwh: number;
  totalEnergyMwh: number;
  runningHours: number;
  activeWorkMode: 'PEAK_SHAVING' | 'BATTERY_FIRST' | 'LOAD_FIRST' | 'SELLING_FIRST';
  gridChargeEnabled: boolean;
  activeFaults: InverterAlarm[];
}

export interface InverterAlarm {
  id: string;
  code: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  description: string;
  timestamp: string;
  resolved: boolean;
}

export interface HourlyEnergyPoint {
  hour: string; // e.g. "06:00"
  solarYieldKw: number | null;
  loadDemandKw: number | null;
  batteryFlowKw: number | null; // positive charging, negative discharging
  gridFlowKw: number | null; // positive export, negative import
  gridExportKw?: number | null;
  tariffRateUsd: number;
  isElapsed?: boolean;
}

export interface ApiHealthMetrics {
  gatewayUrl: string;
  region: string;
  isLive: boolean;
  status: 'OPTIMAL' | 'DEGRADED' | 'OFFLINE';
  pingMs: number;
  rateLimitUsed: number;
  rateLimitMax: number;
  tokenExpiresAt: string | null;
  lastChecked: string;
}

export interface DeviceInfo {
  deviceSn: string;
  deviceType: 'INVERTER' | 'LOGGER' | 'METER' | 'BATTERY';
  name: string;
  model?: string;
  ratedKw?: number;
  loggerSn?: string;
  status: 'ONLINE' | 'STANDBY' | 'FAULT' | 'OFFLINE';
  lastSeen?: string;
}

export interface PlantInfo {
  stationId: string;
  stationName: string;
  installedCapacityKw: number;
  address?: string;
  liveSolarPowerKw?: number;
  dailyYieldKwh?: number;
  gridPowerKw?: number;
  consumptionPowerKw?: number;
  devices: DeviceInfo[];
}

export interface InverterConfig {
  sn: string;
  name: string;
  model: string;
  ratedKw: number;
}

export interface DeyeAccountConfig {
  id: string;
  directusId?: number | string;
  name: string;
  enabled: boolean;
  admin?: boolean;
  baseUrl?: string;
  appId: string;
  appSecret: string;
  email: string;
  password: string;
  defaultStationId?: string;
  defaultDeviceSn?: string;
  autoDiscovered?: boolean;
  lastSyncedAt?: string;
  plants?: PlantInfo[];
  inverters?: InverterConfig[];
  source?: 'directus' | 'cache' | 'env';
}

export interface AccountSummary {
  id: string;
  directusId?: number | string;
  name: string;
  email?: string;
  enabled?: boolean;
  admin?: boolean;
  isLive: boolean;
  stationCount: number;
  deviceCount: number;
  inverterCount: number;
  loggerCount: number;
  liveSolarPowerKw: number;
  dailyYieldKwh: number;
  gridPowerKw?: number;
  consumptionPowerKw?: number;
  capacityKw: number;
  status: 'ONLINE' | 'OFFLINE' | 'ALARM' | 'SIMULATED';
  lastPingMs: number;
  plants: PlantInfo[];
  autoDiscovered?: boolean;
  lastSyncedAt?: string;
  source?: 'directus' | 'cache' | 'env';
}

export interface FleetMatrixNode {
  accountId: string;
  accountName: string;
  stationName: string;
  stationId: string;
  deviceSn: string;
  deviceType: 'INVERTER' | 'LOGGER' | 'METER' | 'BATTERY';
  model: string;
  ratedKw?: number;
  loggerSn?: string;
  loggerStatus?: 'ONLINE' | 'STANDBY' | 'FAULT' | 'OFFLINE';
  liveSolarPowerKw: number;
  dailyYieldKwh?: number;
  gridPowerKw?: number;
  consumptionPowerKw?: number;
  batterySoc: number;
  mode: string;
  status: 'ONLINE' | 'STANDBY' | 'FAULT' | 'OFFLINE';
  isLive: boolean;
}

export interface AggregatedFleetSummary {
  totalAccounts: number;
  activeAccounts: number;
  totalPlants: number;
  totalInverters: number;
  totalLoggers: number;
  totalCapacityKw: number;
  totalSolarPowerKw: number;
  totalDailyYieldKwh: number;
  totalLifetimeYieldMwh: number;
  avgBatterySoc: number;
  totalBatteryPowerKw: number;
  netGridPowerKw: number;
  totalLoadPowerKw: number;
  accounts: AccountSummary[];
  nodes: FleetMatrixNode[];
  isLive: boolean;
  lastUpdated: string;
}

