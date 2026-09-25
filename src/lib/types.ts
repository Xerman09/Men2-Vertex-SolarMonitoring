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

// ---------------------------------------------------------------------------
// Database Architecture Types (Normalized iot_solar_* Schema)
// ---------------------------------------------------------------------------

export interface SolarOrganization {
  id: number;
  uuid?: string;
  name: string;
  code?: string;
  contact_email?: string;
  contact_phone?: string;
  is_active: number | boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SolarUser {
  id: number;
  uuid?: string;
  org_id?: number | null;
  email: string;
  username: string;
  password_hash: string;
  full_name?: string;
  role: 'admin' | 'fleet_manager' | 'site_engineer' | 'consumer';
  is_active: number | boolean;
  last_login_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SolarDeyeCloudConfig {
  id: number;
  org_id?: number | null;
  profile_name: string;
  base_url: string;
  app_id: string;
  app_secret: string;
  account_email: string;
  account_password: string;
  cached_token?: string;
  token_expires_at?: string;
  rate_limit_max: number;
  rate_limit_used: number;
  status: 'OPTIMAL' | 'DEGRADED' | 'OFFLINE';
  last_checked_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SolarStationRecord {
  id: number;
  station_id: string;
  org_id?: number | null;
  deye_config_id?: number | null;
  name: string;
  installed_capacity_kw: number;
  address?: string;
  city?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  grid_type: '3-PHASE' | 'SINGLE-PHASE';
  is_active: number | boolean;
  last_synced_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SolarDeviceRecord {
  id: number;
  device_sn: string;
  station_id: string;
  device_type: 'INVERTER' | 'LOGGER' | 'BATTERY' | 'METER';
  name?: string;
  model?: string;
  rated_kw?: number;
  logger_sn?: string;
  firmware_version?: string;
  status: 'ONLINE' | 'STANDBY' | 'FAULT' | 'OFFLINE';
  last_seen_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SolarUserStationPermission {
  id: number;
  user_id: number;
  station_id: string;
  can_control: number | boolean;
  can_view_financials: number | boolean;
  created_at?: string;
}

export interface SolarInverterControlLog {
  id?: number;
  dispatched_at?: string;
  user_id?: number | null;
  station_id: string;
  device_sn: string;
  action: string;
  work_mode?: 'PEAK_SHAVING' | 'BATTERY_FIRST' | 'LOAD_FIRST' | 'SELLING_FIRST' | null;
  parameters_payload: Record<string, any> | string;
  status: 'PENDING' | 'SUCCESS' | 'REJECTED' | 'FAILED';
  upstream_code?: number | null;
  upstream_message?: string | null;
  client_ip?: string | null;
}

export interface SolarInverterAlarmRecord {
  id: number;
  device_sn: string;
  station_id: string;
  alarm_code: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  description?: string;
  is_resolved: number | boolean;
  triggered_at: string;
  resolved_at?: string;
}


