/**
 * SurvivorFilters — status pill bar, free-text search, and bulk
 * visibility toggles for the Survivors page.
 */

"use client";

import { useShallow } from "zustand/react/shallow";
import {
    useSurvivorStore,
    selectStatusCounts,
    type SurvivorStatusFilter,
} from "@/store/survivorStore";

const STATUS_OPTIONS: { id: SurvivorStatusFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "new", label: "New" },
    { id: "confirmed", label: "Confirmed" },
    { id: "rescued", label: "Rescued" },
];

export default function SurvivorFilters() {
    const statusFilter = useSurvivorStore((s) => s.statusFilter);
    const setStatusFilter = useSurvivorStore((s) => s.setStatusFilter);
    const searchQuery = useSurvivorStore((s) => s.searchQuery);
    const setSearchQuery = useSurvivorStore((s) => s.setSearchQuery);
    const setAllVisible = useSurvivorStore((s) => s.setAllVisible);
    const invertVisibility = useSurvivorStore((s) => s.invertVisibility);
    const counts = useSurvivorStore(useShallow(selectStatusCounts));

    return (
        <div className="survivors-filters">
            <div className="survivors-filters__row">
                <span className="survivors-filters__label">Status</span>
                {STATUS_OPTIONS.map((opt) => (
                    <button
                        key={opt.id}
                        className={`survivors-filters__pill ${statusFilter === opt.id ? "survivors-filters__pill--active" : ""}`}
                        onClick={() => setStatusFilter(opt.id)}
                    >
                        {opt.label}
                        <span className="survivors-filters__pill-count">{counts[opt.id]}</span>
                    </button>
                ))}
            </div>
            <div className="survivors-filters__row">
                <span className="survivors-filters__label">Search</span>
                <input
                    type="text"
                    className="survivors-filters__search"
                    placeholder="Filter by id or coords…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <span className="survivors-filters__label" style={{ minWidth: 0 }}>Map</span>
                <div className="survivors-filters__bulk">
                    <button onClick={() => setAllVisible(true)}>Show all</button>
                    <button onClick={() => setAllVisible(false)}>Hide all</button>
                    <button onClick={invertVisibility}>Invert</button>
                </div>
            </div>
        </div>
    );
}
