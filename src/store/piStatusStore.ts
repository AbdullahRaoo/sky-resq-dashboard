/**
 * Pi Status Store — mirrors the companion-computer health JSON the Pi
 * publishes once per second (spec §1.4). Each `ok` flag drops to false
 * upstream when the producing topic has been silent 2-5 s.
 */

import { create } from "zustand";
import type { PiStatusEvent } from "@/types/electron";

interface PiStatusStore {
    latest: PiStatusEvent | null;
    lastArrivedMs: number;
    update: (data: PiStatusEvent) => void;
    /** Mark Pi as offline (no packets received). */
    markOffline: () => void;
}

export const usePiStatusStore = create<PiStatusStore>((set) => ({
    latest: null,
    lastArrivedMs: 0,
    update: (data) => set({ latest: data, lastArrivedMs: data.arrivedMs ?? Date.now() }),
    markOffline: () => set({ latest: null, lastArrivedMs: 0 }),
}));

export type PiHealth = "green" | "amber" | "red" | "unknown";

/** Derive a single rollup health colour from a Pi status snapshot. */
export function piHealth(status: PiStatusEvent | null, arrivedMs: number): PiHealth {
    if (!status || !arrivedMs) return "unknown";
    const age = Date.now() - arrivedMs;
    if (age > 5000) return "red";

    // Critical flags
    const fc = status.fc_link?.ok !== false;
    const camera = status.camera?.ok !== false;
    if (!fc || !camera) return "red";

    // Warning conditions
    if ((status.cpu_temp_c ?? 0) > 75) return "amber";
    const detectorOk = status.detector?.ok !== false;
    const gimbalOk = status.gimbal?.ok !== false;
    if (!detectorOk || !gimbalOk) return "amber";
    if (age > 2000) return "amber";

    return "green";
}
