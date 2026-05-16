/**
 * ConnectionStatus — header chips: connected/disconnected, armed state,
 * and live flight mode (read-only; mode is RC-driven on this airframe).
 */

"use client";

import { useConnected, useHeartbeat } from "@/hooks/useTelemetry";

// Color-code flight modes by operational character so the operator sees at a
// glance whether the drone is autonomous, manual, or in safety/recovery
// without reading the label.
function modeColors(mode: string): { color: string; bg: string; border: string } {
    const m = (mode || "UNKNOWN").toUpperCase();
    if (m === "AUTO" || m === "GUIDED")
        return { color: "var(--accent-emerald)", bg: "rgba(16, 185, 129, 0.12)", border: "rgba(16, 185, 129, 0.3)" };
    if (m === "RTL" || m === "LAND" || m === "SMART_RTL")
        return { color: "var(--accent-amber)", bg: "rgba(245, 158, 11, 0.14)", border: "rgba(245, 158, 11, 0.32)" };
    if (m === "LOITER" || m === "BRAKE" || m === "POSHOLD" || m === "ALT_HOLD")
        return { color: "var(--accent-indigo)", bg: "rgba(99, 102, 241, 0.12)", border: "rgba(99, 102, 241, 0.25)" };
    if (m === "UNKNOWN")
        return { color: "var(--text-muted)", bg: "rgba(148, 163, 184, 0.10)", border: "var(--border-subtle)" };
    // STABILIZE / ACRO / MANUAL / DRIFT / SPORT / others — pilot in control
    return { color: "var(--text-primary)", bg: "rgba(148, 163, 184, 0.12)", border: "var(--border-subtle)" };
}

export default function ConnectionStatus() {
    const connected = useConnected();
    const { armed, flight_mode } = useHeartbeat();
    const mc = modeColors(flight_mode);

    return (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Connection chip */}
            <div
                className={`status-chip ${connected ? "status-chip--connected" : "status-chip--disconnected"
                    }`}
            >
                <span className="status-chip__dot" />
                {connected ? "CONNECTED" : "DISCONNECTED"}
            </div>

            {/* Armed chip */}
            {connected && (
                <div
                    className={`status-chip ${armed ? "status-chip--armed" : "status-chip--disarmed"
                        }`}
                >
                    <span className="status-chip__dot" />
                    {armed ? "ARMED" : "DISARMED"}
                </div>
            )}

            {/* Live flight mode chip */}
            {connected && (
                <div
                    className="status-chip"
                    title="Current flight mode (RC-controlled)"
                    style={{
                        background: mc.bg,
                        color: mc.color,
                        borderColor: mc.border,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                    }}
                >
                    {flight_mode || "UNKNOWN"}
                </div>
            )}
        </div>
    );
}
