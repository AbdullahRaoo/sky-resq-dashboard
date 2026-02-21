/**
 * GpsStatus — GPS fix type and satellite count badge.
 */

"use client";

import { useGps } from "@/hooks/useTelemetry";

const GPS_FIX_LABELS: Record<number, string> = {
    0: "NO GPS",
    1: "NO FIX",
    2: "2D FIX",
    3: "3D FIX",
    4: "DGPS",
    5: "RTK FLOAT",
    6: "RTK FIX",
};

function getFixClass(fixType: number): string {
    if (fixType >= 3) return "gps-fix--3d";
    if (fixType === 2) return "gps-fix--2d";
    return "gps-fix--none";
}

export default function GpsStatus() {
    const gps = useGps();

    return (
        <div className="gps-status">
            <span className={`gps-fix-badge ${getFixClass(gps.fix_type)}`}>
                {GPS_FIX_LABELS[gps.fix_type] || "UNKNOWN"}
            </span>
            <span className="gps-sats">
                {gps.satellites_visible} sats
            </span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                HDOP {gps.hdop.toFixed(1)}
            </span>
        </div>
    );
}
