/**
 * DroneMap — Leaflet map with live drone marker, heading rotation,
 * flight path trail, home marker, free drag, recenter button,
 * polygon drawing, and waypoint overlay for mission planning.
 */

"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
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
import { useShallow } from "zustand/react/shallow";
import {
    useSurvivorStore,
    selectVisibleDetections,
    selectStatusCounts,
} from "@/store/survivorStore";
import MapLegend from "@/components/map/MapLegend";
import {
    MAP_TILES,
    DEFAULT_MAP_CENTER,
    DEFAULT_MAP_ZOOM,
} from "@/lib/constants";
import { haversineDistance } from "@/lib/surveyGrid";

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

/** Survivor cluster icon — colour reflects status, count badge shown if > 1. */
function createSurvivorIcon(status: string, count: number, selected: boolean): L.DivIcon {
    const palette = {
        new: { ring: "#f87171", fill: "rgba(248,113,113,0.25)", text: "#fecaca" },
        confirmed: { ring: "#fb923c", fill: "rgba(251,146,60,0.25)", text: "#fed7aa" },
        rescued: { ring: "#34d399", fill: "rgba(52,211,153,0.25)", text: "#a7f3d0" },
        false_positive: { ring: "#94a3c0", fill: "rgba(148,163,192,0.18)", text: "#cbd5e1" },
    } as const;
    const c = palette[status as keyof typeof palette] || palette.new;
    const size = selected ? 38 : 30;
    const ringWidth = selected ? 3 : 2;
    const html = `
        <div style="
            position: relative;
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: ${c.fill};
            border: ${ringWidth}px solid ${c.ring};
            box-shadow: 0 0 0 ${selected ? 4 : 0}px ${c.fill}, 0 2px 6px rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Space Grotesk', sans-serif;
            font-weight: 700;
            font-size: ${size > 32 ? 14 : 12}px;
            color: ${c.text};
            ${selected ? "animation: survivor-pulse 1.4s ease-in-out infinite;" : ""}
        ">${count > 1 ? count : "!"}</div>
    `;
    return new L.DivIcon({
        className: "survivor-marker",
        html,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
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

/** Pans the map to the selected survivor whenever the selection changes. */
function SurvivorFocuser({ pos }: { pos: [number, number] | null }) {
    const map = useMap();
    useEffect(() => {
        if (!pos) return;
        map.flyTo(pos, Math.max(map.getZoom(), 17), { duration: 0.6 });
    }, [pos, map]);
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

/** Max distance (m) from the drone where polygon vertices may be placed.
 * Guards against an operator marking a search area on the other side of the
 * city, which would otherwise become a valid GUIDED setpoint. */
const SEARCH_RADIUS_M = 400;

/** Handles map clicks for polygon drawing */
function PolygonDrawHandler() {
    const drawMode = useMissionStore((s) => s.drawMode);
    const addPoint = useMissionStore((s) => s.addPolygonPoint);
    const dronePos = usePosition();
    const map = useMap();
    const [warning, setWarning] = useState<string | null>(null);

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

    useEffect(() => {
        if (!warning) return;
        const timer = setTimeout(() => setWarning(null), 3000);
        return () => clearTimeout(timer);
    }, [warning]);

    useMapEvents({
        click: (e) => {
            if (!drawMode) return;
            const click = { lat: e.latlng.lat, lon: e.latlng.lng };
            // No drone GPS = can't enforce the 400 m fence. Refuse rather than
            // accept a vertex that could end up arbitrarily far from a future
            // armed drone position.
            if (!dronePos || (dronePos.lat === 0 && dronePos.lon === 0)) {
                setWarning(
                    "No drone GPS fix — can't validate 400 m radius. " +
                    "Wait for GPS 3D fix before drawing the search area.",
                );
                return;
            }
            const d = haversineDistance(
                { lat: dronePos.lat, lon: dronePos.lon }, click,
            );
            if (d > SEARCH_RADIUS_M) {
                setWarning(
                    `Vertex ${(d).toFixed(0)} m from drone — limit ${SEARCH_RADIUS_M} m. ` +
                    "Pan closer or zoom in."
                );
                return;
            }
            addPoint(click);
        },
    });

    if (!warning) return null;
    return (
        <div
            role="alert"
            style={{
                position: "absolute", left: "50%", top: 16, transform: "translateX(-50%)",
                zIndex: 1000, padding: "6px 12px",
                background: "rgba(239, 68, 68, 0.92)", color: "#fff",
                borderRadius: 6, fontSize: "0.85rem", pointerEvents: "none",
                boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
            }}
        >{warning}</div>
    );
}

export default function DroneMap() {
    const position = usePosition();
    const heartbeat = useHeartbeat();
    const vfrHud = useVfrHud();
    const connected = useConnected();

    const [tracking, setTracking] = useState(true);
    const [activeLayer, setActiveLayer] = useState<string>("Dark");
    const [pathTrail, setPathTrail] = useState<[number, number][]>([]);
    const [homePos, setHomePos] = useState<[number, number] | null>(null);

    // Mission state
    const polygon = useMissionStore((s) => s.polygon);
    const waypoints = useMissionStore((s) => s.waypoints);
    const currentWP = useMissionStore((s) => s.currentWP);
    const drawMode = useMissionStore((s) => s.drawMode);

    // Survivor markers — both selectors return new arrays/objects every call,
    // so shallow-compare is required to avoid an infinite re-render loop.
    const visibleSurvivors = useSurvivorStore(useShallow(selectVisibleDetections));
    const statusCounts = useSurvivorStore(useShallow(selectStatusCounts));
    const selectedSurvivorId = useSurvivorStore((s) => s.selectedId);
    const setSelectedSurvivor = useSurvivorStore((s) => s.setSelected);
    const selectedSurvivor = visibleSurvivors.find((s) => s.id === selectedSurvivorId);
    const selectedSurvivorPos: [number, number] | null = selectedSurvivor
        ? [selectedSurvivor.lat, selectedSurvivor.lon]
        : null;

    const hasValidPosition = position.lat !== 0 || position.lon !== 0;
    const isDarkMap = activeLayer !== "OpenStreetMap";

    // Update flight path trail — position arrives from Electron IPC, an external system.
    useEffect(() => {
        if (!hasValidPosition) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPathTrail((prev) => {
            const last = prev[prev.length - 1];
            if (last && Math.abs(last[0] - position.lat) <= 0.00001 && Math.abs(last[1] - position.lon) <= 0.00001) {
                return prev;
            }
            const next = [...prev, [position.lat, position.lon] as [number, number]];
            return next.length > 200 ? next.slice(-200) : next;
        });
    }, [position.lat, position.lon, hasValidPosition]);

    // Set home position on first valid fix.
    useEffect(() => {
        if (hasValidPosition && !homePos) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setHomePos([position.lat, position.lon]);
        }
    }, [hasValidPosition, position.lat, position.lon, homePos]);

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
                <SurvivorFocuser pos={selectedSurvivorPos} />
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
                {pathTrail.length > 1 && (
                    <Polyline
                        positions={pathTrail}
                        pathOptions={{
                            color: "#00e5ff",
                            weight: 2,
                            opacity: 0.6,
                            dashArray: "6 4",
                        }}
                    />
                )}

                {/* Survivor cluster markers */}
                {visibleSurvivors.map((s) => (
                    <Marker
                        key={`survivor-${s.id}`}
                        position={[s.lat, s.lon]}
                        icon={createSurvivorIcon(s.status, s.count, s.id === selectedSurvivorId)}
                        eventHandlers={{
                            click: () => setSelectedSurvivor(s.id),
                        }}
                    >
                        <Popup>
                            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.8rem", minWidth: 180 }}>
                                <strong>SURVIVOR #{s.id.slice(-6)}</strong>
                                <br />
                                Status: {s.status.toUpperCase()}
                                <br />
                                People: {s.count}
                                <br />
                                Confidence: {(s.confidence * 100).toFixed(0)}%
                                <br />
                                Lat: {s.lat.toFixed(6)}
                                <br />
                                Lon: {s.lon.toFixed(6)}
                            </div>
                        </Popup>
                    </Marker>
                ))}

                {/* Home marker */}
                {homePos && (
                    <Marker position={homePos} icon={homeIcon}>
                        <Popup>
                            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.8rem" }}>
                                <strong>HOME</strong>
                                <br />
                                Lat: {homePos[0].toFixed(6)}
                                <br />
                                Lon: {homePos[1].toFixed(6)}
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

            {/* Legend / filter overlay */}
            <MapLegend counts={statusCounts} />
        </div>
    );
}
