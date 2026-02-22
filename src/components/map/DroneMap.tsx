/**
 * DroneMap — Leaflet map with live drone marker, heading rotation,
 * flight path trail, home marker, free drag, and recenter button.
 */

"use client";

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Polyline,
    useMap,
    useMapEvents,
    LayersControl,
} from "react-leaflet";
import L from "leaflet";
import { usePosition, useHeartbeat, useVfrHud, useConnected } from "@/hooks/useTelemetry";
import {
    MAP_TILES,
    DEFAULT_MAP_CENTER,
    DEFAULT_MAP_ZOOM,
} from "@/lib/constants";

import "leaflet/dist/leaflet.css";

/** Create drone icon SVG rotated by heading. Color adapts to map style. */
function createDroneIcon(heading: number, dark = true): L.DivIcon {
    const color = dark ? "#00e5ff" : "#1e40af";
    const bg = dark ? "rgba(0,229,255,0.15)" : "rgba(30,64,175,0.15)";
    const glow = dark ? "filter: drop-shadow(0 0 6px rgba(0,229,255,0.5));" : "";

    return L.divIcon({
        className: "drone-marker-custom",
        html: `<div style="transform: rotate(${heading}deg); ${glow}">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="18" cy="18" r="16" fill="${bg}" stroke="${color}" stroke-width="2"/>
                <polygon points="18,6 24,26 18,21 12,26" fill="${color}" opacity="0.9"/>
            </svg>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
    });
}

/** Home icon */
const homeIcon = L.divIcon({
    className: "home-marker",
    html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" fill="rgba(16,185,129,0.2)" stroke="#10b981" stroke-width="2"/>
        <path d="M12 6l-6 5v7h4v-4h4v4h4v-7l-6-5z" fill="#10b981" opacity="0.8"/>
    </svg>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
});

/** Detects user map interaction to disable auto-follow */
function MapInteractionDetector({ onUserInteract }: { onUserInteract: () => void }) {
    useMapEvents({
        dragstart: onUserInteract,
        zoomstart: onUserInteract,
    });
    return null;
}

/** Follows drone position when tracking is enabled */
function MapFollower({ lat, lon, tracking }: { lat: number; lon: number; tracking: boolean }) {
    const map = useMap();
    const hasValidPos = lat !== 0 || lon !== 0;

    useEffect(() => {
        if (hasValidPos && tracking) {
            map.setView([lat, lon], map.getZoom(), { animate: true });
        }
    }, [lat, lon, hasValidPos, tracking, map]);

    return null;
}

export default function DroneMap() {
    const position = usePosition();
    const heartbeat = useHeartbeat();
    const vfrHud = useVfrHud();
    const connected = useConnected();

    const [tracking, setTracking] = useState(true);
    const [activeLayer, setActiveLayer] = useState<string>("Dark");
    const pathRef = useRef<[number, number][]>([]);
    const homeRef = useRef<[number, number] | null>(null);

    const hasValidPosition = position.lat !== 0 || position.lon !== 0;
    const isDarkMap = activeLayer !== "OpenStreetMap";

    // Update flight path trail
    useEffect(() => {
        if (hasValidPosition) {
            const last = pathRef.current[pathRef.current.length - 1];
            // Only add if position moved (avoid flooding)
            if (!last || Math.abs(last[0] - position.lat) > 0.000001 || Math.abs(last[1] - position.lon) > 0.000001) {
                pathRef.current = [...pathRef.current.slice(-200), [position.lat, position.lon]];
            }
        }
    }, [position.lat, position.lon, hasValidPosition]);

    // Set home position on first valid fix
    useEffect(() => {
        if (hasValidPosition && !homeRef.current) {
            homeRef.current = [position.lat, position.lon];
        }
    }, [hasValidPosition, position.lat, position.lon]);

    const handleUserInteract = useCallback(() => setTracking(false), []);
    const handleRecenter = useCallback(() => setTracking(true), []);

    const droneIcon = useMemo(
        () => createDroneIcon(vfrHud.heading, isDarkMap),
        [vfrHud.heading, isDarkMap]
    );

    const center: [number, number] = hasValidPosition
        ? [position.lat, position.lon]
        : DEFAULT_MAP_CENTER;

    return (
        <div className="map-container">
            <MapContainer
                center={center}
                zoom={DEFAULT_MAP_ZOOM}
                zoomControl={true}
                style={{ height: "100%", width: "100%" }}
            >
                <MapInteractionDetector onUserInteract={handleUserInteract} />
                <MapFollower lat={position.lat} lon={position.lon} tracking={tracking} />

                <LayersControl position="topright">
                    <LayersControl.BaseLayer name={MAP_TILES.dark.name} checked>
                        <TileLayer attribution={MAP_TILES.dark.attribution} url={MAP_TILES.dark.url}
                            eventHandlers={{ add: () => setActiveLayer("Dark") }} />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name={MAP_TILES.osm.name}>
                        <TileLayer attribution={MAP_TILES.osm.attribution} url={MAP_TILES.osm.url}
                            eventHandlers={{ add: () => setActiveLayer("OpenStreetMap") }} />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name={MAP_TILES.satellite.name}>
                        <TileLayer attribution={MAP_TILES.satellite.attribution} url={MAP_TILES.satellite.url}
                            eventHandlers={{ add: () => setActiveLayer("Satellite") }} />
                    </LayersControl.BaseLayer>
                </LayersControl>

                {/* Flight path trail */}
                {pathRef.current.length > 1 && (
                    <Polyline
                        positions={pathRef.current}
                        pathOptions={{
                            color: "#00e5ff",
                            weight: 2,
                            opacity: 0.6,
                            dashArray: "6 4",
                        }}
                    />
                )}

                {/* Home marker */}
                {homeRef.current && (
                    <Marker position={homeRef.current} icon={homeIcon}>
                        <Popup>
                            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.8rem" }}>
                                <strong>HOME</strong>
                                <br />
                                Lat: {homeRef.current[0].toFixed(6)}
                                <br />
                                Lon: {homeRef.current[1].toFixed(6)}
                            </div>
                        </Popup>
                    </Marker>
                )}

                {/* Drone marker */}
                {hasValidPosition && (
                    <Marker position={[position.lat, position.lon]} icon={droneIcon}>
                        <Popup>
                            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.8rem" }}>
                                <strong>{heartbeat.flight_mode}</strong>
                                {heartbeat.armed ? " (ARMED)" : " (DISARMED)"}
                                <br />
                                Alt: {position.relative_alt.toFixed(1)}m
                                <br />
                                Speed: {vfrHud.groundspeed.toFixed(1)} m/s
                                <br />
                                Heading: {vfrHud.heading}°
                                <br />
                                Lat: {position.lat.toFixed(6)}
                                <br />
                                Lon: {position.lon.toFixed(6)}
                            </div>
                        </Popup>
                    </Marker>
                )}
            </MapContainer>

            {/* Recenter button */}
            {connected && !tracking && (
                <button className="map-recenter-btn" onClick={handleRecenter} aria-label="Recenter on drone">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                    </svg>
                </button>
            )}
        </div>
    );
}
