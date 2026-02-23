/**
 * ConnectionPanel — simple connect/disconnect button.
 * COM port and baud rate are configured in Settings.
 */

"use client";

import { useState, useCallback } from "react";
import { useConnected } from "@/hooks/useTelemetry";
import { useSettingsStore } from "@/store/settingsStore";

export default function ConnectionPanel() {
    const connected = useConnected();
    const { comPort, baudRate } = useSettingsStore();
    const [loading, setLoading] = useState(false);

    const handleConnect = useCallback(async () => {
        if (!window.electron) return;
        setLoading(true);
        try {
            const result = await window.electron.connect({
                connection_string: comPort,
                baud_rate: baudRate,
            });
            if (!result.success) {
                console.error("[CMD] Connect failed:", result.message);
            }
        } catch (err) {
            console.error("[CMD] Connect error:", err);
        } finally {
            setLoading(false);
        }
    }, [comPort, baudRate]);

    const handleDisconnect = useCallback(async () => {
        if (!window.electron) return;
        setLoading(true);
        try {
            await window.electron.disconnect();
        } catch (err) {
            console.error("[CMD] Disconnect error:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    return (
        <div>
            <div className="connection-info">
                <span className="connection-info__port">{comPort}</span>
                <span className="connection-info__baud">{baudRate} baud</span>
            </div>
            <div className="controls-row">
                {!connected ? (
                    <button
                        className="btn btn--connect"
                        disabled={loading}
                        onClick={handleConnect}
                    >
                        {loading ? "Connecting..." : "Connect"}
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
