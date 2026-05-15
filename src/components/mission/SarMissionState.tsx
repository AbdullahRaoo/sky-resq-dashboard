/**
 * SarMissionState — live readout of the Pi-side SAR orchestrator state.
 *
 * Subscribes to `onMissionState` IPC and surfaces the headline state machine
 * (IDLE → SEARCH → DETECTION_HOLD → APPROACH → DROP → DROP_HOLD → RTL → DONE)
 * plus the supporting health signals (vision lock, gimbal, GPS, AGL,
 * target distance). Renders nothing until the first event arrives.
 */

"use client";

import { useEffect, useState } from "react";
import type { SarMissionStateEvent } from "@/types/electron";

const STATE_ORDER = [
    "IDLE",
    "SEARCH",
    "DETECTION_HOLD",
    "APPROACH",
    "DROP",
    "DROP_HOLD",
    "RTL",
    "DONE",
] as const;

const STATE_COLOR: Record<string, string> = {
    IDLE: "var(--text-muted)",
    SEARCH: "var(--accent-indigo)",
    DETECTION_HOLD: "var(--accent-amber)",
    APPROACH: "var(--accent-amber)",
    DROP: "var(--accent-red)",
    DROP_HOLD: "var(--accent-red)",
    RTL: "var(--accent-emerald)",
    DONE: "var(--accent-emerald)",
};

function HealthDot({ ok, label }: { ok: boolean; label: string }) {
    return (
        <span
            title={label}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: "0.7rem",
                color: ok ? "var(--accent-emerald)" : "var(--accent-red)",
            }}
        >
            <span
                style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "currentColor",
                    boxShadow: ok ? "0 0 4px currentColor" : "none",
                }}
            />
            {label}
        </span>
    );
}

export default function SarMissionState() {
    const [evt, setEvt] = useState<SarMissionStateEvent | null>(null);
    const [staleMs, setStaleMs] = useState(0);

    useEffect(() => {
        if (!window.electron?.onMissionState) return;
        return window.electron.onMissionState(setEvt);
    }, []);

    useEffect(() => {
        if (!evt) return;
        const tick = setInterval(() => setStaleMs(Date.now() - evt.ts_ms), 500);
        return () => clearInterval(tick);
    }, [evt]);

    if (!evt) {
        return (
            <div
                style={{
                    padding: "10px 12px",
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    border: "1px dashed var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                }}
            >
                SAR orchestrator offline — start <code>sar-orchestrator.service</code> on the Pi to enable autonomous search.
            </div>
        );
    }

    const stale = staleMs > 4000;
    const idx = STATE_ORDER.indexOf(evt.state as typeof STATE_ORDER[number]);
    const color = STATE_COLOR[evt.state] || "var(--text-secondary)";

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* State pill + sub-state */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: `color-mix(in srgb, ${color} 12%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
                        color,
                        fontWeight: 700,
                        fontSize: "0.78rem",
                        letterSpacing: "0.05em",
                    }}
                >
                    <span
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "currentColor",
                            opacity: stale ? 0.3 : 1,
                        }}
                    />
                    {evt.state}
                </div>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {evt.sub_state || "—"}
                </span>
            </div>

            {/* Step progress */}
            <div style={{ display: "flex", gap: 3 }}>
                {STATE_ORDER.map((s, i) => (
                    <div
                        key={s}
                        title={s}
                        style={{
                            flex: 1,
                            height: 3,
                            borderRadius: 2,
                            background:
                                i < idx
                                    ? "var(--accent-emerald)"
                                    : i === idx
                                        ? color
                                        : "var(--border-subtle)",
                            opacity: stale && i === idx ? 0.4 : 1,
                        }}
                    />
                ))}
            </div>

            {/* Metrics row */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "6px 12px",
                    fontSize: "0.72rem",
                }}
            >
                <div>
                    <span style={{ color: "var(--text-muted)" }}>AGL </span>
                    <span style={{ color: "var(--text-primary)" }}>
                        {evt.altitude_agl_m != null ? `${evt.altitude_agl_m.toFixed(1)} m` : "—"}
                    </span>
                </div>
                <div>
                    <span style={{ color: "var(--text-muted)" }}>TGT </span>
                    <span style={{ color: "var(--text-primary)" }}>
                        {evt.target_distance_m != null ? `${evt.target_distance_m.toFixed(1)} m` : "—"}
                    </span>
                </div>
            </div>

            {/* Health row */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <HealthDot ok={evt.vision_locked} label="vision" />
                <HealthDot ok={evt.gimbal_healthy} label="gimbal" />
                <HealthDot ok={evt.gps_healthy} label="gps" />
            </div>

            {stale && (
                <div style={{ fontSize: "0.7rem", color: "var(--accent-amber)" }}>
                    Stale — last update {(staleMs / 1000).toFixed(1)}s ago
                </div>
            )}
        </div>
    );
}
