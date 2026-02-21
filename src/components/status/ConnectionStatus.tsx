/**
 * ConnectionStatus — chip showing connected/disconnected + armed state.
 * Used in the header bar.
 */

"use client";

import { useConnected, useHeartbeat } from "@/hooks/useTelemetry";

export default function ConnectionStatus() {
    const connected = useConnected();
    const { armed, flight_mode } = useHeartbeat();

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

            {/* Flight mode chip */}
            {connected && (
                <div className="status-chip" style={{
                    background: "rgba(99, 102, 241, 0.12)",
                    color: "var(--accent-indigo)",
                    borderColor: "rgba(99, 102, 241, 0.25)",
                }}>
                    {flight_mode}
                </div>
            )}
        </div>
    );
}
