/**
 * DroneMap — Leaflet map with live drone marker, heading rotation,
 * flight path trail, home marker, free drag, recenter button,
 * polygon drawing, and waypoint overlay for mission planning.
 */

"use client";

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Polyline,
    Polygon as LeafletPolygon,
    CircleMarker,
    useMap,
    useMapEvents,
    LayersControl,
} from "react-leaflet";
import L from "leaflet";
import { usePosition, useHeartbeat, useVfrHud, useConnected } from "@/hooks/useTelemetry";
import { useMissionStore } from "@/store/missionStore";
import {
    MAP_TILES,
    DEFAULT_MAP_CENTER,
    DEFAULT_MAP_ZOOM,
} from "@/lib/constants";

import "leaflet/dist/leaflet.css";

/** Create drone icon SVG rotated by heading. Color adapts to map style. */
function createDroneIcon(heading: number, dark = true): L.DivIcon {
    const color = dark ? "#00e5ff" : "#0a3d62";
    const rotation = heading || 0;
    return new L.DivIcon({
        className: "drone-marker",
        html: `<svg width="32" height="32" viewBox="0 0 32 32" style="transform: rotate(${rotation}deg)">
            <polygon points="16,2 26,28 16,22 6,28" fill="${color}" fill-opacity="0.9" stroke="${color}" stroke-width="1.5"/>
        </svg>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    });
}

/** Home position icon */
const homeIcon = new L.DivIcon({
    className: "home-marker",
    html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
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

/** Handles map clicks for polygon drawing */
function PolygonDrawHandler() {
    const drawMode = useMissionStore((s) => s.drawMode);
    const addPoint = useMissionStore((s) => s.addPolygonPoint);
    const map = useMap();

    // Change cursor when in draw mode
    useEffect(() => {
        const container = map.getContainer();
        if (drawMode) {
            container.style.cursor = "crosshair";
        } else {
            container.style.cursor = "";
        }
        return () => { container.style.cursor = ""; };
    }, [drawMode, map]);

    useMapEvents({
        click: (e) => {
            if (drawMode) {
                addPoint({ lat: e.latlng.lat, lon: e.latlng.lng });
            }
        },
    });

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

    // Mission state
    const polygon = useMissionStore((s) => s.polygon);
    const waypoints = useMissionStore((s) => s.waypoints);
    const currentWP = useMissionStore((s) => s.currentWP);
    const drawMode = useMissionStore((s) => s.drawMode);

    const hasValidPosition = position.lat !== 0 || position.lon !== 0;
    const isDarkMap = activeLayer !== "OpenStreetMap";

    // Update flight path trail
    useEffect(() => {
        if (hasValidPosition) {
            const last = pathRef.current[pathRef.current.length - 1];
            // Only add if position moved (avoid flooding)
            if (!last || Math.abs(last[0] - position.lat) > 0.00001 || Math.abs(last[1] - position.lon) > 0.00001) {
                pathRef.current.push([position.lat, position.lon]);
                if (pathRef.current.length > 200) pathRef.current.shift(); // cap at 200 points
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

    // Convert polygon to Leaflet positions
    const polygonPositions: [number, number][] = polygon.map((p) => [p.lat, p.lon]);

    // Convert waypoints to Leaflet positions
    const waypointPositions: [number, number][] = waypoints
        .filter((wp) => wp.command === 16) // NAV_WAYPOINT only
        .map((wp) => [wp.lat, wp.lon]);

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
                <PolygonDrawHandler />

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

                {/* Search area polygon */}
                {polygonPositions.length >= 2 && (
                    <LeafletPolygon
                        positions={polygonPositions}
                        pathOptions={{
                            color: "#818cf8",
                            weight: 2,
                            fillColor: "#818cf8",
                            fillOpacity: 0.1,
                            dashArray: polygonPositions.length < 3 ? "6 4" : undefined,
                        }}
                    />
                )}

                {/* Polygon vertex markers */}
                {drawMode && polygon.map((p, i) => (
                    <CircleMarker
                        key={`vertex-${i}`}
                        center={[p.lat, p.lon]}
                        radius={5}
                        pathOptions={{ color: "#818cf8", fillColor: "#818cf8", fillOpacity: 1, weight: 2 }}
                    />
                ))}

                {/* Survey waypoint path */}
                {waypointPositions.length > 1 && (
                    <Polyline
                        positions={waypointPositions}
                        pathOptions={{
                            color: "#00e5ff",
                            weight: 1.5,
                            opacity: 0.5,
                            dashArray: "4 4",
                        }}
                    />
                )}

                {/* Waypoint markers */}
                {waypoints.filter((wp) => wp.command === 16).map((wp, i) => (
                    <CircleMarker
                        key={`wp-${wp.seq}`}
                        center={[wp.lat, wp.lon]}
                        radius={3}
                        pathOptions={{
                            color: wp.seq <= currentWP ? "#10b981" : "#00e5ff",
                            fillColor: wp.seq <= currentWP ? "#10b981" : "#00e5ff",
                            fillOpacity: wp.seq === currentWP ? 1 : 0.4,
                            weight: 1,
                        }}
                    />
                ))}

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

            {/* Draw mode indicator */}
            {drawMode && (
                <div className="map-draw-indicator">
                    Click map to place vertices • {polygon.length} placed
                </div>
            )}
        </div>
    );
}
