# VOSOLAR / DSM — Telemetry & Data Integrity Audit Punch List

This tracking document catalogs all identified data errors, synthetic/simulated formulas, hardcoded fallbacks, and calculation discrepancies across the codebase. As each item is resolved, its checkbox will be updated to `[x]`, verified against real DeyeCloud hardware telemetry, tested via automated test suites, and committed.

---

## Summary Checklist

| ID | Module / Area | Description | Status |
| :--- | :--- | :--- | :--- |
| **FIX-01** | Yield Arbitrage | Arbitrary `* 10` multiplier on Specific Yield shown as "Arbitrage ROI Score" | `[x] Completed` |
| **FIX-02** | Yield Arbitrage | Hardcoded 38% peak savings ratio for multi-day periods (WEEK/MONTH/YEAR) | `[ ] Pending` |
| **FIX-03** | Multi-Module | Conflicting CO₂ emission factors (0.70 vs 0.42 vs 0.83 kg/kWh) | `[ ] Pending` |
| **FIX-04** | Yield Arbitrage | Single-day 30x linear extrapolation for Projected Monthly Savings | `[ ] Pending` |
| **FIX-05** | Yield Arbitrage | Hardcoded 120 kW fallback capacity when plant/account capacity is unset | `[ ] Pending` |
| **FIX-06** | Yield Arbitrage | Hardcoded "without physical BESS storage" system mode string | `[ ] Pending` |
| **FIX-07** | Hardware Telemetry | Synthetic temperature additions (`heatsink + 6.6°C`, `ambient - 2°C`) | `[ ] Pending` |
| **FIX-08** | Hardware Telemetry | Hardcoded protection status strings ("ACTIVE & COMPLIANT", "0.0 mA", "0 DETECTED") | `[ ] Pending` |
| **FIX-09** | Deye Client | Hardcoded fallbacks (`98.4%` efficiency, `45°C` heatsink, `30°C` ambient, `0.99` PF, `1.5%` THD) | `[ ] Pending` |
| **FIX-10** | Energy Flow | Equal-split inverter power distribution (`plantSolarKw / inverters.length`) in drawer | `[ ] Pending` |
| **FIX-11** | Energy Flow | Proportional plant capacity scaling fallback when multi-plant summary is missing | `[ ] Pending` |
| **FIX-12** | Energy Flow | Hardcoded fallback of `100 kW` for unrated inverters | `[ ] Pending` |
| **FIX-13** | Energy Flow | Logger status ternary always resolving to `'ONLINE'` | `[ ] Pending` |
| **FIX-14** | Deye Client | Synthetic daily Performance Ratio (`specYield / 5.0`) & Peak Solar formulas | `[ ] Pending` |
| **FIX-15** | Deye Client | Hardcoded 82.0% monthly Performance Ratio in `getLiveMonthlyHistory` | `[ ] Pending` |
| **FIX-16** | Deye Client | Hardcoded USD tariff rates (`$0.36`, `$0.25`, `$0.24`, `$0.14`, `$0.12`) | `[ ] Pending` |
| **FIX-17** | Deye Client | Plant-to-inverter proportional curve scaling fallback when 0 device frames exist | `[ ] Pending` |
| **FIX-18** | Analytics Dashboard | Hardcoded 120 kWp scaling divisor in `AnalyticsDashboardPage` when `!historyIsLive` | `[ ] Pending` |
| **FIX-19** | Trigonometric Graph | Browser local clock used instead of Manila Time (`Asia/Manila` / UTC+8) | `[ ] Pending` |

---

## Detailed Item Breakdown

### 1. Yield Analytics & TOU Arbitrage (`src/app/yield-arbitrage/page.tsx`)

