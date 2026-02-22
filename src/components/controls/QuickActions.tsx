/**
 * QuickActions — emergency/convenience flight mode buttons.
 * RTL, LAND, LOITER with safety confirmations.
 */

"use client";

import { useState, useCallback } from "react";
import { useConnected, useHeartbeat } from "@/hooks/useTelemetry";

interface ActionConfig {
    mode: string;
    label: string;
    icon: string;
    color: string;
    bgColor: string;
    borderColor: string;
    confirm: string;
}

const ACTIONS: ActionConfig[] = [
    {
        mode: "RTL",
        label: "RTL",
        icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
        color: "var(--accent-amber)",
        bgColor: "rgba(245, 158, 11, 0.1)",
        borderColor: "rgba(245, 158, 11, 0.3)",
        confirm: "Return to Launch? The drone will fly back to the home position.",
    },
    {
        mode: "LAND",
        label: "LAND",
        icon: "M12 19V5M5 12l7 7 7-7",
        color: "var(--accent-red)",
        bgColor: "rgba(239, 68, 68, 0.1)",
        borderColor: "rgba(239, 68, 68, 0.3)",
        confirm: "Land immediately? The drone will descend at the current position.",
    },
    {
        mode: "LOITER",
        label: "HOLD",
        icon: "M10 9v6M14 9v6M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
        color: "var(--accent-indigo)",
        bgColor: "rgba(99, 102, 241, 0.1)",
        borderColor: "rgba(99, 102, 241, 0.3)",
        confirm: "Hold position? The drone will hover at the current location.",
    },
];

export default function QuickActions() {
    const connected = useConnected();
    const { armed } = useHeartbeat();
    const [confirming, setConfirming] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleAction = useCallback(async (mode: string) => {
        if (!window.electron) return;
        setLoading(true);
        try {
            await window.electron.setMode(mode);
        } catch (e) {
            console.error(`[QuickAction] ${mode} failed:`, e);
        } finally {
            setLoading(false);
            setConfirming(null);
        }
    }, []);

    const action = ACTIONS.find((a) => a.mode === confirming);

    return (
        <>
            <div className="quick-actions">
                {ACTIONS.map((a) => (
                    <button
                        key={a.mode}
                        className="quick-action-btn"
                        style={{ color: a.color, background: a.bgColor, borderColor: a.borderColor } as React.CSSProperties}
                        disabled={!connected || !armed || loading}
                        onClick={() => setConfirming(a.mode)}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d={a.icon} />
                        </svg>
                        {a.label}
                    </button>
                ))}
            </div>

            {confirming && action && (
                <div className="confirm-overlay" onClick={() => setConfirming(null)}>
                    <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="confirm-dialog__title">⚠️ Confirm: {action.label}</div>
                        <div className="confirm-dialog__message">{action.confirm}</div>
                        <div className="confirm-dialog__actions">
                            <button className="confirm-dialog__btn confirm-dialog__btn--cancel" onClick={() => setConfirming(null)}>Cancel</button>
                            <button
                                className="confirm-dialog__btn confirm-dialog__btn--confirm"
                                style={{ background: action.bgColor, color: action.color, borderColor: action.borderColor }}
                                onClick={() => handleAction(action.mode)}
                            >
                                {action.label}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
