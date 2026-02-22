/**
 * Header — top bar with title, inline telemetry readout, and status chips.
 */

"use client";

import ConnectionStatus from "@/components/status/ConnectionStatus";
import { useConnected, useVfrHud, useGps, useBattery } from "@/hooks/useTelemetry";

export default function Header() {
    const connected = useConnected();
    const hud = useVfrHud();
    const gps = useGps();
    const bat = useBattery();

    return (
        <header className="header">
            <div className="header-left">
                <div>
                    <div className="header-title">Sky ResQ</div>
                    <div className="header-subtitle">Ground Control Station</div>
                </div>

                {/* Inline telemetry bar — only visible when connected */}
                {connected && (
                    <div className="header-telemetry">
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
                <ConnectionStatus />
            </div>
        </header>
    );
}
