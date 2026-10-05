# ADR-0003: Honest Telemetry Data Contracts and Model-Driven Simulation Flags

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Engineering Team
- **Consulted Skills:** `testing/mock-hunter`, `frontend/anti-ui-slop`

## Context and Problem Statement

In IoT and solar monitoring applications, systems often need fallback values when an inverter is offline, when API rate limits are reached, or when historical aggregation endpoints are unavailable. Presenting synthetic or hardcoded numbers (such as arbitrary efficiencies or fake curves) as live telemetry deceives operators and breaches telemetry integrity.

## Decision Drivers

- Transparent operational status (`isLive: false` on failures).
- Explicit identification of simulated data (`isModelSimulated: true`).
- Elimination of silent mock substitutions.

## Decision Outcome

1. **Explicit Simulation Flags:**
   - Whenever historical or diurnal data is computed mathematically rather than queried from live hardware, responses explicitly return `isLive: false` and `isModelSimulated: true` alongside an explanatory human-readable notice.
2. **Failure Transparency:**
   - If an account or inverter is unreachable, the system returns `isLive: false` and `status: 'OFFLINE'` instead of fabricating fake active power readings.
3. **Hardware Registers:**
   - Inverter telemetry prioritizes live register readings from `dataMap` (e.g. `InverterEfficiency`, `RadiatorTemperature`, `PowerFactor`, `TotalRunningHours`) over hardcoded nominal values.

### Consequences

- **Good:**
  - Operators immediately know whether numbers reflect real hardware or solar model predictions.
  - Test suites and mock-hunter audits pass with full transparency.
- **Bad:**
  - UI components must render appropriate indicator badges when data is model-simulated.
