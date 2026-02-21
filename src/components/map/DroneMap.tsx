/**
 * DroneMap — Leaflet map with live drone marker and multiple tile layers.
 * Client-only component (Leaflet requires window).
 */

"use client";

import { useEffect, useRef, useMemo } from "react";
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    useMap,
    LayersControl,
} from "react-leaflet";
import L from "leaflet";
import { usePosition, useHeartbeat, useVfrHud } from "@/hooks/useTelemetry";
import {
    MAP_TILES,
    DEFAULT_MAP_CENTER,
    DEFAULT_MAP_ZOOM,
} from "@/lib/constants";

import "leaflet/dist/leaflet.css";

/** Custom drone icon */
const droneIcon = L.divIcon({
    className: "drone-marker",
    html: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="14" fill="rgba(0,229,255,0.15)" stroke="#00e5ff" stroke-width="2"/>
    <polygon points="16,6 22,22 16,18 10,22" fill="#00e5ff" opacity="0.9"/>
  </svg>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
});

/** Sub-component: Follows drone position on the map */
function MapFollower({ lat, lon }: { lat: number; lon: number }) {
    const map = useMap();
    const hasValidPos = lat !== 0 || lon !== 0;

    useEffect(() => {
        if (hasValidPos) {
            map.setView([lat, lon], map.getZoom(), { animate: true });
        }
    }, [lat, lon, hasValidPos, map]);

    return null;
}

export default function DroneMap() {
    const position = usePosition();
    const heartbeat = useHeartbeat();
    const vfrHud = useVfrHud();

    const hasValidPosition = position.lat !== 0 || position.lon !== 0;
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
                <LayersControl position="topright">
                    <LayersControl.BaseLayer name={MAP_TILES.dark.name} checked>
                        <TileLayer
                            attribution={MAP_TILES.dark.attribution}
                            url={MAP_TILES.dark.url}
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name={MAP_TILES.osm.name}>
                        <TileLayer
                            attribution={MAP_TILES.osm.attribution}
                            url={MAP_TILES.osm.url}
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name={MAP_TILES.satellite.name}>
                        <TileLayer
                            attribution={MAP_TILES.satellite.attribution}
                            url={MAP_TILES.satellite.url}
                        />
                    </LayersControl.BaseLayer>
                </LayersControl>

                {hasValidPosition && (
                    <>
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
                                    Lat: {position.lat.toFixed(6)}
                                    <br />
                                    Lon: {position.lon.toFixed(6)}
                                </div>
                            </Popup>
                        </Marker>
                        <MapFollower lat={position.lat} lon={position.lon} />
                    </>
                )}
            </MapContainer>
        </div>
    );
}
