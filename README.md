# ☀️ VOSolar Monitoring System (DSM)

High-performance, enterprise solar operations dashboard and control platform for Deye Hybrid inverters, integrated with the official **DeyeCloud OpenAPI** (`developer.deyecloud.com`).

---

## ⚡ Core Platform Capabilities

1. **Live Energy Flow & Fleet Synoptics (`/`)**:
   - Interactive bidirectional power diagram: Solar PV (120 kWp) ➔ Deye Hybrid Inverter (98.4% Eff) ➔ Battery ESS (94.2% SOC) / Facility Load / Utility Grid (+27.7 kW Feed-in).
   - Real-time polling with in-flight request guards and automatic visibility-change pausing on background tabs.
   - Force Grid Charge and Zero-Export Limiter operational toggles.
   - Multi-station Fleet Matrix status table with real-time health indicators.

2. **Accounts & Node Registry (`/accounts`)**:
   - Multi-tenant DeyeCloud account management with auto-discovery of plants, inverters, and loggers.
   - Role-gated administration with tenant isolation and mass-assignment protection.
   - Atomic file persistence for account profiles and live metadata cache.

3. **Inverter & Electrical Telemetry (`/hardware-telemetry`)**:
   - MPPT String 1 & String 2 DC voltage, current, and wattage gauges.
   - 3-Phase AC voltage (230V ± 1.5V), current (156A), power factor (0.99 pf), and THD (1.64%).
   - Heatsink thermal telemetry and smart fan PWM control monitoring.
   - Inverter fault and diagnostic protection event stream.

4. **Yield Analytics & TOU Arbitrage (`/yield-arbitrage`)**:
   - 24-Hour Diurnal curve: Solar Production vs Facility Consumption.
   - Time-of-Use (TOU) tariff arbitrage model ($184.20 daily saved / $5,480 monthly projected).
   - Carbon offset index (14.8 Tons CO2e).
   - Daily / Weekly / Monthly historical generation ledger.

5. **Trigonometric & Harmonic Waveform Analytics (`/trigonometric-analytics`)**:
   - Fourier series harmonic decomposition ($k=1..3$) modeling diurnal solar curves and load ramp transients.
   - Peak insolation, waveform curvature, and mathematical fit metrics without synthetic client jitter.
   - High-performance Recharts rendering with static series animation toggles.

6. **DeyeCloud OpenAPI Gateway & Diagnostics (`/api-diagnostics`)**:
   - Live gateway ping latency test, SSL status, and 10,000 req/day quota gauge.
   - Interactive API Sandbox & Code Generator (cURL, Python `requests`, Node.js `axios`).
   - Request executor calling the server proxy with dynamic HTTP status and formatted JSON viewer.
   - Inverter Workmode Dispatcher (`PEAK_SHAVING`, `BATTERY_FIRST`, `LOAD_FIRST`, `SELLING_FIRST`) with session authorization and audit logging.

---

## 🛡️ Security Architecture & Hardening

- **Session Authentication & RBAC**: Inverter control (`/api/deye/control`) and account management (`/api/deye/accounts`) require valid HMAC-SHA256 authenticated sessions via `dsm_session` HttpOnly cookies or Bearer tokens.
- **Timing-Safe Cryptography**: User and administrator passwords use `scrypt` hashing with unique random salts and constant-time `timingSafeEqual` comparison.
- **SSRF Defense**: Regional endpoint base URLs are strictly validated against allowlisted HTTPS `*.deyecloud.com` domains; private RFC 1918, link-local, loopback, and cloud metadata IPs are rejected.
- **Rate Limiting**: Critical endpoints (`/api/auth/role`, `/api/deye/control`, `/api/deye/accounts`) enforce sliding-window IP rate limits.
- **CSRF & Origin Protection**: Mutative requests are verified against origin headers in edge middleware.
- **Concurrency Locks & Resilient Token Handling**: Upstream token requests share an active Promise lock to eliminate thundering herd requests, with automatic 401 token invalidation and single-retry capability.

---

## 🔐 Configuration & Environment Variables

Create a `.env.local` file based on `.env.example`:

```env
# Server Binding & Environment
PORT=3005
NODE_ENV=development
APP_SECRET=your_32_character_random_hex_secret_here

# DeyeCloud OpenAPI Credentials (Primary Account)
DEYE_BASE_URL=https://api.deyecloud.com
DEYE_APP_ID=your_app_id
DEYE_APP_SECRET=your_app_secret
DEYE_EMAIL=your_email@example.com
DEYE_PASSWORD=your_password
DEYE_DEFAULT_STATION_ID=SP_04
DEYE_DEFAULT_DEVICE_SN=2209X891104

# Master Administrator Access PIN
ADMIN_ACCESS_PIN=
```

> 🛡️ **Simulated Sandbox Fallback**: If live credentials are not provided, the application runs automatically in **Simulated Mode** with sample SunPeak telemetry, allowing immediate interface testing and development.

---

## 🚀 Quality Gates & Local Commands

```bash
# Start development server on port 3005 (localhost only by default)
npm run dev

# Run TypeScript strict typecheck
npm run typecheck

# Run Vitest unit test suite
npm test

# Check code formatting with Prettier
npm run format:check

# Format code with Prettier
npm run format

# Build Next.js production bundle
npm run build
```
