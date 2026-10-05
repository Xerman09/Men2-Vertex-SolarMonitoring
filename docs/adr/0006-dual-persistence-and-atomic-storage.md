# ADR-0006: Dual Directus Relational Persistence with Atomic File Cache Fallback

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Engineering Team
- **Consulted Skills:** `backend/nodejs-backend-patterns`, `devops/database-backups`

## Context and Problem Statement

The solar monitoring system operates in diverse environments, ranging from cloud deployments with a connected Directus relational database (`iot_solar_*` tables) to edge gateway hardware operating offline or during database network interruptions. We require persistent account and configuration data with zero file corruption risks during sudden power losses or concurrent writes.

## Decision Drivers

- Zero file corruption on partial writes or process crashes.
- Seamless fallback when Directus is offline or booting.
- Support for containerized environments with custom volume mount points (`DSM_DATA_DIR`).

## Decision Outcome

1. **Dual Persistence Model:**
   - Primary: Normalized Directus tables (`iot_solar_deye_cloud_configs`, `iot_solar_stations`, `iot_solar_devices`, `iot_solar_users`, `iot_solar_inverter_control_logs`).
   - Secondary / Cache: Local JSON configuration file (`deye-accounts.json`).
2. **Atomic Write Discipline:**
   - File updates write the full serialized payload to a temporary file (`deye-accounts.json.tmp.<timestamp>`) and execute `fs.renameSync` to atomically overwrite the destination.
   - Prevents partial or corrupt reads if power is interrupted during disk writes.
3. **Environment Directory Override:**
   - Supports `DSM_DATA_DIR` environment variable, enabling container deployments to mount data into dedicated persistent storage volumes rather than the application working directory.

### Consequences

- **Good:**
  - High resilience: The application boots cleanly even if Directus is temporarily down.
  - No corrupted JSON files on sudden restarts or crashes.
- **Bad:**
  - Directus updates and file cache must periodically sync (`syncWithDirectus(force)`).
