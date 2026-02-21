/** API and WebSocket constants. */

export const API_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
export const WS_URL =
    process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/telemetry";

export const WS_RECONNECT_INTERVAL_MS = 3000;
export const HEARTBEAT_TIMEOUT_MS = 5000;

/** Map tile layers */
export const MAP_TILES = {
    osm: {
        name: "OpenStreetMap",
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution:
            '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
    },
    satellite: {
        name: "Satellite",
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution:
            "&copy; Esri, Maxar, Earthstar Geographics",
    },
    dark: {
        name: "Dark",
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        attribution:
            '&copy; <a href="https://carto.com/">CARTO</a>',
    },
} as const;

/** Default map center (0, 0) until first GPS fix. */
export const DEFAULT_MAP_CENTER: [number, number] = [33.6844, 73.0479]; // Islamabad
export const DEFAULT_MAP_ZOOM = 15;

/** Flight modes available for manual selection. */
export const SELECTABLE_MODES = [
    "STABILIZE",
    "ALT_HOLD",
    "LOITER",
    "AUTO",
    "GUIDED",
    "RTL",
    "LAND",
    "POSHOLD",
    "SMART_RTL",
] as const;
