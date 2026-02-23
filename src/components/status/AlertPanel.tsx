/**
 * AlertPanel — notification toasts and alert history for critical GCS events.
 * Handles: survivor detections, battery warnings, GPS loss, link degradation.
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSurvivorStore, type GcsAlert } from "@/store/survivorStore";
import { useBattery, useGps, useConnected } from "@/hooks/useTelemetry";

/** Play a short beep using Web Audio API. */
function playAlertBeep(frequency = 880, duration = 150) {
    try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = frequency;
        gain.gain.value = 0.15;
        osc.start();
        osc.stop(ctx.currentTime + duration / 1000);
    } catch { /* audio not available */ }
}

function AlertIcon({ type }: { type: GcsAlert["type"] }) {
    switch (type) {
        case "survivor":
            return <span className="alert-icon alert-icon--survivor">🚨</span>;
        case "battery_critical":
            return <span className="alert-icon alert-icon--critical">⚡</span>;
        case "battery_low":
            return <span className="alert-icon alert-icon--warning">🔋</span>;
        case "gps_loss":
            return <span className="alert-icon alert-icon--warning">📡</span>;
        case "link_lost":
            return <span className="alert-icon alert-icon--critical">📶</span>;
        default:
            return <span className="alert-icon alert-icon--info">ℹ️</span>;
    }
}

export default function AlertPanel() {
    const { alerts, addAlert, dismissAlert } = useSurvivorStore();
    const battery = useBattery();
    const gps = useGps();
    const connected = useConnected();
    const lastBatWarn = useRef(0);
    const lastGpsWarn = useRef(0);

    // Auto-generate battery alerts
    useEffect(() => {
        if (!connected || battery.remaining < 0) return;
        const now = Date.now();
        if (battery.remaining <= 15 && now - lastBatWarn.current > 30000) {
            lastBatWarn.current = now;
            addAlert({ type: "battery_critical", title: "CRITICAL BATTERY", message: `Battery at ${battery.remaining}% — ${battery.voltage.toFixed(1)}V. RTL recommended!` });
            playAlertBeep(440, 300);
        } else if (battery.remaining <= 30 && battery.remaining > 15 && now - lastBatWarn.current > 60000) {
            lastBatWarn.current = now;
            addAlert({ type: "battery_low", title: "Low Battery", message: `Battery at ${battery.remaining}% — ${battery.voltage.toFixed(1)}V` });
        }
    }, [battery.remaining, battery.voltage, connected, addAlert]);

    // GPS loss alert
    useEffect(() => {
        if (!connected) return;
        const now = Date.now();
        if (gps.fix_type < 2 && gps.satellites_visible < 4 && now - lastGpsWarn.current > 30000) {
            lastGpsWarn.current = now;
            addAlert({ type: "gps_loss", title: "GPS Degraded", message: `Fix: ${gps.fix_type}, Sats: ${gps.satellites_visible}` });
        }
    }, [gps.fix_type, gps.satellites_visible, connected, addAlert]);

    const activeAlerts = alerts.filter((a) => !a.dismissed);

    if (activeAlerts.length === 0) return null;

    return (
        <div className="alert-panel">
            {activeAlerts.slice(0, 3).map((alert) => (
                <div key={alert.id} className={`alert-toast alert-toast--${alert.type}`}>
                    <AlertIcon type={alert.type} />
                    <div className="alert-toast__content">
                        <div className="alert-toast__title">{alert.title}</div>
                        <div className="alert-toast__msg">{alert.message}</div>
                    </div>
                    <button className="alert-toast__close" onClick={() => dismissAlert(alert.id)}>✕</button>
                </div>
            ))}
        </div>
    );
}
