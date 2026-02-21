/**
 * BatteryIndicator — battery gauge with voltage and percentage.
 */

"use client";

import { useBattery } from "@/hooks/useTelemetry";

export default function BatteryIndicator() {
    const battery = useBattery();

    const pct = battery.remaining >= 0 ? battery.remaining : 0;
    const fillClass =
        pct > 50 ? "battery-fill--high" : pct > 20 ? "battery-fill--mid" : "battery-fill--low";

    return (
        <div className="battery-gauge">
            <div className="battery-icon">
                <div
                    className={`battery-fill ${fillClass}`}
                    style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
            </div>
            <div className="battery-info">
                <div className="battery-percent">
                    {battery.remaining >= 0 ? `${battery.remaining}%` : "N/A"}
                </div>
                <div className="battery-voltage">
                    {battery.voltage.toFixed(1)}V &middot; {battery.current.toFixed(1)}A
                </div>
            </div>
        </div>
    );
}
