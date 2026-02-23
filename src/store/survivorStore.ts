/**
 * Survivor Detection Store — manages detected survivor clusters,
 * alert queue, and mock data generation.
 */

import { create } from "zustand";

export interface SurvivorCluster {
    id: string;
    lat: number;
    lon: number;
    count: number;
    confidence: number;
    timestamp: number;
    status: "new" | "confirmed" | "rescued";
}

export interface GcsAlert {
    id: string;
    type: "survivor" | "battery_low" | "battery_critical" | "gps_loss" | "link_lost" | "info";
    title: string;
    message: string;
    timestamp: number;
    dismissed: boolean;
}

interface SurvivorStore {
    detections: SurvivorCluster[];
    alerts: GcsAlert[];
    selectedId: string | null;

    addDetection: (cluster: SurvivorCluster) => void;
    updateDetectionStatus: (id: string, status: SurvivorCluster["status"]) => void;
    setSelected: (id: string | null) => void;
    addAlert: (alert: Omit<GcsAlert, "id" | "timestamp" | "dismissed">) => void;
    dismissAlert: (id: string) => void;
    clearAlerts: () => void;
    clearDetections: () => void;
}

let alertCounter = 0;

export const useSurvivorStore = create<SurvivorStore>((set) => ({
    detections: [],
    alerts: [],
    selectedId: null,

    addDetection: (cluster) =>
        set((s) => ({
            detections: [...s.detections, cluster],
        })),

    updateDetectionStatus: (id, status) =>
        set((s) => ({
            detections: s.detections.map((d) => (d.id === id ? { ...d, status } : d)),
        })),

    setSelected: (id) => set({ selectedId: id }),

    addAlert: (alert) =>
        set((s) => ({
            alerts: [
                {
                    ...alert,
                    id: `alert-${++alertCounter}`,
                    timestamp: Date.now(),
                    dismissed: false,
                },
                ...s.alerts,
            ].slice(0, 50), // keep last 50 alerts
        })),

    dismissAlert: (id) =>
        set((s) => ({
            alerts: s.alerts.map((a) => (a.id === id ? { ...a, dismissed: true } : a)),
        })),

    clearAlerts: () => set({ alerts: [] }),
    clearDetections: () => set({ detections: [], selectedId: null }),
}));
