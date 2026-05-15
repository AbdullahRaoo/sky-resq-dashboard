/**
 * PiBadge — title-bar pill showing the Pi companion-computer rollup health
 * (green/amber/red/unknown). Tooltip shows the full pi_status JSON.
 */

"use client";

import { useState, useEffect } from "react";
import { usePiStatusStore, piHealth, type PiHealth } from "@/store/piStatusStore";

const COLOR: Record<PiHealth, { bg: string; border: string; text: string }> = {
    green:   { bg: "rgba(52,211,153,0.18)",  border: "rgba(52,211,153,0.5)",  text: "#6ee7b7" },
    amber:   { bg: "rgba(251,191,36,0.18)",  border: "rgba(251,191,36,0.5)",  text: "#fcd34d" },
    red:     { bg: "rgba(248,113,113,0.20)", border: "rgba(248,113,113,0.6)", text: "#fca5a5" },
    unknown: { bg: "rgba(148,163,192,0.15)", border: "rgba(148,163,192,0.4)", text: "#cbd5e1" },
};

export default function PiBadge() {
    const status = usePiStatusStore((s) => s.latest);
    const arrived = usePiStatusStore((s) => s.lastArrivedMs);
    const [open, setOpen] = useState(false);

    // Force re-render every second so the badge degrades to amber/red as
    // the last-arrived timestamp ages without new packets.
    const [, setTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setTick((x) => x + 1), 1000);
        return () => clearInterval(t);
    }, []);

    const health = piHealth(status, arrived);
    const colors = COLOR[health];

    const label = health === "unknown" ? "PI N/A" : `PI ${health.toUpperCase()}`;

    return (
        <div style={{ position: "relative" }}>
            <button
                onClick={() => setOpen((v) => !v)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                title="Click for Pi telemetry detail"
                style={{
                    padding: "4px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: `1px solid ${colors.border}`,
                    background: colors.bg,
                    color: colors.text,
                    fontWeight: 700,
                    fontSize: "0.72rem",
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    marginRight: 8,
                }}
            >
                ● {label}
            </button>

            {open && (
                <div
                    style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        right: 0,
                        zIndex: 600,
                        minWidth: 280,
                        padding: 12,
                        background: "var(--glass-bg)",
                        backdropFilter: "var(--glass-blur)",
                        border: "1px solid var(--glass-border)",
                        borderRadius: "var(--radius-md)",
                        boxShadow: "var(--shadow-lg)",
                        fontSize: "0.78rem",
                        color: "var(--text-primary)",
                        fontFamily: "'JetBrains Mono', monospace",
                    }}
                >
                    {status ? (
                        <PiStatusDetail />
                    ) : (
                        <div style={{ color: "var(--text-muted)" }}>
                            No pi_status packets received yet.<br />
                            Expected on UDP {process.env.NEXT_PUBLIC_PI_DETECTION_PORT || "5005"}.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function PiStatusDetail() {
    const status = usePiStatusStore((s) => s.latest);
    const arrived = usePiStatusStore((s) => s.lastArrivedMs);
    // Re-render every second so the "Last packet" age stays accurate.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);
    if (!status) return null;
    const ageMs = now - arrived;
    const row = (label: string, ok: boolean | undefined, extra?: string) => (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "var(--text-muted)" }}>{label}</span>
            <span style={{ color: ok === false ? "var(--accent-red)" : "var(--text-primary)" }}>
                {ok === false ? "FAIL" : "OK"}{extra ? ` · ${extra}` : ""}
            </span>
        </div>
    );
    return (
        <div>
            <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--accent-primary)" }}>
                Companion (Pi)
            </div>
            {row("FC link", status.fc_link?.ok, status.fc_link?.armed ? "ARMED" : "DISARMED")}
            {row("Camera", status.camera?.ok, status.camera?.fps ? `${status.camera.fps.toFixed(1)} fps` : undefined)}
            {row("Detector", status.detector?.ok, status.detector?.fps ? `${status.detector.fps.toFixed(1)} fps` : undefined)}
            {row("Gimbal", status.gimbal?.ok,
                status.gimbal && typeof status.gimbal.pitch_deg === "number"
                    ? `p${status.gimbal.pitch_deg.toFixed(0)}° y${(status.gimbal.yaw_deg ?? 0).toFixed(0)}°`
                    : undefined)}
            {row("GCS link", status.gcs_link?.ok)}
            <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "6px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>CPU temp</span>
                <span>{status.cpu_temp_c != null ? `${status.cpu_temp_c.toFixed(1)}°C` : "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Load (1m)</span>
                <span>{status.cpu_load1?.toFixed(2) ?? "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>RAM</span>
                <span>{status.ram_used_mb ?? "—"} / {status.ram_total_mb ?? "—"} MB</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Uptime</span>
                <span>{status.uptime_s ? `${Math.floor(status.uptime_s / 60)}m ${status.uptime_s % 60}s` : "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Last packet</span>
                <span>{(ageMs / 1000).toFixed(1)}s ago</span>
            </div>
        </div>
    );
}
