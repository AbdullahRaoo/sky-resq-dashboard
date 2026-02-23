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

export default function ConnectionPanel() {
    const connected = useConnected();
    const { comPort, baudRate } = useSettingsStore();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<ConnectionMode>("none");

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
                    <span className="connection-info__port">{comPort}</span>
                )}
                <span className="connection-info__baud">{baudRate} baud</span>
                <span className="connection-info__mode">{modeLabel}</span>
            </div>

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
