/**
 * MapLegend — corner overlay showing survivor status filter chips
 * and visible/hidden counts. Drives survivorStore.statusFilter.
 */

"use client";

import { useSurvivorStore, type SurvivorStatusFilter } from "@/store/survivorStore";

interface MapLegendProps {
    counts: { all: number; new: number; confirmed: number; rescued: number };
}

const STATUSES: { id: SurvivorStatusFilter; label: string; dot: string }[] = [
    { id: "all", label: "All", dot: "#cbd5e1" },
    { id: "new", label: "New", dot: "#f87171" },
    { id: "confirmed", label: "Conf.", dot: "#fb923c" },
    { id: "rescued", label: "Rescued", dot: "#34d399" },
];

export default function MapLegend({ counts }: MapLegendProps) {
    const statusFilter = useSurvivorStore((s) => s.statusFilter);
    const setStatusFilter = useSurvivorStore((s) => s.setStatusFilter);
    const detections = useSurvivorStore((s) => s.detections);
    const hiddenCount = useSurvivorStore((s) => s.hiddenIds.size);
    const setAllVisible = useSurvivorStore((s) => s.setAllVisible);
    const invertVisibility = useSurvivorStore((s) => s.invertVisibility);

    if (detections.length === 0) return null;

    return (
        <div className="map-legend">
            <div className="map-legend__title">Survivors ({detections.length})</div>
            <div className="map-legend__chips">
                {STATUSES.map((s) => {
                    const count = counts[s.id];
                    const active = statusFilter === s.id;
                    return (
                        <button
                            key={s.id}
                            className={`map-legend__chip ${active ? "map-legend__chip--active" : ""}`}
                            onClick={() => setStatusFilter(s.id)}
                            title={`Filter: ${s.label}`}
                        >
                            <span className="map-legend__dot" style={{ background: s.dot }} />
                            {s.label}
                            <span className="map-legend__count">{count}</span>
                        </button>
                    );
                })}
            </div>
            <div className="map-legend__bulk">
                <button onClick={() => setAllVisible(true)} disabled={hiddenCount === 0}>Show all</button>
                <button onClick={() => setAllVisible(false)} disabled={hiddenCount === detections.length}>Hide all</button>
                <button onClick={invertVisibility}>Invert</button>
            </div>
            {hiddenCount > 0 && (
                <div className="map-legend__hint">{hiddenCount} hidden</div>
            )}
        </div>
    );
}
