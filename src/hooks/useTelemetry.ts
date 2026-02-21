/**
 * useTelemetry — convenience selectors over the telemetry store.
 */

"use client";

import { useTelemetryStore } from "@/store/telemetryStore";

/** Select all telemetry at once (for dashboard-level components). */
export function useTelemetry() {
    return useTelemetryStore((s) => ({
        connected: s.connected,
        armed: s.heartbeat.armed,
        flightMode: s.heartbeat.flight_mode,
        attitude: s.attitude,
        position: s.position,
        vfrHud: s.vfr_hud,
        battery: s.battery,
        gps: s.gps,
        statusText: s.status_text,
    }));
}

/** Granular selectors for individual components — prevents unnecessary re-renders. */
export const useAttitude = () => useTelemetryStore((s) => s.attitude);
export const usePosition = () => useTelemetryStore((s) => s.position);
export const useVfrHud = () => useTelemetryStore((s) => s.vfr_hud);
export const useBattery = () => useTelemetryStore((s) => s.battery);
export const useGps = () => useTelemetryStore((s) => s.gps);
export const useHeartbeat = () => useTelemetryStore((s) => s.heartbeat);
export const useConnected = () => useTelemetryStore((s) => s.connected);
export const useStatusText = () => useTelemetryStore((s) => s.status_text);
