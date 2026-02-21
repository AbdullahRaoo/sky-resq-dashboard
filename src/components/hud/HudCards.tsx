/**
 * HUD data cards — Altitude, Speed, Heading, Throttle, Climb Rate.
 */

"use client";

import { useVfrHud } from "@/hooks/useTelemetry";

export default function HudCards() {
    const hud = useVfrHud();

    return (
        <div className="hud-grid">
            <div className="hud-card">
                <div className="hud-card__label">Altitude</div>
                <div className="hud-card__value">
                    {hud.alt.toFixed(1)}
                    <span className="hud-card__unit">m</span>
                </div>
            </div>
            <div className="hud-card">
                <div className="hud-card__label">GND Speed</div>
                <div className="hud-card__value">
                    {hud.groundspeed.toFixed(1)}
                    <span className="hud-card__unit">m/s</span>
                </div>
            </div>
            <div className="hud-card">
                <div className="hud-card__label">Heading</div>
                <div className="hud-card__value">
                    {hud.heading}
                    <span className="hud-card__unit">°</span>
                </div>
            </div>
            <div className="hud-card">
                <div className="hud-card__label">Throttle</div>
                <div className="hud-card__value">
                    {hud.throttle}
                    <span className="hud-card__unit">%</span>
                </div>
            </div>
            <div className="hud-card">
                <div className="hud-card__label">Airspeed</div>
                <div className="hud-card__value">
                    {hud.airspeed.toFixed(1)}
                    <span className="hud-card__unit">m/s</span>
                </div>
            </div>
            <div className="hud-card">
                <div className="hud-card__label">Climb</div>
                <div className="hud-card__value">
                    {hud.climb.toFixed(1)}
                    <span className="hud-card__unit">m/s</span>
                </div>
            </div>
        </div>
    );
}