#### [x] FIX-01: Arbitrary `* 10` Multiplier on Specific Yield Presented as "Arbitrage ROI Score"
* **File & Lines**: [`src/app/yield-arbitrage/page.tsx#L446`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/yield-arbitrage/page.tsx#L446), [`#L463`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/yield-arbitrage/page.tsx#L463), [`#L476`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/yield-arbitrage/page.tsx#L476), [`#L619`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/yield-arbitrage/page.tsx#L619)
* **Problem**: The daily and monthly table rows and top KPI card calculate:
  ```typescript
  roiScore: d.solarYieldKwh > 0 ? `+${((d.solarYieldKwh / cap) * 10).toFixed(1)}%` : '--'
  ```
  Specific yield (kWh/kWp, e.g. 3.2 hours) was multiplied by an arbitrary factor of 10 and displayed with a `+` and `%` symbol (e.g. `+32.0%`) as an "Arbitrage ROI Score".
* **Resolution**: Replaced the fabricated percentage with authentic Specific Yield (`kWh/kWp`), renamed the table column to `Specific Yield`, and wired the top KPI card to display genuine specific yield (`(todayYieldKwh / targetCapacityKw).toFixed(2) kWh/kWp`) without synthetic multipliers.

---

#### [ ] FIX-02: Hardcoded 38% Peak Savings Ratio for Multi-Day Ranges (WEEK/MONTH/YEAR)
* **File & Lines**: [`src/app/yield-arbitrage/page.tsx#L320`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/yield-arbitrage/page.tsx#L320), [`#L347`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/yield-arbitrage/page.tsx#L347)
* **Problem**: In `WEEK`, `MONTH`, and `YEAR` views, peak savings are hardcoded as:
  ```typescript
  peakSavedPhp: totalSavingsPhp * 0.38
  ```
  It assumes exactly 38% of solar production occurs during peak hours regardless of season, weather, or real interval generation.
* **Proposed Fix**: Aggregate authentic peak vs off-peak interval savings from available intraday records or remove the simulated sub-metric if interval breakdown is unavailable for broad multi-month ranges.

---

#### [ ] FIX-03: Conflicting CO₂ Emission Factors Across Modules
* **File & Lines**:
  * [`src/app/yield-arbitrage/page.tsx#L427`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/yield-arbitrage/page.tsx#L427): Uses `0.0007 tons/kWh` (**0.70 kg/kWh**).
  * [`src/app/yield-arbitrage/page.tsx#L705`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/yield-arbitrage/page.tsx#L705): Tooltip text states **0.42 kg CO₂/kWh** (Philippine regional grid factor).
  * [`src/app/analytics/page.tsx#L933`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/analytics/page.tsx#L933): Uses `0.83 kg CO₂/kWh`.
  * [`src/lib/deye-client.ts#L1907`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/lib/deye-client.ts#L1907): Uses `0.83 kg CO₂/kWh`.
* **Problem**: Three conflicting emission factors exist across the platform, causing different pages to show widely diverging carbon offset figures for the identical kWh harvest.
* **Proposed Fix**: Standardize platform-wide on the official Philippine Department of Energy (DOE) / ERC Grid Emission Factor (**0.7122 kg CO₂/kWh** or **0.42 kg CO₂/kWh** per Luzon-Visayas-Mindanao grid benchmark) and synchronize calculations and tooltip prose.

---

#### [ ] FIX-04: Single-Day 30x Linear Extrapolation for Projected Monthly Savings
* **File & Lines**: [`src/app/yield-arbitrage/page.tsx#L418`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/yield-arbitrage/page.tsx#L418)
* **Problem**: In `DAY` view:
  ```typescript
  const monthlyProjection = totalSavingsPhp * 30;
  ```
  Directly multiplies a single day's monetary savings by 30. A stormy day projects an artificially dismal monthly ledger, while a clear day projects an impossibly high one.
* **Proposed Fix**: Use a 7-day or 30-day trailing rolling average when historical series is available, or clearly label the single-day calculation as "Single-Day Extrapolated Run-Rate".

---

#### [ ] FIX-05: Hardcoded 120 kW Fallback Capacity
* **File & Lines**: [`src/app/yield-arbitrage/page.tsx#L136`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/yield-arbitrage/page.tsx#L136), [`#L140`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/yield-arbitrage/page.tsx#L140), [`#L148`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/yield-arbitrage/page.tsx#L148), [`#L150`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/yield-arbitrage/page.tsx#L150), [`#L432`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/yield-arbitrage/page.tsx#L432), [`#L619`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/yield-arbitrage/page.tsx#L619)
* **Problem**: Multiple fallbacks default to `120 kW` when capacity is 0 or unset, distorting calculations for smaller commercial stations (such as Men 2 Office's 100 kW plant).
* **Proposed Fix**: Ground all capacity resolutions in genuine account/plant configurations and never assume a 120 kW default.

---

#### [ ] FIX-06: Hardcoded "Without Physical BESS Storage" System Mode String
* **File & Lines**: [`src/app/yield-arbitrage/page.tsx#L673`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/yield-arbitrage/page.tsx#L673)
* **Problem**: The tooltip description statically states "Grid-tied solar inverter synchronized without physical BESS storage", even if battery hardware is added to a plant.
* **Proposed Fix**: Dynamically check `hasBattery` / battery telemetry to render whether BESS storage is active or grid-tied only.

---

### 2. Hardware Telemetry & Modbus Registers (`src/app/hardware-telemetry/page.tsx` & `src/lib/deye-client.ts`)

#### [ ] FIX-07: Synthetic Temperature Calculations in Thermal Matrix
* **File & Lines**: [`src/app/hardware-telemetry/page.tsx#L610`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/hardware-telemetry/page.tsx#L610), [`#L643`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/hardware-telemetry/page.tsx#L643)
* **Problem**: Fabricates temperatures for unmeasured components:
  ```typescript
  // Transformer Core:
  telemetry?.heatsinkTempC ? `${(telemetry.heatsinkTempC + 6.6).toFixed(1)}°C` : '--'

  // Battery Core Temp:
  telemetry?.ambientTempC ? `${(telemetry.ambientTempC - 2).toFixed(1)}°C` : '--'
  ```
* **Proposed Fix**: Remove synthetic temperature math. Only display genuine sensor readings from Deye modbus registers; display `--` if a sensor is physically absent.

---

#### [ ] FIX-08: Hardcoded Safety Alarms & Protection Status Strings
* **File & Lines**: [`src/app/hardware-telemetry/page.tsx#L657-L665`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/hardware-telemetry/page.tsx#L657-L665)
* **Problem**: Card displays static strings:
  * `Grid Anti-Islanding: ACTIVE & COMPLIANT`
  * `GFCI Ground Fault: 0.0 mA (NORMAL)`
  * `Active Fault Alarms: 0 DETECTED`
  None of these connect to actual fault registers or alarms from DeyeCloud.
* **Proposed Fix**: Wire these indicators to real `activeFaults` array and modbus protection flags from `InverterTelemetry`, or mark unmonitored sensors honestly.

---

#### [ ] FIX-09: Synthetic Fallback Defaults in `deye-client.ts`
* **File & Lines**: [`src/lib/deye-client.ts#L1167-L1170`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/lib/deye-client.ts#L1167-L1170)
* **Problem**: In `getInverterTelemetry`, when DeyeCloud does not return specific modbus registers, it injects optimistic static values:
  ```typescript
  efficiencyPct: rawEfficiency ? parseFloat(rawEfficiency) : 98.4,
  heatsinkTempC: rawHeatsink ? parseFloat(rawHeatsink) : 45.0,
  ambientTempC: rawAmbient ? parseFloat(rawAmbient) : 30.0,
  powerFactor: rawPF ? parseFloat(rawPF) : 0.99,
  thdPct: rawTHD ? parseFloat(rawTHD) : 1.5,
  ```
* **Proposed Fix**: Return `0` or `null` for unmeasured registers so the UI can honestly display `--` instead of fabricated operating conditions.

---

### 3. Live Energy Flow (`src/app/energy-flow/page.tsx`)

#### [ ] FIX-10: Equal-Split Inverter Distribution in Bottom Drawer
* **File & Lines**: [`src/app/energy-flow/page.tsx#L259-L260`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/energy-flow/page.tsx#L259-L260)
* **Problem**: In the Energy Flow drawer, inverter nodes calculate power using:
  ```typescript
  const kwPerInv = plantSolarKw / (inverters.length || 1);
  const dailyYieldPerInv = plantDailyKwh / (inverters.length || 1);
  ```
  Instead of reading each inverter's genuine hardware wattage (as the Fleet view does), it evenly splits plant power across all inverters.
* **Proposed Fix**: Connect drawer nodes to authentic batch device telemetry (`batchData.get(deviceSn)`) so individual inverters show their true production.

---

#### [ ] FIX-11: Proportional Plant Capacity Scaling Fallback
* **File & Lines**: [`src/app/energy-flow/page.tsx#L239`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/energy-flow/page.tsx#L239), [`#L245`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/energy-flow/page.tsx#L245)
* **Problem**: If `plantsSummary` is missing, it estimates plant solar with:
  ```typescript
  ((plant.installedCapacityKw || 100) / (selectedAccount.capacityKw || 100)) * (json.data?.liveSolarPowerKw || 0)
  ```
* **Proposed Fix**: Disallow synthetic cross-plant scaling; display 0 or honest empty states when scoped plant telemetry is unavailable.

---

#### [ ] FIX-12: Hardcoded Fallback of 100 kW for Unrated Inverters
* **File & Lines**: [`src/app/energy-flow/page.tsx#L1805`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/energy-flow/page.tsx#L1805), [`#L1923`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/energy-flow/page.tsx#L1923)
* **Problem**: `SN: {node.deviceSn} · {node.ratedKw ? `${node.ratedKw} kW` : '100 kW'}` defaults to `100 kW` for any inverter missing an explicit rating.
* **Proposed Fix**: Resolve rated power from hardware registers (`RatedPower`) or fallback to `50 kW` / plant capacity division.

---

#### [ ] FIX-13: Logger Status Ternary Bug Always Resolving to 'ONLINE'
* **File & Lines**: [`src/app/energy-flow/page.tsx#L279`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/app/energy-flow/page.tsx#L279)
* **Problem**:
  ```typescript
  loggerStatus: matchingLogger?.status || (plantSummary?.status === 'ONLINE' ? 'ONLINE' : 'ONLINE')
  ```
  Both branches of the ternary return `'ONLINE'`.
* **Proposed Fix**: Correct to `(plantSummary?.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE')` or pass matching logger status accurately.

---

### 4. Historical Analytics & Aggregator Math (`src/lib/deye-client.ts` & `src/app/analytics/page.tsx`)

#### [ ] FIX-14: Synthetic Daily Performance Ratio & Peak Solar Formulas
* **File & Lines**: [`src/lib/deye-client.ts#L1891`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/lib/deye-client.ts#L1891), [`#L1903`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/lib/deye-client.ts#L1903)
* **Problem**:
  ```typescript
  const pr = rec.solar > 0 ? Number(Math.min(95, Math.max(40, (specYield / 5.0) * 100)).toFixed(1)) : 0;
  peakSolarKw: Number((safeCapacity * Math.min(1, specYield / 5.2)).toFixed(1))
  ```
  Synthesizes Performance Ratio and peak power from specific yield multipliers instead of measuring actual peak intervals.
* **Proposed Fix**: Derive peak solar kW directly from the maximum recorded interval in the intraday dataset.

---

#### [ ] FIX-15: Hardcoded 82.0% Monthly Performance Ratio
* **File & Lines**: [`src/lib/deye-client.ts#L1994`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/lib/deye-client.ts#L1994)
* **Problem**:
  ```typescript
  performanceRatioPct: rec.solarKwh > 0 ? 82.0 : 0
  ```
  Every single month with generation reports an identical `82.0%` PR.
* **Proposed Fix**: Calculate monthly PR from actual solar yield divided by expected capacity-weighted yield, or display `--` when irradiance data is not present.

---

#### [ ] FIX-16: Hardcoded USD Tariff Rates in Core Client
* **File & Lines**: [`src/lib/deye-client.ts#L1368`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/lib/deye-client.ts#L1368), [`#L1906`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/lib/deye-client.ts#L1906), [`#L1996`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/lib/deye-client.ts#L1996)
* **Problem**: Intraday points embed `tariffRateUsd: 0.36 / 0.14`, and historical summaries calculate `savingsUsd` using `$0.25 / $0.12` and `$0.24`, conflicting with the Philippine Peso standard.
* **Proposed Fix**: Remove or align these legacy USD calculations with `useTariff` rates in Philippine Peso (`₱` / PHP).

---

#### [ ] FIX-17: Plant-to-Inverter Proportional Curve Fallback
* **File & Lines**: [`src/lib/deye-client.ts#L1764-L1790`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/lib/deye-client.ts#L1764-L1790)
* **Problem**: When `/v1.0/device/history` returns 0 frames for an inverter, `getLiveDayHistory` scales down the plant's history by `inverterCapacity / plantCapacity` to simulate an inverter curve.
* **Proposed Fix**: Return clean empty states (0 frames) when device telemetry is unavailable, adhering strictly to the `AGENTS.md` rule against synthetic scope scaling.

---

#### [ ] FIX-18: Hardcoded 120 kWp Scaling Divisor in Analytics Dashboard
* **File & Lines**: [`src/app/analytics/page.tsx#L754-L756`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar Monitoring/DSM/src/app/analytics/page.tsx#L754-L756)
* **Problem**:
  ```typescript
  if (effectiveCapacityKw && effectiveCapacityKw > 0) {
    return Number((effectiveCapacityKw / 120).toFixed(4));
  }
  ```
  When `historyIsLive` is false, it scales historical curves by `/ 120`.
* **Proposed Fix**: Drop the `/ 120` scaling; display honest zero/empty states when live telemetry is unavailable.

---

### 5. Client Timezone Offset (`src/components/analytics/useTrigonometricGraph.ts`)

#### [ ] FIX-19: Browser Local Clock Used Instead of Manila Time
* **File & Lines**: [`src/components/analytics/useTrigonometricGraph.ts#L120-L121`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/components/analytics/useTrigonometricGraph.ts#L120-L121), [`#L226-L228`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/components/analytics/useTrigonometricGraph.ts#L226-L228), [`#L268-L270`](file:///c:/Users/admin/Documents/Work%20Men2/Iot/Iot%20System/Deye%20Solar%20Monitoring/DSM/src/components/analytics/useTrigonometricGraph.ts#L268-L270)
* **Problem**: Uses `new Date().getHours()` and `new Date().getMinutes()`, reading the user's browser local time instead of Philippine Standard Time (`Asia/Manila` / UTC+8).
* **Proposed Fix**: Replace with `getManilaNowParts()` and `getManilaToday()` from `@/lib/manila-time`.

