/**
 * Zustand store for drone telemetry state.
 *
 * Single source of truth for all telemetry data.
 * Updated by the WebSocket hook at 10Hz.
 */

import { create } from "zustand";
import type { DroneState } from "@/types/telemetry";

interface TelemetryStore extends DroneState {
    /** Update state with full or partial telemetry data (deep-merges). */
    updateState: (state: Partial<DroneState>) => void;
    /** Reset to disconnected defaults. */
    resetState: () => void;
}

const defaultState: DroneState = {
    connected: false,
    last_heartbeat: 0,
    heartbeat: {
        armed: false,
        flight_mode: "UNKNOWN",
        system_status: 0,
        mav_type: 0,
        autopilot: 0,
    },
    attitude: {
        roll: 0,
        pitch: 0,
        yaw: 0,
        rollspeed: 0,
        pitchspeed: 0,
        yawspeed: 0,
    },
    position: {
        lat: 0,
        lon: 0,
        alt: 0,
        relative_alt: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        heading: 0,
    },
    vfr_hud: {
        airspeed: 0,
        groundspeed: 0,
        heading: 0,
        throttle: 0,
        alt: 0,
        climb: 0,
    },
    battery: {
        voltage: 0,
        current: 0,
        remaining: -1,
    },
    gps: {
        fix_type: 0,
        satellites_visible: 0,
        hdop: 0,
    },
    status_text: "",
    timestamp: 0,
};

export const useTelemetryStore = create<TelemetryStore>((set) => ({
    ...defaultState,
    updateState: (incoming: Partial<DroneState>) =>
        set((prev) => ({
            connected: incoming.connected ?? prev.connected,
            last_heartbeat: incoming.last_heartbeat ?? prev.last_heartbeat,
            heartbeat: incoming.heartbeat ? { ...prev.heartbeat, ...incoming.heartbeat } : prev.heartbeat,
            attitude: incoming.attitude ? { ...prev.attitude, ...incoming.attitude } : prev.attitude,
            position: incoming.position ? { ...prev.position, ...incoming.position } : prev.position,
            vfr_hud: incoming.vfr_hud ? { ...prev.vfr_hud, ...incoming.vfr_hud } : prev.vfr_hud,
            battery: incoming.battery ? { ...prev.battery, ...incoming.battery } : prev.battery,
            gps: incoming.gps ? { ...prev.gps, ...incoming.gps } : prev.gps,
            status_text: incoming.status_text ?? prev.status_text,
            timestamp: incoming.timestamp ?? prev.timestamp,
        })),
    resetState: () => set(defaultState),
}));
