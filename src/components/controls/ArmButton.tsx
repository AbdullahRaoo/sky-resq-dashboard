/**
 * ArmButton — safe arm/disarm control with confirmation dialog.
 * Uses Electron IPC instead of REST API.
 */

"use client";

import { useState, useCallback } from "react";
import { useConnected, useHeartbeat } from "@/hooks/useTelemetry";

export default function ArmButton() {
    const connected = useConnected();
    const { armed } = useHeartbeat();
    const [loading, setLoading] = useState(false);
    const [showConfirm, setShowConfirm] = useState<"arm" | "disarm" | null>(null);

    const sendCommand = useCallback(async (action: "arm" | "disarm") => {
        if (!window.electron) return;
        setLoading(true);
        try {
            const result = action === "arm"
                ? await window.electron.arm()
                : await window.electron.disarm();
            if (!result.success) {
                console.error(`[CMD] ${action} failed:`, result.message);
            }
        } catch (e) {
            console.error(`[CMD] ${action} error:`, e);
        } finally {
            setLoading(false);
            setShowConfirm(null);
        }
    }, []);

    return (
        <>
            <div className="controls-row">
                {!armed ? (
                    <button
                        className="btn btn--arm"
                        disabled={!connected || loading}
                        onClick={() => setShowConfirm("arm")}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M12 2v20M2 12h20" />
                        </svg>
                        ARM
                    </button>
                ) : (
                    <button
                        className="btn btn--disarm"
                        disabled={!connected || loading}
                        onClick={() => setShowConfirm("disarm")}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                        DISARM
                    </button>
                )}
            </div>

            {/* Confirmation Dialog */}
            {showConfirm && (
                <div className="confirm-overlay" onClick={() => setShowConfirm(null)}>
                    <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="confirm-dialog__title">
                            {showConfirm === "arm" ? "⚠️ Arm Motors?" : "🛑 Disarm Motors?"}
                        </div>
                        <div className="confirm-dialog__message">
                            {showConfirm === "arm"
                                ? "This will arm the drone motors. Ensure the area is clear and the drone is in a safe position."
                                : "This will disarm the drone motors. If airborne, the drone will fall."}
                        </div>
                        <div className="confirm-dialog__actions">
                            <button
                                className="confirm-dialog__btn confirm-dialog__btn--cancel"
                                onClick={() => setShowConfirm(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="confirm-dialog__btn confirm-dialog__btn--confirm"
                                onClick={() => sendCommand(showConfirm)}
                            >
                                {showConfirm === "arm" ? "ARM" : "DISARM"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
