/**
 * ConnectionPanel — connection profile selector + connect/disconnect button.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnected } from "@/hooks/useTelemetry";
import { API_URL } from "@/lib/constants";
import type { ConnectionProfile } from "@/types/telemetry";

export default function ConnectionPanel() {
    const connected = useConnected();
    const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
    const [selectedProfile, setSelectedProfile] = useState<string>("");
    const [loading, setLoading] = useState(false);

    // Fetch connection profiles on mount
    useEffect(() => {
        fetch(`${API_URL}/connection-profiles`)
            .then((res) => res.json())
            .then((data: ConnectionProfile[]) => {
                setProfiles(data);
                if (data.length > 0) {
                    setSelectedProfile(data[0].connection_string);
                }
            })
            .catch((err) => console.error("Failed to fetch profiles:", err));
    }, []);

    const handleConnect = useCallback(async () => {
        if (!selectedProfile) return;
        setLoading(true);

        const profile = profiles.find(
            (p) => p.connection_string === selectedProfile
        );

        try {
            const res = await fetch(`${API_URL}/connect`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    connection_string: selectedProfile,
                    baud_rate: profile?.baud_rate ?? 57600,
                }),
            });
            const data = await res.json();
            if (!data.success) {
                console.error("[CMD] Connect failed:", data.message);
            }
        } catch (err) {
            console.error("[CMD] Connect error:", err);
        } finally {
            setLoading(false);
        }
    }, [selectedProfile, profiles]);

    const handleDisconnect = useCallback(async () => {
        setLoading(true);
        try {
            await fetch(`${API_URL}/disconnect`, { method: "POST" });
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
