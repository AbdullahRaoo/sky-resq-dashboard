/**
 * SurvivorTable — sortable table of detected survivor clusters with
 * per-row actions: visibility toggle, center on map, go to (GUIDED fly-to),
 * mark rescued, drop payload, delete.
 *
 * Note: the visibility checkbox controls map presence only. The table
 * itself shows every cluster matching the status + search filters.
 */

"use client";

import { useState, useMemo, useCallback } from "react";
import {
    useSurvivorStore,
    type SurvivorCluster,
} from "@/store/survivorStore";
import { useNavStore } from "@/store/navStore";
import { useMissionStore } from "@/store/missionStore";

type SortKey = "id" | "time" | "lat" | "lon" | "count" | "confidence" | "status";

function fmtTime(ms: number) {
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

interface SortState {
    key: SortKey;
    dir: "asc" | "desc";
}

function compare(a: SurvivorCluster, b: SurvivorCluster, key: SortKey): number {
    switch (key) {
        case "id": return a.id.localeCompare(b.id);
        case "time": return a.timestamp - b.timestamp;
        case "lat": return a.lat - b.lat;
        case "lon": return a.lon - b.lon;
        case "count": return a.count - b.count;
        case "confidence": return a.confidence - b.confidence;
        case "status": return a.status.localeCompare(b.status);
        default: return 0;
    }
}

export default function SurvivorTable() {
    const detections = useSurvivorStore((s) => s.detections);
    const statusFilter = useSurvivorStore((s) => s.statusFilter);
    const searchQuery = useSurvivorStore((s) => s.searchQuery);
    const hiddenIds = useSurvivorStore((s) => s.hiddenIds);
    const selectedId = useSurvivorStore((s) => s.selectedId);
    const setSelected = useSurvivorStore((s) => s.setSelected);
    const setVisibility = useSurvivorStore((s) => s.setVisibility);
    const markRescued = useSurvivorStore((s) => s.markRescued);
    const deleteCluster = useSurvivorStore((s) => s.deleteCluster);
    const setView = useNavStore((s) => s.setView);
    const payloadState = useMissionStore((s) => s.payloadState);

    const [sort, setSort] = useState<SortState>({ key: "time", dir: "desc" });

    const rows = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const filtered = detections.filter((d) => {
            if (statusFilter !== "all" && d.status !== statusFilter) return false;
            if (query) {
                const hay = `${d.id} ${d.lat.toFixed(6)} ${d.lon.toFixed(6)}`.toLowerCase();
                if (!hay.includes(query)) return false;
            }
            return true;
        });
        filtered.sort((a, b) => {
            const cmp = compare(a, b, sort.key);
            return sort.dir === "asc" ? cmp : -cmp;
        });
        return filtered;
    }, [detections, statusFilter, searchQuery, sort]);

    const toggleSort = useCallback((key: SortKey) => {
        setSort((prev) => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
    }, []);

    const arrow = (key: SortKey) =>
        sort.key === key ? <span className="sort-arrow">{sort.dir === "asc" ? "▲" : "▼"}</span> : null;

    const handleCenter = useCallback((id: string) => {
        setSelected(id);
        setView("dashboard");
    }, [setSelected, setView]);

    const handleGoTo = useCallback(async (d: SurvivorCluster) => {
        if (!window.electron) return;
        try {
            await window.electron.flyToPoint(d.lat, d.lon, 5);
        } catch (e) {
            console.error("[SurvivorTable] flyToPoint failed:", e);
        }
    }, []);

    const handleDrop = useCallback(async (d: SurvivorCluster) => {
        if (!window.electron) return;
        try {
            const result = await window.electron.deployPayload({ survivorId: d.id });
            if (!result.success) {
                console.warn("[SurvivorTable] Drop refused:", result.message);
            }
        } catch (e) {
            console.error("[SurvivorTable] Drop failed:", e);
        }
    }, []);

    if (detections.length === 0) {
        return (
            <div className="survivors-table-wrap">
                <div className="survivors-empty">
                    No survivors detected yet.<br />
                    <span style={{ fontSize: "0.78rem", opacity: 0.6 }}>
                        Detections will appear automatically once the drone reports a cluster.
                    </span>
                </div>
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="survivors-table-wrap">
                <div className="survivors-empty">
                    No survivors match the current filter.
                </div>
            </div>
        );
    }

    return (
        <div className="survivors-table-wrap">
            <table className="survivors-table">
                <thead>
                    <tr>
                        <th style={{ width: 32 }} title="Show on map" />
                        <th onClick={() => toggleSort("id")}>ID{arrow("id")}</th>
                        <th onClick={() => toggleSort("time")}>Time{arrow("time")}</th>
                        <th onClick={() => toggleSort("lat")}>Lat{arrow("lat")}</th>
                        <th onClick={() => toggleSort("lon")}>Lon{arrow("lon")}</th>
                        <th onClick={() => toggleSort("count")}>People{arrow("count")}</th>
                        <th onClick={() => toggleSort("confidence")}>Conf{arrow("confidence")}</th>
                        <th onClick={() => toggleSort("status")}>Status{arrow("status")}</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((d) => {
                        const hidden = hiddenIds.has(d.id);
                        const rescued = d.status === "rescued";
                        return (
                            <tr
                                key={d.id}
                                className={`${selectedId === d.id ? "is-selected" : ""} ${rescued ? "is-rescued" : ""} ${hidden ? "is-hidden" : ""}`}
                                onClick={() => setSelected(d.id)}
                            >
                                <td onClick={(e) => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        className="survivors-table__visibility"
                                        checked={!hidden}
                                        onChange={(e) => setVisibility(d.id, e.target.checked)}
                                        title={hidden ? "Hidden on map" : "Visible on map"}
                                    />
                                </td>
                                <td>#{d.id.slice(-6)}</td>
                                <td>{fmtTime(d.timestamp)}</td>
                                <td>{d.lat.toFixed(5)}</td>
                                <td>{d.lon.toFixed(5)}</td>
                                <td>{d.count}</td>
                                <td>{(d.confidence * 100).toFixed(0)}%</td>
                                <td><span className={`status-badge status-badge--${d.status}`}>{d.status.replace("_", " ")}</span></td>
                                <td onClick={(e) => e.stopPropagation()}>
                                    <div className="survivors-table__actions">
                                        <button
                                            className="survivors-table__btn"
                                            title="Center on map"
                                            onClick={() => handleCenter(d.id)}
                                        >Center</button>
                                        <button
                                            className="survivors-table__btn"
                                            title="Fly drone here (GUIDED)"
                                            onClick={() => handleGoTo(d)}
                                            disabled={rescued}
                                        >Go</button>
                                        <button
                                            className="survivors-table__btn"
                                            title="Mark as rescued"
                                            onClick={() => markRescued(d.id)}
                                            disabled={rescued}
                                        >Rescued</button>
                                        <button
                                            className="survivors-table__btn survivors-table__btn--drop"
                                            title="Drop rescue payload"
                                            onClick={() => handleDrop(d)}
                                            disabled={rescued || payloadState === "dropped" || payloadState === "dropping"}
                                        >Drop</button>
                                        <button
                                            className="survivors-table__btn survivors-table__btn--danger"
                                            title="Delete (false positive)"
                                            onClick={() => deleteCluster(d.id)}
                                        >✕</button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
