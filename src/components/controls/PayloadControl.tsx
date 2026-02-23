/**
 * PayloadControl — Rescue payload drop button with safety confirmation.
 * Sends MAV_CMD_DO_SET_SERVO to release the payload latch.
 */

"use client";

import { useState, useCallback } from "react";
import { useConnected, useHeartbeat } from "@/hooks/useTelemetry";

export default function PayloadControl() {
    const connected = useConnected();
    const { armed } = useHeartbeat();
    const [confirming, setConfirming] = useState(false);
    const [deployed, setDeployed] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleDeploy = useCallback(async () => {
        if (!window.electron) return;
        setLoading(true);
        try {
            const result = await window.electron.deployPayload();
            if (result.success) {
                setDeployed(true);
            }
        } catch (e) {
            console.error("[Payload] Deploy failed:", e);
        } finally {
            setLoading(false);
            setConfirming(false);
        }
    }, []);

    return (
        <div className="payload-control">
            <div className="payload-status">
                <div className="payload-status__icon">
                    {deployed ? "📦" : "🪂"}
                </div>
                <div className="payload-status__text">
                    {deployed ? "PAYLOAD RELEASED" : "PAYLOAD ARMED"}
                </div>
            </div>

            {!confirming ? (
                <button
                    className="payload-btn"
                    disabled={!connected || !armed || deployed || loading}
                    onClick={() => setConfirming(true)}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M12 19V5M5 12l7 7 7-7" />
                    </svg>
                    Deploy Rescue Payload
                </button>
            ) : (
                <div className="payload-confirm">
                    <div className="payload-confirm__msg">⚠️ Release payload at current position?</div>
                    <div className="payload-confirm__actions">
                        <button className="payload-confirm__btn payload-confirm__btn--cancel" onClick={() => setConfirming(false)}>
                            Cancel
                        </button>
                        <button className="payload-confirm__btn payload-confirm__btn--deploy" onClick={handleDeploy} disabled={loading}>
                            {loading ? "Deploying..." : "CONFIRM DROP"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
