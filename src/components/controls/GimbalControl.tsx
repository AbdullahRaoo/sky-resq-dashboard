/**
 * GimbalControl — Camera pitch/yaw controller with preset angles.
 * Architecture ready for MAV_CMD_DO_MOUNT_CONTROL integration.
 */

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useConnected } from "@/hooks/useTelemetry";

const PRESETS = [
    { name: "Nadir", pitch: -90, yaw: 0, icon: "↓" },
    { name: "Forward", pitch: 0, yaw: 0, icon: "→" },
    { name: "45°", pitch: -45, yaw: 0, icon: "↘" },
];

export default function GimbalControl() {
    const connected = useConnected();
    const [pitch, setPitch] = useState(-90);
    const [yaw, setYaw] = useState(0);
    const [busy, setBusy] = useState(false);
    const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    /** Send MAV_CMD_DO_MOUNT_CONTROL via IPC; coalesce rapid slider changes. */
    const dispatchGimbal = useCallback((p: number, y: number) => {
        if (!window.electron?.setGimbalAngle) return;
        setBusy(true);
        window.electron.setGimbalAngle(p, y).finally(() => setBusy(false));
    }, []);

    const queueDispatch = useCallback((p: number, y: number) => {
        if (sendTimer.current) clearTimeout(sendTimer.current);
        sendTimer.current = setTimeout(() => dispatchGimbal(p, y), 150);
    }, [dispatchGimbal]);

    useEffect(() => {
        if (!connected) return;
        queueDispatch(pitch, yaw);
        return () => {
            if (sendTimer.current) clearTimeout(sendTimer.current);
        };
    }, [pitch, yaw, connected, queueDispatch]);

    const applyPreset = useCallback((p: number, y: number) => {
        setPitch(p);
        setYaw(y);
        // Immediate dispatch for presets (skip the debounce).
        if (sendTimer.current) clearTimeout(sendTimer.current);
        dispatchGimbal(p, y);
    }, [dispatchGimbal]);

    return (
        <div className="gimbal-control" data-busy={busy ? "true" : "false"}>
            <div className="gimbal-presets">
                {PRESETS.map((preset) => (
                    <button
                        key={preset.name}
                        className={`gimbal-preset-btn ${pitch === preset.pitch && yaw === preset.yaw ? "gimbal-preset-btn--active" : ""}`}
                        onClick={() => applyPreset(preset.pitch, preset.yaw)}
                        disabled={!connected}
                    >
                        <span className="gimbal-preset-icon">{preset.icon}</span>
                        {preset.name}
                    </button>
                ))}
            </div>

            <div className="gimbal-sliders">
                <div className="gimbal-slider">
                    <label className="gimbal-slider__label">
                        Pitch <span className="gimbal-slider__value">{pitch}°</span>
                    </label>
                    <input
                        type="range"
                        className="gimbal-slider__input"
                        min={-90} max={30} step={5}
                        value={pitch}
                        onChange={(e) => setPitch(Number(e.target.value))}
                        disabled={!connected}
                    />
                </div>
                <div className="gimbal-slider">
                    <label className="gimbal-slider__label">
                        Yaw <span className="gimbal-slider__value">{yaw}°</span>
                    </label>
                    <input
                        type="range"
                        className="gimbal-slider__input"
                        min={-180} max={180} step={5}
                        value={yaw}
                        onChange={(e) => setYaw(Number(e.target.value))}
                        disabled={!connected}
                    />
                </div>
            </div>
        </div>
    );
}
