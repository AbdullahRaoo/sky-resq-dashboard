/**
 * CompassRose — animated heading compass with cardinal directions.
 * Now also shows roll/pitch/yaw readout below.
 * The outer ring rotates opposite to heading so N always faces actual north.
 */

"use client";

import { useVfrHud, useAttitude } from "@/hooks/useTelemetry";

export default function CompassRose() {
    const { heading } = useVfrHud();
    const { roll, pitch, yaw } = useAttitude();

    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const compassDir = dirs[Math.round(((heading % 360 + 360) % 360) / 45) % 8];

    return (
        <div className="compass-container">
            <div className="compass-readout">
                <span className="compass-readout__deg">{heading}°</span>
                <span className="compass-readout__dir">{compassDir}</span>
            </div>

            <div className="compass-ring-wrapper">
                <div
                    className="compass-ring"
                    style={{ transform: `rotate(${-heading}deg)` }}
                >
                    {["N", "E", "S", "W"].map((dir, i) => (
                        <div
                            key={dir}
                            className={`compass-cardinal ${dir === "N" ? "compass-cardinal--north" : ""}`}
                            style={{ transform: `rotate(${i * 90}deg)` }}
                        >
                            <span className="compass-cardinal__label" style={{ transform: `rotate(${heading - i * 90}deg)` }}>{dir}</span>
                        </div>
                    ))}
                    {[45, 135, 225, 315].map((deg) => (
                        <div key={deg} className="compass-tick" style={{ transform: `rotate(${deg}deg)` }} />
                    ))}
                    {Array.from({ length: 24 }, (_, i) => i * 15).filter(d => d % 45 !== 0).map((deg) => (
                        <div key={deg} className="compass-tick compass-tick--minor" style={{ transform: `rotate(${deg}deg)` }} />
                    ))}
                </div>
                <div className="compass-nose" />
            </div>

            {/* Attitude readout below compass */}
            <div className="compass-attitude">
                <div className="compass-att-item">
                    <span className="compass-att-label">R</span>
                    <span className="compass-att-value">{roll > 0 ? "+" : ""}{roll.toFixed(1)}°</span>
                </div>
                <div className="compass-att-item">
                    <span className="compass-att-label">P</span>
                    <span className="compass-att-value">{pitch > 0 ? "+" : ""}{pitch.toFixed(1)}°</span>
                </div>
                <div className="compass-att-item">
                    <span className="compass-att-label">Y</span>
                    <span className="compass-att-value">{yaw.toFixed(1)}°</span>
                </div>
            </div>
        </div>
    );
}
