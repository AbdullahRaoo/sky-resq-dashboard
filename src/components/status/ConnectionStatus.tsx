/**
 * ConnectionStatus — chip showing connected/disconnected + armed state.
 * Used in the header bar.
 */

"use client";

import { useConnected, useHeartbeat } from "@/hooks/useTelemetry";

export default function ConnectionStatus() {
    const connected = useConnected();
    const { armed } = useHeartbeat();

    return (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Connection chip */}
            <div
                className={`status-chip ${connected ? "status-chip--connected" : "status-chip--disconnected"
                    }`}
            >
                <span className="status-chip__dot" />
                {connected ? "CONNECTED" : "DISCONNECTED"}
            </div>

            {/* Armed chip */}
            {connected && (
                <div
                    className={`status-chip ${armed ? "status-chip--armed" : "status-chip--disarmed"
                        }`}
                >
                    <span className="status-chip__dot" />
                    {armed ? "ARMED" : "DISARMED"}
                </div>
            )}
        </div>
    );
}
