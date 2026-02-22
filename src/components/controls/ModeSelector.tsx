/**
 * ModeSelector — flight mode dropdown.
 * Uses Electron IPC instead of REST API.
 */

"use client";

import { useState, useCallback } from "react";
import { useConnected, useHeartbeat } from "@/hooks/useTelemetry";
import { SELECTABLE_MODES } from "@/lib/constants";

export default function ModeSelector() {
    const connected = useConnected();
    const { flight_mode } = useHeartbeat();
    const [loading, setLoading] = useState(false);

    const handleModeChange = useCallback(
        async (e: React.ChangeEvent<HTMLSelectElement>) => {
            const mode = e.target.value;
            if (!mode || mode === flight_mode || !window.electron) return;

            setLoading(true);
            try {
                const result = await window.electron.setMode(mode);
                if (!result.success) {
                    console.error("[CMD] Set mode failed:", result.message);
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
