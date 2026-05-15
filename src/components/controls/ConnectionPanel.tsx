/**
 * ConnectionPanel — connect/disconnect button.
 * Auto-detects environment:
 *   - Electron → uses IPC (window.electron.connect)
 *   - Browser  → uses Web Serial API for SiK radio
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import { useConnected } from "@/hooks/useTelemetry";
import { useSettingsStore } from "@/store/settingsStore";
import {
    isElectron,
    isWebSerialAvailable,
    webSerialConnect,
    webSerialDisconnect,
} from "@/lib/webSerial";

type ConnectionMode = "electron" | "webserial" | "none";

interface SerialPortInfo {
    path: string;
    friendlyName?: string;
    manufacturer?: string;
}

const GENERIC_PLACEHOLDER_PORTS = new Set(["COM3", "/dev/ttyUSB0", "/dev/cu.usbserial-0001"]);

function getBrowserPlatformDefaultPort() {
    if (typeof window === "undefined") return "COM3";
    const platform = window.navigator.platform.toLowerCase();
    if (platform.includes("win")) return "COM3";
    if (platform.includes("mac")) return "/dev/cu.usbserial-0001";
    return "/dev/ttyUSB0";
}

export default function ConnectionPanel() {
    const connected = useConnected();
    const { comPort, baudRate, updateSettings } = useSettingsStore();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<ConnectionMode>("none");
    const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
    const [portsRefreshing, setPortsRefreshing] = useState(false);

    // Detect environment on mount
    useEffect(() => {
        if (isElectron()) {
            setMode("electron");
        } else if (isWebSerialAvailable()) {
            setMode("webserial");
        } else {
            setMode("none");
        }
    }, []);

    useEffect(() => {
        if (mode !== "electron" || !window.electron) return;

        let isMounted = true;

        const hydrateConnectionDefaults = async () => {
            setPortsRefreshing(true);
            try {
                const [profiles, detectedPorts] = await Promise.all([
                    window.electron.getConnectionProfiles(),
                    window.electron.listSerialPorts(),
                ]);

                if (!isMounted) return;

                const filteredPorts = detectedPorts.filter((p) => !!p.path);
                setSerialPorts(filteredPorts);

                const radioProfile = profiles.find((profile) => profile.name === "Radio Telemetry") || profiles[0];
                const profilePort = radioProfile?.connection_string;
                const profileBaud = radioProfile?.baud_rate;

                // listSerialPorts returns ports sorted best-first (USB SiK/CP2102
                // ranked above motherboard /dev/ttyS0). Prefer the first likely-
                // MAVLink port. Replace any persisted choice that isn't itself a
                // likely-MAVLink port — this fixes the "settings.persist remembered
                // /dev/ttyS0 and now never picks the SiK" regression we hit.
                const bestLikely = filteredPorts.find((p) => p.likelyMavlink);
                const currentEntry = filteredPorts.find((p) => p.path === comPort);
                const preferredPort =
                    currentEntry?.path ||
                    bestLikely?.path ||
                    filteredPorts[0]?.path ||
                    profilePort ||
                    getBrowserPlatformDefaultPort();

                const shouldReplaceCurrentPort =
                    !comPort ||
                    GENERIC_PLACEHOLDER_PORTS.has(comPort) ||
                    !currentEntry ||
                    (currentEntry && !currentEntry.likelyMavlink && !!bestLikely);

                if (shouldReplaceCurrentPort && preferredPort !== comPort) {
                    updateSettings({ comPort: preferredPort });
                }

                if (profileBaud && profileBaud !== baudRate) {
                    updateSettings({ baudRate: profileBaud });
                }
            } catch {
                if (isMounted) {
                    setSerialPorts([]);
                }
            } finally {
                if (isMounted) {
                    setPortsRefreshing(false);
                }
            }
        };

        hydrateConnectionDefaults();

        return () => {
            isMounted = false;
        };
    }, [mode, comPort, baudRate, updateSettings]);

    const handleConnect = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            if (mode === "electron" && window.electron) {
                const result = await window.electron.connect({
                    connection_string: comPort,
                    baud_rate: baudRate,
                });
                if (!result.success) {
                    setError(result.message ?? "Connection failed");
                }
            } else if (mode === "webserial") {
                const result = await webSerialConnect(baudRate);
                if (!result.success) {
                    setError(result.message);
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Connection error");
        } finally {
            setLoading(false);
        }
    }, [mode, comPort, baudRate]);

    const handleDisconnect = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            if (mode === "electron" && window.electron) {
                await window.electron.disconnect();
            } else if (mode === "webserial") {
                await webSerialDisconnect();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Disconnect error");
        } finally {
            setLoading(false);
        }
    }, [mode]);

    const modeLabel = mode === "electron" ? "Serial (IPC)" : mode === "webserial" ? "Web Serial" : "No Connection";

    return (
        <div>
            <div className="connection-info">
                {mode === "electron" && (
                    <span className="connection-info__port">
                        {portsRefreshing ? "Scanning serial ports..." : comPort}
                    </span>
                )}
                <span className="connection-info__baud">{baudRate} baud</span>
                <span className="connection-info__mode">{modeLabel}</span>
            </div>

            {mode === "electron" && serialPorts.length > 0 && (
                <div className="connection-info" style={{ marginTop: 8 }}>
                    <span className="connection-info__mode">
                        Port detected: {serialPorts[0].path}
                        {serialPorts[0].friendlyName ? ` (${serialPorts[0].friendlyName})` : ""}
                    </span>
                </div>
            )}

            {mode === "none" && (
                <div className="connection-warning">
                    Serial not available. Use Chrome/Edge for Web Serial, or run as desktop app.
                </div>
            )}

            {error && (
                <div className="connection-error">{error}</div>
            )}

            <div className="controls-row">
                {!connected ? (
                    <button
                        className="btn btn--connect"
                        disabled={loading || mode === "none"}
                        onClick={handleConnect}
                    >
                        {loading ? "Connecting..." : mode === "webserial" ? "Select Port & Connect" : "Connect"}
                    </button>
                ) : (
                    <button
                        className="btn btn--disconnect"
                        disabled={loading}
                        onClick={handleDisconnect}
                    >
                        Disconnect
                    </button>
                )}
            </div>
        </div>
    );
}
