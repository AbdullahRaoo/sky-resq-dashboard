/**
 * Settings Store — persistent GCS configuration.
 * Used by ConnectionPanel, MissionPanel, AlertPanel, and failsafe logic.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

function getDefaultComPort(): string {
    if (typeof window === "undefined") return "COM3";

    const platform = window.navigator.platform.toLowerCase();
    if (platform.includes("win")) return "COM3";
    if (platform.includes("mac")) return "/dev/cu.usbserial-0001";
    return "/dev/ttyUSB0";
}

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

    // Video — two-tier host with auto-failover
    /** Preferred Pi host (LAN). Probed first; if mediamtx responds within
     * the probe timeout this is used for <5 ms LAN-direct video.
     * Demo-time: same as Pi's IP on the Blaze Wi-Fi (default 192.168.1.139). */
    piLanHost: string;
    /** Fallback Pi host (Tailscale). Used when piLanHost is unreachable
     * (e.g. laptop is not on the same Blaze Wi-Fi). */
    piRemoteHost: string;
    /** Force HLS instead of WHEP/WebRTC. HLS has 2–3 s buffering which
     * masks Tailscale-relay jitter better than WHEP's real-time queueing.
     * Use when Pi is on symmetric NAT (Tailscale uses DERP relay). */
    lowBandwidthMode: boolean;
}

interface SettingsStore extends GcsSettings {
    updateSettings: (partial: Partial<GcsSettings>) => void;
}

// Persisted to localStorage so demo-time tweaks (Pi LAN host, Low Bandwidth
// Mode, etc.) survive dashboard restarts. Storage key bumps on schema break.
export const useSettingsStore = create<SettingsStore>()(persist((set) => ({
    // Connection
    comPort: getDefaultComPort(),
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

    // Video
    piLanHost: "192.168.1.139",
    piRemoteHost: "100.123.87.26",
    lowBandwidthMode: false,

    updateSettings: (partial) => set((s) => ({ ...s, ...partial })),
}), {
    name: "skyresq-settings-v1",
    storage: createJSONStorage(() => localStorage),
}));
