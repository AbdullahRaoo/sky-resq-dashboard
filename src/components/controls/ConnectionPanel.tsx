/**
 * ConnectionPanel — connection profile selector + connect/disconnect button.
 * Uses Electron IPC instead of REST API.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnected } from "@/hooks/useTelemetry";
import type { ConnectionProfile } from "@/types/telemetry";

export default function ConnectionPanel() {
    const connected = useConnected();
    const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
    const [selectedProfile, setSelectedProfile] = useState<string>("");
    const [loading, setLoading] = useState(false);

    // Fetch connection profiles from Electron main process
    useEffect(() => {
        if (typeof window === "undefined" || !window.electron) return;

        window.electron
            .getConnectionProfiles()
            .then((data: ConnectionProfile[]) => {
                setProfiles(data);
                if (data.length > 0) {
                    setSelectedProfile(data[0].connection_string);
                }
            })
            .catch((err: unknown) => console.error("Failed to fetch profiles:", err));
    }, []);

    const handleConnect = useCallback(async () => {
        if (!selectedProfile || !window.electron) return;
        setLoading(true);

        const profile = profiles.find(
            (p) => p.connection_string === selectedProfile
        );

        try {
            const result = await window.electron.connect({
                connection_string: selectedProfile,
                baud_rate: profile?.baud_rate ?? 57600,
            });
            if (!result.success) {
                console.error("[CMD] Connect failed:", result.message);
            }
        } catch (err) {
            console.error("[CMD] Connect error:", err);
        } finally {
            setLoading(false);
        }
    }, [selectedProfile, profiles]);

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
            <select
                className="connection-select"
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
                disabled={connected || loading}
            >
                {profiles.map((p) => (
                    <option key={p.connection_string} value={p.connection_string}>
                        {p.name} ({p.connection_string})
                    </option>
                ))}
            </select>

            <div className="controls-row">
                {!connected ? (
                    <button
                        className="btn btn--connect"
                        disabled={!selectedProfile || loading}
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
