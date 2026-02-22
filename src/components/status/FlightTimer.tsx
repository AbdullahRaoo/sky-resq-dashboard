/**
 * FlightTimer — shows elapsed flight time since armed.
 * Starts on arm, pauses on disarm.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useHeartbeat } from "@/hooks/useTelemetry";

function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function FlightTimer() {
    const { armed } = useHeartbeat();
    const [elapsed, setElapsed] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (armed) {
            intervalRef.current = setInterval(() => {
                setElapsed((prev) => prev + 1);
            }, 1000);
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [armed]);

    return (
        <div className="flight-timer">
            <div className="flight-timer__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
            </div>
            <div className="flight-timer__info">
                <div className="flight-timer__label">FLIGHT TIME</div>
                <div className={`flight-timer__value ${armed ? "flight-timer__value--active" : ""}`}>
                    {formatTime(elapsed)}
                </div>
            </div>
            {armed && <div className="flight-timer__pulse" />}
        </div>
    );
}
