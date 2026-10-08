# Runbook — Backup & Restore Drill (DSM gateway)

Scope: `deye-accounts.json` file leg + Directus leg of dual persistence (ADR-0006).
RPO target: file leg recovers to last atomic write; Directus is source of truth when reachable.
RTO target: < 15 min for file-leg restore by a single operator.

## File leg (drilled 2026-10-08 — evidence below)

1. Verify live file parses: `Get-Content deye-accounts.json -Raw | ConvertFrom-Json`
   must yield `.accounts` as an array.
2. Snapshot: `Copy-Item deye-accounts.json <offline-media>\dsm-backup-YYYYMMDD.json`
   - record `(Get-FileHash <backup> -Algorithm SHA256).Hash`.
3. Restore: stop the app, `Copy-Item <backup> deye-accounts.json`, re-hash and compare.
4. Residue check: `Get-ChildItem -Filter *.tmp.*` must return nothing (atomic tmp+rename
   in `FileAccountCache.saveAccountsToFile` cleans up on failure; orphans mean a crash
   mid-write — delete only after confirming the main file parses).
5. Restart app, confirm accounts page loads and station count matches pre-drill.

Drill record 2026-10-08: backup→restore byte-identical (SHA256
9D0ED4026633CE7FBE64CC362380507353B60FBAE787F34CA69AF52AD609BE76),
1 account parsed, 0 orphan tmp files. Pass.

## Directus leg (snapshot drilled 2026-10-08; restore stays manual)

1. Snapshot (read-only, drilled): `GET /items/iot_solar_accounts?limit=-1` with the static
   token → saved JSON with `exported_at`, count, items. Drill record: 2 items, SHA256
   B733F1DA42C9D620635034183ADBCE87BEEE114D03C03819CB97EE5C08881FD1. Snapshot lives
   OFF-repo (temp dir) — it contains `app_secret`/`password` fields, never commit it.
2. Restore (manual — writes to shared prod CMS, needs your go-ahead): re-import snapshot
   via Directus admin; then `POST /api/deye/accounts/sync` and confirm fleet totals match.
   Never hand-edit the Directus rows the poller writes.
3. Least privilege (open): this Directus hosts the whole ERP (700+ collections). The DSM
   token should hold read/write ONLY on `iot_solar_*` collections — verify in Directus
   admin → Roles → DSM role → collection scope. Today it can read everything.

## Rotation & audit (auth-skill boundary)

- `SESSION_SECRET` / `ADMIN_ACCESS_PIN` / Deye credentials: rotate on operator change or
  any suspected exposure; secrets live in env, never in logs (logger has no redaction —
  do not log account payloads).
