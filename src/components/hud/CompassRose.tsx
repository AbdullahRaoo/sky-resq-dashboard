/**
 * CompassRose — animated heading compass with heading readout below.
 * The outer ring rotates opposite to heading so N always faces actual north.
 */

"use client";

import { useVfrHud } from "@/hooks/useTelemetry";

export default function CompassRose() {
    const { heading } = useVfrHud();

    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const compassDir = dirs[Math.round(((heading % 360 + 360) % 360) / 45) % 8];

    return (
        <div className="instrument-block">
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
            <div className="instrument-readout instrument-readout--heading">
                <div className="instrument-readout__item">
                    <span className="instrument-readout__label">HDG</span>
                    <span className="instrument-readout__value instrument-readout__value--large">{heading}°</span>
                </div>
                <div className="instrument-readout__item">
                    <span className="instrument-readout__dir">{compassDir}</span>
                </div>
            </div>
        </div>
    );
}
