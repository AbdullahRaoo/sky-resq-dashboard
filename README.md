# SkyResQ: Ground Control Station Dashboard

The operator dashboard for the [SkyResQ](https://github.com/AbdullahRaoo/skyresq) autonomous search-and-rescue UAV. Streams live telemetry and object-detection video, and lets a supervisor monitor and manage autonomous missions.

## What it does

- Streams the **live object-detection feed** from the drone
- Displays **real-time flight telemetry** (position, attitude, status)
- Visualizes **detected survivors on a map** with their computed GPS coordinates
- Gives the operator oversight of the autonomous mission state

## Tech stack

**Frontend:** Next.js / React, TypeScript
**Realtime:** WebSockets / telemetry stream
**Integration:** connects to the SkyResQ companion computer and ground link

## Getting started

```bash
git clone https://github.com/AbdullahRaoo/sky-resq-dashboard
cd sky-resq-dashboard
npm install
npm run dev
```

## Status

Companion dashboard to the SkyResQ final-year research project.
