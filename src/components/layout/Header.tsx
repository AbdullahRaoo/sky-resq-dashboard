/**
 * Header — top bar with title, inline telemetry readout, and status chips.
 */

"use client";

import { useEffect, useState } from "react";
import ConnectionStatus from "@/components/status/ConnectionStatus";
import PiBadge from "@/components/status/PiBadge";
import LinkDots from "@/components/status/LinkDots";
import { useConnected, useVfrHud, useGps, useBattery } from "@/hooks/useTelemetry";
import { useDemoStore } from "@/store/demoStore";

export default function Header() {
    const connected = useConnected();
    const hud = useVfrHud();
    const gps = useGps();
    const bat = useBattery();
    const demoMode = useDemoStore((s) => s.demoMode);
    const setDemoMode = useDemoStore((s) => s.setDemoMode);
    const [demoLocked, setDemoLocked] = useState(false);

    // If the operator launched the GCS with DEMO_MODE=1, force demo mode on
    // at mount and disable the toggle.
    useEffect(() => {
        if (!window.electron?.isDemoLocked) return;
        window.electron.isDemoLocked().then((locked) => {
            if (locked) {
                setDemoLocked(true);
                setDemoMode(true);
            }
        }).catch(() => { /* ignore */ });
    }, [setDemoMode]);

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
                <button
                    onClick={() => !demoLocked && setDemoMode(!demoMode)}
                    disabled={demoLocked}
                    title={
                        demoLocked
                            ? "Demo mode is hard-locked via DEMO_MODE=1"
                            : demoMode
                                ? "Exit demo mode"
                                : "Enter demo mode"
                    }
                    style={{
                        marginRight: 12,
                        padding: "4px 12px",
                        borderRadius: "var(--radius-sm)",
                        border: `1px solid ${demoMode ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                        background: demoMode ? "var(--accent-primary-dim)" : "transparent",
                        color: demoMode ? "var(--accent-primary)" : "var(--text-secondary)",
                        fontWeight: 700,
                        fontSize: "0.74rem",
                        letterSpacing: "0.06em",
                        cursor: demoLocked ? "not-allowed" : "pointer",
                        opacity: demoLocked ? 0.7 : 1,
                    }}
                >
                    {demoMode ? "● DEMO" : "DEMO"}
                    {demoLocked && <span style={{ marginLeft: 4 }}>🔒</span>}
                </button>
                <ConnectionStatus />
            </div>
        </header>
    );
}
