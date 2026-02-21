/**
 * ModeSelector — flight mode dropdown.
 */

"use client";

import { useState, useCallback } from "react";
import { useConnected, useHeartbeat } from "@/hooks/useTelemetry";
import { API_URL, SELECTABLE_MODES } from "@/lib/constants";

export default function ModeSelector() {
    const connected = useConnected();
    const { flight_mode } = useHeartbeat();
    const [loading, setLoading] = useState(false);

    const handleModeChange = useCallback(
        async (e: React.ChangeEvent<HTMLSelectElement>) => {
            const mode = e.target.value;
            if (!mode || mode === flight_mode) return;

            setLoading(true);
            try {
                const res = await fetch(`${API_URL}/mode/${mode}`, { method: "POST" });
                const data = await res.json();
                if (!data.success) {
                    console.error("[CMD] Set mode failed:", data.message);
                }
            } catch (err) {
                console.error("[CMD] Set mode error:", err);
            } finally {
                setLoading(false);
            }
        },
        [flight_mode]
    );

    return (
        <select
            className="mode-select"
            value={flight_mode}
            onChange={handleModeChange}
            disabled={!connected || loading}
        >
            {SELECTABLE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                    {mode}
                </option>
            ))}
        </select>
    );
}
