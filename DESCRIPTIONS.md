# System & Telemetry Descriptions Reference

This file documents descriptions, subtitles, and explanatory notes extracted from the dashboard, telemetry cards, and trigonometric curve views to keep the active user interface clean, compact, and uncluttered.

---

## 1. Hardware Telemetry & Phasor Analysis (`/hardware-telemetry`)

- **Three-Phase AC Grid Harmonics & Phasor Trigonometry**:
  > *"Real-time phase voltages (L1, L2, L3), line frequencies, and instantaneous sinusoidal waveforms."*

---

## 2. Trigonometric & Power Analytics Graphs (`TrigonometricHistoryGraph.tsx`)

- **Main Telemetry Header**:
  > *"Exact 5-minute sampling intervals (PV: Green, Consumption: Yellow, Grid: Purple). Unelapsed intervals cleanly stop at current time."*

- **Solar PV Generation Curve (Solo View)**:
  > *"High-resolution 5-minute solar PV generation. Captures cloud transients, irradiance changes, and MPPT dynamic tracking in real-time."*

- **Industrial Consumption Profile (Solo View)**:
  > *"5-minute industrial facility load demand telemetry. Reflects machinery stepping and HVAC diurnal cycles."*

- **Net Grid Exchange (+ Export)**:
  > *"Excess PV power generated beyond facility consumption and battery charging, exported to utility."*

- **Net Grid Exchange (− Import)**:
  > *"Nighttime or overcast shortfall drawn from utility grid to satisfy industrial loads."*

- **Self-Consumption — Utilization (PV to Import)**:
  > *"How much of the facility load is served by local PV vs grid import."*

- **Self-Consumption — Production (Consumption to Export)**:
  > *"How much PV production is locally consumed vs exported to grid."*

- **Diurnal Sinusoidal Curve Fit (Theoretical Model)**:
  > *"Note: Actual measured PV only plots for elapsed 5-minute intervals. The dashed cyan line projects theoretical clear-sky insolation."*

- **Discrete Fourier Decomposition of 24-Hour Diurnal Cycle**:
  > *"Fundamental frequency ω₀ = 2π/24h plus 12-hour (2ω) and 8-hour (3ω) harmonics."*

- **Harmonic Phase Angles**:
  > *"Phase angle φₖ of each harmonic relative to solar midnight."*

---

## 3. Yield & Arbitrage Analytics (`/yield-arbitrage`)

- **Diurnal Generation vs Load Curve**:
  > *"Green = Solar PV Production | Yellow = Facility Load Demand | Cyan = Battery ESS Flow"*
