/**
 * Header — top bar with title, inline telemetry readout, and status chips.
 */

"use client";

import ConnectionStatus from "@/components/status/ConnectionStatus";
import PiBadge from "@/components/status/PiBadge";
import LinkDots from "@/components/status/LinkDots";
import { useConnected, useVfrHud, useGps, useBattery, useHeartbeat } from "@/hooks/useTelemetry";

// Color-code flight modes by operational character so the operator sees at a
// glance whether the drone is in an autonomous, manual, or safety/recovery
// mode without reading the label.
function modeColor(mode: string): string {
    const m = mode.toUpperCase();
    if (m === "AUTO" || m === "GUIDED") return "var(--accent-emerald)";
    if (m === "RTL" || m === "LAND" || m === "SMART_RTL") return "var(--accent-amber)";
    if (m === "LOITER" || m === "BRAKE" || m === "POSHOLD" || m === "ALT_HOLD") return "var(--accent-indigo)";
    if (m === "STABILIZE" || m === "ACRO" || m === "MANUAL") return "var(--text-primary)";
    if (m === "UNKNOWN") return "var(--text-muted)";
    return "var(--text-primary)";
}

export default function Header() {
    const connected = useConnected();
    const hud = useVfrHud();
    const gps = useGps();
    const bat = useBattery();
    const { flight_mode } = useHeartbeat();

    return (
        <header className="header">
            <div className="header-left">
                <img src="/skyresq long.png" alt="Sky ResQ" className="header-brand-logo" />
                <div>
                    <div className="header-subtitle">Ground Control Station</div>
                </div>

                {/* Inline telemetry bar — only visible when connected */}
                {connected && (
                    <div className="header-telemetry">
                        <span className="header-telem-item">
                            <span className="header-telem-label">MODE</span>
                            <span
                                className="header-telem-value"
                                style={{ color: modeColor(flight_mode), fontWeight: 700 }}
                            >
                                {flight_mode}
                            </span>
                        </span>
                        <span className="header-telem-sep">│</span>
                        <span className="header-telem-item">
                            <span className="header-telem-label">ALT</span>
                            <span className="header-telem-value">{hud.alt.toFixed(1)}m</span>
                        </span>
                        <span className="header-telem-sep">│</span>
                        <span className="header-telem-item">
                            <span className="header-telem-label">SPD</span>
                            <span className="header-telem-value">{hud.groundspeed.toFixed(1)}m/s</span>
                        </span>
                        <span className="header-telem-sep">│</span>
                        <span className="header-telem-item">
                            <span className="header-telem-label">SATS</span>
                            <span className="header-telem-value" style={{
                                color: gps.satellites_visible >= 6 ? "var(--accent-emerald)" : gps.satellites_visible >= 3 ? "var(--accent-amber)" : "var(--accent-red)"
                            }}>{gps.satellites_visible}</span>
                        </span>
                        <span className="header-telem-sep">│</span>
                        <span className="header-telem-item">
                            <span className="header-telem-label">BAT</span>
                            <span className="header-telem-value" style={{
                                color: bat.remaining > 50 ? "var(--accent-emerald)" : bat.remaining > 20 ? "var(--accent-amber)" : "var(--accent-red)"
                            }}>{bat.remaining >= 0 ? `${bat.remaining}%` : "N/A"}</span>
                        </span>
                    </div>
                )}
            </div>

            <div className="header-right">
                <LinkDots />
                <PiBadge />
                <ConnectionStatus />
            </div>
        </header>
    );
}
