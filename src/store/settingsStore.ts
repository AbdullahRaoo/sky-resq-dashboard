/**
 * Settings Store — persistent GCS configuration.
 * Used by ConnectionPanel, MissionPanel, AlertPanel, and failsafe logic.
 */

import { create } from "zustand";

export interface GcsSettings {
    // Connection
    comPort: string;
    baudRate: number;

    // Mission defaults
    defaultAltitude: number;
    defaultOverlap: number;
    defaultSpeed: number;

    // Payload
    servoChannel: number;
    servoPwm: number;

    // Failsafe
    loiterTimeoutSec: number;   // seconds of lost heartbeat before LOITER
    rtlTimeoutSec: number;      // seconds of lost heartbeat before RTL
    rtlAltitude: number;
    lowBatPercent: number;
    critBatPercent: number;

    // Display
    mapStyle: "dark" | "osm" | "satellite";
    altitudeUnit: "m" | "ft";
    speedUnit: "m/s" | "km/h" | "knots";
}

interface SettingsStore extends GcsSettings {
    updateSettings: (partial: Partial<GcsSettings>) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
    // Connection
    comPort: "COM3",
    baudRate: 57600,

    // Mission defaults
    defaultAltitude: 30,
    defaultOverlap: 60,
    defaultSpeed: 5,

    // Payload
    servoChannel: 9,
    servoPwm: 1100,

    // Failsafe
    loiterTimeoutSec: 5,
    rtlTimeoutSec: 10,
    rtlAltitude: 40,
    lowBatPercent: 30,
    critBatPercent: 15,

    // Display
    mapStyle: "dark",
    altitudeUnit: "m",
    speedUnit: "m/s",

    updateSettings: (partial) => set((s) => ({ ...s, ...partial })),
}));
