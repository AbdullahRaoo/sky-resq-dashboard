/**
 * PayloadControl — simple OPEN/CLOSED toggle for the rescue payload servo.
 *
 * Talks to the Pi via MAV_CMD_USER_1 over the active MAVLink link (SiK
 * primary, 4G/Tailscale secondary). ArduPilot routes the command to the
 * companion Pi where mavlink_bridge fans it out to payload_servo, which
 * drives the GPIO 16 hobby servo.
 *
 * Bench-friendly: no flight-status interlocks. The Pi servo can be tested
 * with the drone sitting on a desk.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnected } from "@/hooks/useTelemetry";

export default function PayloadControl() {
    const connected = useConnected();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [lastSource, setLastSource] = useState<string | null>(null);
    const [resultMsg, setResultMsg] = useState<string | null>(null);

    // Hydrate from main process + subscribe to PLDOPEN NAMED_VALUE_INT echoes.
    useEffect(() => {
        if (!window.electron) return;
        let unsubscribe: (() => void) | null = null;
        window.electron.getPayloadOpen().then(setOpen).catch(() => {});
        unsubscribe = window.electron.onPayloadToggleState((evt) => {
            setOpen(evt.open);
            setLastSource(evt.source);
        });
        return () => { if (unsubscribe) unsubscribe(); };
    }, []);

    const handleToggle = useCallback(async () => {
        if (!window.electron || busy) return;
        const action = open ? "close" : "open";
        // Optimistic flip; we'll reconcile against the next NAMED_VALUE_INT.
        setOpen(!open);
        setBusy(true);
        setResultMsg(null);
        try {
            const result = await window.electron.payloadToggle(action);
            setResultMsg(result.message || (result.success ? "sent" : "failed"));
            if (!result.success) {
                // Revert optimistic flip on hard failure (e.g. not connected).
                setOpen(open);
            }
        } catch (e) {
            setOpen(open);
            setResultMsg(e instanceof Error ? e.message : "Toggle failed");
        } finally {
            setBusy(false);
        }
    }, [open, busy]);

    return (
        <div className="payload-control">
            <div className="payload-state-row">
                <span className="payload-state-row__label">Payload</span>
                <span
                    className={`payload-state-badge payload-state-badge--${open ? "armed" : "ready"}`}
                    title={lastSource ? `last update via ${lastSource.toUpperCase()}` : undefined}
                >
                    {open ? "OPEN" : "CLOSED"}
                </span>
            </div>

            <button
                className="payload-btn"
                disabled={!connected || busy}
                onClick={handleToggle}
                title={open ? "Close / grab" : "Open / release"}
                style={{
                    background: open
                        ? "linear-gradient(180deg, var(--accent-warning), #b45309)"
                        : undefined,
                }}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    {open ? (
                        <>
                            <path d="M19 12H5M12 5l-7 7 7 7" />
                        </>
                    ) : (
                        <path d="M12 19V5M5 12l7 7 7-7" />
                    )}
                </svg>
                {busy ? "Sending..." : open ? "Close Payload" : "Release Payload"}
            </button>

            {resultMsg && (
                <div style={{ marginTop: 8, fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                    {resultMsg}
                </div>
            )}

            <div style={{ marginTop: 10, fontSize: "0.7rem", opacity: 0.55, lineHeight: 1.35 }}>
                Routes via MAV_CMD_USER_1 → Pi GPIO 16. Primary link: SiK radio.
                State echoes back as NAMED_VALUE_INT(PLDOPEN).
            </div>
        </div>
    );
}
