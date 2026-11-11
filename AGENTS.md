<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# VOSOLAR / Deye Solar Monitoring (DSM) — Agent Engineering & UI/UX Standards

This document codifies project preferences, architectural rules, and strict UI/UX design standards derived from the codebase evolution and git history. Any agent generating or modifying code in this repository **must strictly adhere** to these guidelines.

---

## 1. UI/UX Design Philosophy & Removal Patterns

A primary recurring pattern in user reviews and refactor commits is **aggressive decluttering, high signal-to-noise ratio, and elimination of visual bloat**. The user prefers minimal, professional, high-density telemetry dashboards over chatty or decorative interfaces.

### Core Principles

### A. Progressive Disclosure over Explanatory Bloat
* **Rule**: Never place long explanatory paragraphs, helper sentences, calculation formulas, or technical descriptions directly on card faces, banners, or modal bodies.
* **Pattern**:
  - Keep visible text strictly to concise titles, primary metrics, units, and active controls.
  - Move descriptions, regional coverage details, net-metering math, and sync statuses into contextual hover tooltips (`HoverInfo` from `@/components/ui/tooltip`).
  - *Git history reference*: `refactor(energy-flow): move helper statements from card faces to hover tooltips` (`7d216e2`), `refactor(energy-flow): move power flow description and sync status to title hover tooltip` (`b467779`), and `refactor(tariff): minimalize tariff configuration UI` (`940b3b5`).

### B. Eliminate "Badge Soup" & Unnecessary Pills
* **Rule**: Do not add decorative pills, redundant status tags, or acronym labels next to titles, buttons, or card headers.
* **Guidelines**:
  - **No redundant status pills**: Avoid tagging items with badges like `Auto`, `Custom`, or rate tags (`₱10.20 / ₱13.90`) in modal headers or quick-action buttons when the state is obvious or cleanly stated in prose.
  - **No brand acronym clutter**: Use clean brand names (e.g., `VOSOLAR`, not `VOSOLAR (VOS)`).
  - **When to use badges**: Badges are strictly reserved for actionable operational states, critical errors, faults, or genuine device health alerts (e.g., `Offline`, `Fault`, `Warning`).
  - *Git history reference*: `refactor(tariff): remove redundant badge pills` (`940b3b5`) and `remove (VOS) badge from sidebar branding` (`9a83ec9`).

### C. Zero "AI Slop" & No Fake/Synthetic Controls
* **Rule**: Never introduce speculative interactive controls, synthetic/simulated charts, or dummy toggle features that do not connect to real DeyeCloud hardware telemetry.
* **Guidelines**:
  - Eliminate fake switches (e.g. simulated force-charge or export limiter toggles without confirmed hardware support).
  - Do not add theoretical or synthetic mathematical views (e.g. harmonic Fourier/polar charts or simulated trigonometric overlays) unless backed by real inverter telemetry and explicitly requested.
  - Focus exclusively on real, verified inverter telemetry and tangible solar KPIs.
  - *Git history reference*: `refactor(energy-flow): clean up AI slop, fake controls, and tooltip overload` (`39780d6`), `refactor(analytics): remove synthetic math tabs and fake simulation charts` (`f764078`), and `feat(navigation): remove trigonometric analytics tab` (`04d7a76`).

### D. Direct Interaction & Clean Container Hierarchy
* **Rule**: Prefer making containers directly clickable rather than adding redundant buttons or nested action bars.
* **Guidelines**:
  - Make entire card components directly clickable for toggling or selection; do not clutter cards with dedicated "Expand", "View Details", or "Telemetry" buttons.
  - Keep modal and card headers clean: Icon + Title on the left, close button (`X`) on the right. Do not crowd the header with badges, subtitle descriptions, or secondary pills.
  - Remove redundant footer widgets or status bars that duplicate information visible elsewhere.
  - Remove decorative encircled `<Info>` icons next to main page titles (`d777b01`).
  - *Git history reference*: `fix(fleet): remove expand buttons, make cards directly clickable` (`1b19e9d`), `fix(sidebar): remove redundant footer telemetry` (`79eea9e`), and `refactor(fleet): remove redundant footer status bar` (`07757f0`).

