/**
 * AttitudeIndicator — Artificial horizon showing roll and pitch.
 *
 * CSS-based (no canvas) for simplicity and performance.
 * Updates at the telemetry store's refresh rate.
 */

"use client";

import { useAttitude } from "@/hooks/useTelemetry";

export default function AttitudeIndicator() {
    const { roll, pitch } = useAttitude();

    // Clamp pitch to reasonable visual range (-45° to +45°)
    const clampedPitch = Math.max(-45, Math.min(45, pitch));
    // Each degree of pitch = ~1.5px on the 180px indicator
    const pitchOffset = clampedPitch * 1.5;

    return (
        <div className="attitude-container">
            <div className="attitude-indicator" role="img" aria-label={`Attitude: roll ${roll.toFixed(1)}° pitch ${pitch.toFixed(1)}°`}>
                {/* Sky/Ground split — rotates with roll, translates with pitch */}
                <div
                    className="attitude-sky"
                    style={{
                        transform: `rotate(${-roll}deg) translateY(${pitchOffset}px)`,
                    }}
                />

                {/* Center reference mark (fixed) */}
                <div className="attitude-center-mark" />

                {/* Roll/Pitch readout */}
                <div
                    style={{
                        position: "absolute",
                        bottom: 8,
                        left: 0,
                        right: 0,
                        textAlign: "center",
                        fontSize: "0.65rem",
                        fontFamily: "JetBrains Mono, monospace",
                        color: "rgba(255,255,255,0.7)",
                        zIndex: 20,
                    }}
                >
                    R {roll.toFixed(1)}° &nbsp; P {pitch.toFixed(1)}°
                </div>
            </div>
        </div>
    );
}
