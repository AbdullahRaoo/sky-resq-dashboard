/**
 * AttitudeIndicator — Artificial horizon with Roll/Pitch/Yaw readout below.
 * CSS-based (no canvas) for simplicity and performance.
 */

"use client";

import { useAttitude } from "@/hooks/useTelemetry";

export default function AttitudeIndicator() {
    const { roll, pitch, yaw } = useAttitude();

    const clampedPitch = Math.max(-45, Math.min(45, pitch));
    const pitchOffset = clampedPitch * 1.5;

    return (
        <div className="instrument-block">
            <div className="attitude-indicator" role="img" aria-label={`Attitude: roll ${roll.toFixed(1)}° pitch ${pitch.toFixed(1)}°`}>
                <div
                    className="attitude-sky"
                    style={{
                        transform: `rotate(${-roll}deg) translateY(${pitchOffset}px)`,
                    }}
                />
                <div className="attitude-center-mark" />
            </div>
            <div className="instrument-readout">
                <div className="instrument-readout__item">
                    <span className="instrument-readout__label">R</span>
                    <span className="instrument-readout__value">{roll > 0 ? "+" : ""}{roll.toFixed(1)}°</span>
                </div>
                <div className="instrument-readout__item">
                    <span className="instrument-readout__label">P</span>
                    <span className="instrument-readout__value">{pitch > 0 ? "+" : ""}{pitch.toFixed(1)}°</span>
                </div>
                <div className="instrument-readout__item">
                    <span className="instrument-readout__label">Y</span>
                    <span className="instrument-readout__value">{yaw.toFixed(1)}°</span>
                </div>
            </div>
        </div>
    );
}