### E. Compact, Uniform Proportions & Typography
* **Rule**: Maintain tight, balanced spacing and cohesive alignment across layouts.
* **Guidelines**:
  - Align KPI cards into uniform widths and consistent vertical rails/grids.
  - Avoid excessive vertical padding or empty gaps between count chips, headers, and chart canvases.
  - Typography scale: Use compact, readable typography (`text-xs`, `text-sm`, font-mono for numeric readings) with crisp tracking. Avoid oversized subtitles.
  - *Git history reference*: `refactor(energy-flow): make 3 power flow sink nodes uniform width` (`f2a93ac`), `fix(fleet): remove excessive vertical gap` (`3b709aa`), and `style(ui): compact font scale across fleet curves, charts, header` (`9c638b8`).

### F. Explicit Context & Philippine Localization
* **Rule**: Always ground calculations, scope titles, and currencies in real context.
* **Guidelines**:
  - **Dynamic scope titles**: Always explicitly display which scope is active (e.g., Monitored Account, Plant Name, or Inverter Serial Number) instead of generic text like "Diurnal Curve" (`d777b01`, `7fc1745`).
  - **Currency**: Standardize strictly on Philippine Peso (`₱` / PHP) for all tariffs, financial yield, and energy savings calculations (`ed0133c`).
  - **Utilities**: Pre-populate Philippine distribution utilities (DECORP Dagupan, MERALCO, VECO, Davao Light, etc.) with automatic geolocation detection from plant address.

---

## 2. Quick UI Review Checklist for Agents

Before concluding any UI/UX task, verify against this checklist:

| Check | Requirement |
| :--- | :--- |
| **No Text Bloat** | Is there any paragraph longer than 1-2 sentences on a card or modal? If yes, move to a `<HoverInfo>` tooltip. |
| **No Pill Clutter** | Are there redundant `<Badge>` pills (`Auto`, `Custom`, rates, or branding tags)? Remove them. |
| **Clean Headers** | Is the modal or card header minimal (Icon + Title + Close)? No extra badges or pills in the header. |
| **No Fake Controls** | Do all buttons, toggles, and data points connect to real API state and hardware telemetry? |
| **Clickable Cards** | Are whole cards directly interactive rather than requiring tiny separate "Expand" buttons? |
| **Consistent Sizing** | Are adjacent KPI cards or node boxes uniform in width and height? |
| **Proper Currency** | Are financial figures formatted with `₱` (PHP)? |
| **Clean Build** | Do `npx vitest run` and `npx next build` pass with 0 errors? |
| **No Auto Server** | Did you refrain from starting `next dev` / `npm run dev` automatically? |
| **Commit & Push** | Did you create a properly detailed conventional commit and push to `origin/main`? |

---

## 3. Engineering & Code Quality Standards

1. **State Updates during Render**: Never call parent setters or trigger navigation during component render passes (`2b88a60`). Always use `useEffect` or event handlers.
2. **SSRF & Security**: All external DeyeCloud URLs must pass SSRF validation in `url-validator.ts` and require HTTPS.
3. **Multi-Tenancy & Scoping**: Account and station telemetry must always respect selected account isolation, plant IDs, and device serial numbers (`inverter-isolation.ts`, `station-aggregate-sn-filter.ts`).
4. **Resilient Polling**: Use `usePolling` with proper jitter, exponential backoff, and tab visibility detection. Deduplicate concurrent requests via in-flight references.
5. **No `any` or loose console logging**: Always use structured logging via `createLogger('<ModuleName>')` (`src/lib/logger.ts`).

---

## 4. Operational & Workflow Standards

1. **Never Start Server Automatically**: Agents must never launch `npm run dev`, `next dev`, or background development server processes automatically unless explicitly instructed by the user. Verify implementations using automated test suites (`npx vitest run`), static/production build verification (`npm run build`), or targeted standalone scripts.
2. **Properly Detailed Commit & Push After Every System Change**: After completing and verifying any bug fix, refactor, or feature implementation, agents must always craft a properly detailed conventional commit (`feat(...)`, `fix(...)`, `refactor(...)`) describing the exact problem, root cause, and changes made, and push immediately to `origin/main` without waiting to be prompted.
