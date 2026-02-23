/**
 * AlertPanel — notification toasts for critical GCS events.
 * Handles: survivor detections, battery warnings, GPS loss.
 * GPS alert only fires after 10 seconds of valid connection to avoid
 * false positives during initial telemetry handshake.
 */

"use client";

import { useEffect, useRef } from "react";
import { useSurvivorStore, type GcsAlert } from "@/store/survivorStore";
import { useBattery, useGps, useConnected } from "@/hooks/useTelemetry";
import { useSettingsStore } from "@/store/settingsStore";

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
        case "survivor": return <span className="alert-icon">🚨</span>;
        case "battery_critical": return <span className="alert-icon">⚡</span>;
        case "battery_low": return <span className="alert-icon">🔋</span>;
        case "gps_loss": return <span className="alert-icon">📡</span>;
        case "link_lost": return <span className="alert-icon">📶</span>;
        default: return <span className="alert-icon">ℹ️</span>;
    }
}

export default function AlertPanel() {
    const { alerts, addAlert, dismissAlert } = useSurvivorStore();
    const battery = useBattery();
    const gps = useGps();
    const connected = useConnected();
    const { lowBatPercent, critBatPercent } = useSettingsStore();

    const lastBatWarn = useRef(0);
    const lastGpsWarn = useRef(0);
    const connectTime = useRef(0);

    // Track when connection starts to avoid false GPS alerts
    useEffect(() => {
        if (connected) {
            connectTime.current = Date.now();
        } else {
            connectTime.current = 0;
        }
    }, [connected]);

    // Battery alerts — use settings thresholds
    useEffect(() => {
        if (!connected || battery.remaining < 0) return;
        const now = Date.now();
        if (battery.remaining <= critBatPercent && now - lastBatWarn.current > 30000) {
            lastBatWarn.current = now;
            addAlert({ type: "battery_critical", title: "CRITICAL BATTERY", message: `Battery at ${battery.remaining}% — ${battery.voltage.toFixed(1)}V. RTL recommended!` });
            playAlertBeep(440, 300);
        } else if (battery.remaining <= lowBatPercent && battery.remaining > critBatPercent && now - lastBatWarn.current > 60000) {
            lastBatWarn.current = now;
            addAlert({ type: "battery_low", title: "Low Battery", message: `Battery at ${battery.remaining}% — ${battery.voltage.toFixed(1)}V` });
        }
    }, [battery.remaining, battery.voltage, connected, addAlert, lowBatPercent, critBatPercent]);

    // GPS loss alert — only after 10s of being connected (avoids false positives on connect)
    useEffect(() => {
        if (!connected) return;
        const now = Date.now();
        const connectedFor = now - connectTime.current;
        // Wait 10 seconds after connecting before checking GPS
        if (connectedFor < 10000) return;
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
