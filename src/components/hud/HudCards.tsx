/**
 * HudCards — Categorized telemetry data grid.
 * Position, Velocity, and Sensors sections.
 * (Attitude/Heading moved to Orientation section via CompassRose + AttitudeIndicator)
 */

"use client";

import { useVfrHud, usePosition, useGps, useBattery } from "@/hooks/useTelemetry";

/** Convert heading degrees to compass direction. */
function headingToCompass(deg: number): string {
    const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
    return dirs[idx];
}

/** Format lat/lon to DMS. */
function formatCoord(val: number, type: "lat" | "lon"): string {
    if (val === 0) return "—";
    const abs = Math.abs(val);
    const deg = Math.floor(abs);
    const min = ((abs - deg) * 60).toFixed(4);
    const dir = type === "lat" ? (val >= 0 ? "N" : "S") : (val >= 0 ? "E" : "W");
    return `${deg}° ${min}' ${dir}`;
}

export default function HudCards() {
    const hud = useVfrHud();
    const pos = usePosition();
    const gps = useGps();
    const bat = useBattery();

    return (
        <div className="hud-categories">
            {/* ── Position ──────────────────── */}
            <div className="hud-category">
                <div className="hud-category__title">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
                    Position
                </div>
                <div className="hud-row">
                    <span className="hud-row__label">LAT</span>
                    <span className="hud-row__value hud-row__value--mono">{formatCoord(pos.lat, "lat")}</span>
                </div>
                <div className="hud-row">
                    <span className="hud-row__label">LON</span>
                    <span className="hud-row__value hud-row__value--mono">{formatCoord(pos.lon, "lon")}</span>
                </div>
                <div className="hud-row">
                    <span className="hud-row__label">ALT (MSL)</span>
                    <span className="hud-row__value hud-row__value--mono">{hud.alt.toFixed(1)}<span className="hud-row__unit">m</span></span>
                </div>
                <div className="hud-row">
                    <span className="hud-row__label">ALT (AGL)</span>
                    <span className="hud-row__value hud-row__value--mono">{pos.relative_alt.toFixed(1)}<span className="hud-row__unit">m</span></span>
                </div>
            </div>

            {/* ── Velocity ──────────────────── */}
            <div className="hud-category">
                <div className="hud-category__title">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                    Velocity
                </div>
                <div className="hud-mini-grid">
                    <div className="hud-mini-card">
                        <div className="hud-mini-card__label">GND SPD</div>
                        <div className="hud-mini-card__value">{hud.groundspeed.toFixed(1)}<span className="hud-mini-card__unit">m/s</span></div>
                    </div>
                    <div className="hud-mini-card">
                        <div className="hud-mini-card__label">AIR SPD</div>
                        <div className="hud-mini-card__value">{hud.airspeed.toFixed(1)}<span className="hud-mini-card__unit">m/s</span></div>
                    </div>
                    <div className="hud-mini-card">
                        <div className="hud-mini-card__label">V/S</div>
                        <div className="hud-mini-card__value" style={{ color: hud.climb > 0.5 ? "var(--accent-emerald)" : hud.climb < -0.5 ? "var(--accent-red)" : "var(--text-bright)" }}>
                            {hud.climb > 0 ? "+" : ""}{hud.climb.toFixed(1)}<span className="hud-mini-card__unit">m/s</span>
                        </div>
                    </div>
                    <div className="hud-mini-card">
                        <div className="hud-mini-card__label">THROTTLE</div>
                        <div className="hud-mini-card__value">{hud.throttle}<span className="hud-mini-card__unit">%</span></div>
                    </div>
                </div>
            </div>

            {/* ── Sensors ──────────────────── */}
            <div className="hud-category">
                <div className="hud-category__title">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                    Sensors
                </div>
                <div className="hud-row">
                    <span className="hud-row__label">GPS</span>
                    <span className="hud-row__value">
                        <span className={`hud-fix-badge ${gps.fix_type >= 3 ? "hud-fix--3d" : gps.fix_type === 2 ? "hud-fix--2d" : "hud-fix--none"}`}>
                            {gps.fix_type >= 3 ? "3D FIX" : gps.fix_type === 2 ? "2D FIX" : "NO FIX"}
                        </span>
                    </span>
                </div>
                <div className="hud-row">
                    <span className="hud-row__label">SATS</span>
                    <span className="hud-row__value hud-row__value--mono">{gps.satellites_visible}</span>
                </div>
                <div className="hud-row">
                    <span className="hud-row__label">HDOP</span>
                    <span className="hud-row__value hud-row__value--mono">{gps.hdop.toFixed(1)}</span>
                </div>
                <div className="hud-row">
                    <span className="hud-row__label">BATTERY</span>
                    <span className="hud-row__value hud-row__value--mono" style={{
                        color: bat.remaining > 50 ? "var(--accent-emerald)" : bat.remaining > 20 ? "var(--accent-amber)" : "var(--accent-red)"
                    }}>
                        {bat.remaining >= 0 ? `${bat.remaining}%` : "N/A"} · {bat.voltage.toFixed(1)}V
                    </span>
                </div>
            </div>
        </div>
    );
}
