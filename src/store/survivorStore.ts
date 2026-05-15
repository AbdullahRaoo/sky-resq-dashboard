/**
 * Survivor Detection Store — manages detected survivor clusters,
 * per-cluster map visibility, alert queue, and live detection frames
 * for the video overlay.
 */

import { create } from "zustand";

export interface SurvivorCluster {
    id: string;
    lat: number;
    lon: number;
    alt?: number;
    count: number;
    confidence: number;
    timestamp: number;          // first-seen wall-clock ms
    lastUpdatedMs?: number;     // most-recent update wall-clock ms
    nSamples?: number;
    status: "new" | "confirmed" | "rescued" | "false_positive";
}

export interface GcsAlert {
    id: string;
    type: "survivor" | "battery_low" | "battery_critical" | "gps_loss" | "link_lost" | "info";
    title: string;
    message: string;
    timestamp: number;
    dismissed: boolean;
}

export interface DetectionBox {
    bbox: [number, number, number, number]; // [x1, y1, x2, y2] in stream pixels
    confidence: number;
    class: string;
    clusterId: string | null;
}

export interface DetectionFrame {
    frameTsMs: number;
    streamWidth: number;
    streamHeight: number;
    detections: DetectionBox[];
}

export type SurvivorStatusFilter = "all" | "new" | "confirmed" | "rescued";

interface SurvivorStore {
    detections: SurvivorCluster[];
    alerts: GcsAlert[];
    selectedId: string | null;

    /** Per-cluster map visibility override (true = hidden). Default visible. */
    hiddenIds: Set<string>;
    statusFilter: SurvivorStatusFilter;
    searchQuery: string;

    /** Latest detection frame for video overlay (kept only when fresh). */
    latestDetectionFrame: DetectionFrame | null;

    /** Idempotent upsert on cluster id. */
    upsertDetection: (cluster: Partial<SurvivorCluster> & { id: string }) => void;
    addDetection: (cluster: SurvivorCluster) => void;
    updateDetectionStatus: (id: string, status: SurvivorCluster["status"]) => void;
    markRescued: (id: string) => void;
    deleteCluster: (id: string) => void;
    setSelected: (id: string | null) => void;

    setVisibility: (id: string, visible: boolean) => void;
    setAllVisible: (visible: boolean) => void;
    invertVisibility: () => void;
    setStatusFilter: (filter: SurvivorStatusFilter) => void;
    setSearchQuery: (q: string) => void;

    setDetectionFrame: (frame: DetectionFrame | null) => void;

    addAlert: (alert: Omit<GcsAlert, "id" | "timestamp" | "dismissed">) => void;
    dismissAlert: (id: string) => void;
    clearAlerts: () => void;
    clearDetections: () => void;
}

let alertCounter = 0;

export const useSurvivorStore = create<SurvivorStore>((set, get) => ({
    detections: [],
    alerts: [],
    selectedId: null,
    hiddenIds: new Set<string>(),
    statusFilter: "all",
    searchQuery: "",
    latestDetectionFrame: null,

    upsertDetection: (incoming) =>
        set((s) => {
            const existing = s.detections.find((d) => d.id === incoming.id);
            if (existing) {
                const merged: SurvivorCluster = {
                    ...existing,
                    ...incoming,
                    // never downgrade status (e.g. rescued -> new)
                    status: existing.status === "rescued" || existing.status === "false_positive"
                        ? existing.status
                        : (incoming.status ?? existing.status),
                };
                return { detections: s.detections.map((d) => (d.id === incoming.id ? merged : d)) };
            }
            const fresh: SurvivorCluster = {
                lat: 0,
                lon: 0,
                count: 1,
                confidence: 0,
                timestamp: Date.now(),
                status: "new",
                ...incoming,
            };
            return { detections: [...s.detections, fresh] };
        }),

    addDetection: (cluster) =>
        set((s) => ({ detections: [...s.detections, cluster] })),

    updateDetectionStatus: (id, status) =>
        set((s) => ({
            detections: s.detections.map((d) => (d.id === id ? { ...d, status } : d)),
        })),

    markRescued: (id) => get().updateDetectionStatus(id, "rescued"),

    deleteCluster: (id) =>
        set((s) => ({
            detections: s.detections.filter((d) => d.id !== id),
            selectedId: s.selectedId === id ? null : s.selectedId,
        })),

    setSelected: (id) => set({ selectedId: id }),

    setVisibility: (id, visible) =>
        set((s) => {
            const next = new Set(s.hiddenIds);
            if (visible) next.delete(id);
            else next.add(id);
            return { hiddenIds: next };
        }),

    setAllVisible: (visible) =>
        set((s) => {
            if (visible) return { hiddenIds: new Set<string>() };
            return { hiddenIds: new Set(s.detections.map((d) => d.id)) };
        }),

    invertVisibility: () =>
        set((s) => {
            const next = new Set<string>();
            for (const d of s.detections) {
                if (!s.hiddenIds.has(d.id)) next.add(d.id);
            }
            return { hiddenIds: next };
        }),

    setStatusFilter: (filter) => set({ statusFilter: filter }),
    setSearchQuery: (q) => set({ searchQuery: q }),

    setDetectionFrame: (frame) => set({ latestDetectionFrame: frame }),

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
            ].slice(0, 50),
        })),

    dismissAlert: (id) =>
        set((s) => ({
            alerts: s.alerts.map((a) => (a.id === id ? { ...a, dismissed: true } : a)),
        })),

    clearAlerts: () => set({ alerts: [] }),
    clearDetections: () => set({ detections: [], selectedId: null, hiddenIds: new Set<string>() }),
}));

/** Selector: visible detections (respects hiddenIds, statusFilter, searchQuery). */
export function selectVisibleDetections(state: SurvivorStore): SurvivorCluster[] {
    const query = state.searchQuery.trim().toLowerCase();
    return state.detections.filter((d) => {
        if (state.hiddenIds.has(d.id)) return false;
        if (state.statusFilter !== "all" && d.status !== state.statusFilter) return false;
        if (query) {
            const hay = `${d.id} ${d.lat.toFixed(6)} ${d.lon.toFixed(6)}`.toLowerCase();
            if (!hay.includes(query)) return false;
        }
        return true;
    });
}

/** Selector: counts per status (used by filter pill badges). */
export function selectStatusCounts(state: SurvivorStore) {
    const counts = { all: 0, new: 0, confirmed: 0, rescued: 0 };
    for (const d of state.detections) {
        counts.all++;
        if (d.status === "new") counts.new++;
        else if (d.status === "confirmed") counts.confirmed++;
        else if (d.status === "rescued") counts.rescued++;
    }
    return counts;
}
