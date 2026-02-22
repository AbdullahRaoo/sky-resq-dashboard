/**
 * useElectronTelemetry — listens for telemetry updates via Electron IPC.
 *
 * Replaces the old useWebSocket hook. Connects to the Electron main process
 * which reads MAVLink data from the serial port and broadcasts DroneState
 * at 10Hz via IPC.
 */

"use client";

import { useEffect } from "react";
import { useTelemetryStore } from "@/store/telemetryStore";
import type { DroneState } from "@/types/telemetry";

export function useElectronTelemetry() {
    const updateState = useTelemetryStore((s) => s.updateState);
    const resetState = useTelemetryStore((s) => s.resetState);

    useEffect(() => {
        // Guard: only runs inside Electron
        if (typeof window === "undefined" || !window.electron) {
            console.warn("[IPC] Not running in Electron — telemetry disabled");
            return;
        }

        console.log("[IPC] Listening for telemetry updates...");

        // Subscribe to telemetry stream from main process
        let msgCount = 0;
        const cleanupTelemetry = window.electron.onTelemetry((data: DroneState) => {
            msgCount++;
            // Log every 50th message to diagnose data flow
            if (msgCount % 50 === 1) {
                console.log(`[IPC] Telemetry #${msgCount}:`, JSON.stringify({
                    connected: data.connected,
                    hb_mode: data.heartbeat?.flight_mode,
                    hb_armed: data.heartbeat?.armed,
                    pos_lat: data.position?.lat,
                    pos_lon: data.position?.lon,
                    bat_v: data.battery?.voltage,
                    bat_rem: data.battery?.remaining,
                    gps_fix: data.gps?.fix_type,
                    gps_sats: data.gps?.satellites_visible,
                    hud_alt: data.vfr_hud?.alt,
                    hud_gs: data.vfr_hud?.groundspeed,
                    att_roll: data.attitude?.roll,
                    att_pitch: data.attitude?.pitch,
                }));
            }
            updateState(data);
        });

        // Subscribe to connection status changes
        const cleanupStatus = window.electron.onConnectionStatus((status) => {
            console.log("[IPC] Connection status:", status.message);
            if (!status.connected) {
                resetState();
            }
        });

        return () => {
            cleanupTelemetry();
            cleanupStatus();
            resetState();
        };
    }, [updateState, resetState]);
}
