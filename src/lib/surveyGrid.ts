/**
 * Survey Grid Generator — calculates lawnmower waypoints inside a polygon.
 *
 * Given a polygon (disaster zone boundary), altitude, and scan-line spacing,
 * generates parallel east-west scan lines that cover the entire area.
 * Returns waypoints in MAVLink-compatible format.
 */

import type { LatLng, Waypoint } from "@/store/missionStore";

/** Earth radius in meters. */
const EARTH_R = 6371000;

/** Convert degrees to radians. */
function deg2rad(d: number): number { return d * Math.PI / 180; }

/** Convert radians to degrees. */
function rad2deg(r: number): number { return r * 180 / Math.PI; }

/**
 * Offset a lat/lon by meters in the north and east directions.
 */
function offsetLatLon(lat: number, lon: number, northM: number, eastM: number): LatLng {
    const dLat = northM / EARTH_R;
    const dLon = eastM / (EARTH_R * Math.cos(deg2rad(lat)));
    return {
        lat: lat + rad2deg(dLat),
        lon: lon + rad2deg(dLon),
    };
}

/**
 * Distance between two lat/lon points in meters (Haversine).
 */
function haversineDistance(a: LatLng, b: LatLng): number {
    const dLat = deg2rad(b.lat - a.lat);
    const dLon = deg2rad(b.lon - a.lon);
    const sa = Math.sin(dLat / 2);
    const so = Math.sin(dLon / 2);
    const h = sa * sa + Math.cos(deg2rad(a.lat)) * Math.cos(deg2rad(b.lat)) * so * so;
    return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

/**
 * Check if a point is inside a polygon (ray casting algorithm).
 */
function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const pi = polygon[i], pj = polygon[j];
        if ((pi.lat > point.lat) !== (pj.lat > point.lat) &&
            point.lon < (pj.lon - pi.lon) * (point.lat - pi.lat) / (pj.lat - pi.lat) + pi.lon) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Find the intersection X-coordinates of a horizontal line at `lat` with polygon edges.
 */
function scanLineIntersections(lat: number, polygon: LatLng[]): number[] {
    const intersections: number[] = [];
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const pi = polygon[i], pj = polygon[j];
        if ((pi.lat <= lat && pj.lat > lat) || (pj.lat <= lat && pi.lat > lat)) {
            const t = (lat - pi.lat) / (pj.lat - pi.lat);
            intersections.push(pi.lon + t * (pj.lon - pi.lon));
        }
    }
    return intersections.sort((a, b) => a - b);
}

/**
 * Generate a lawnmower (boustrophedon) survey grid inside a polygon.
 *
 * @param polygon - The disaster zone boundary vertices
 * @param altitude - Flight altitude in meters AGL
 * @param spacingM - Distance between parallel scan lines in meters
 * @returns Array of waypoints for the mission
 */
export function generateLawnmowerGrid(
    polygon: LatLng[],
    altitude: number,
    spacingM: number
): Waypoint[] {
    if (polygon.length < 3) return [];

    // Find bounding box
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;
    for (const p of polygon) {
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLon = Math.min(minLon, p.lon);
        maxLon = Math.max(maxLon, p.lon);
    }

    // Convert spacing to lat delta
    const latSpacing = rad2deg(spacingM / EARTH_R);

    // Generate scan lines (east-west) from south to north
    const waypoints: Waypoint[] = [];
    let seq = 0;
    let leftToRight = true;

    // Add takeoff waypoint at polygon centroid
    const centroid: LatLng = {
        lat: polygon.reduce((s, p) => s + p.lat, 0) / polygon.length,
        lon: polygon.reduce((s, p) => s + p.lon, 0) / polygon.length,
    };
    waypoints.push({
        seq: seq++,
        lat: centroid.lat,
        lon: centroid.lon,
        alt: altitude,
        command: 22, // MAV_CMD_NAV_TAKEOFF
    });

    for (let lat = minLat + latSpacing / 2; lat <= maxLat; lat += latSpacing) {
        const intersections = scanLineIntersections(lat, polygon);

        // Process pairs of intersections
        for (let i = 0; i < intersections.length - 1; i += 2) {
            const lonStart = intersections[i];
            const lonEnd = intersections[i + 1];

            if (leftToRight) {
                waypoints.push({ seq: seq++, lat, lon: lonStart, alt: altitude, command: 16 }); // MAV_CMD_NAV_WAYPOINT
                waypoints.push({ seq: seq++, lat, lon: lonEnd, alt: altitude, command: 16 });
            } else {
                waypoints.push({ seq: seq++, lat, lon: lonEnd, alt: altitude, command: 16 });
                waypoints.push({ seq: seq++, lat, lon: lonStart, alt: altitude, command: 16 });
            }
        }

        leftToRight = !leftToRight;
    }

    // Add RTL at the end
    waypoints.push({
        seq: seq++,
        lat: centroid.lat,
        lon: centroid.lon,
        alt: altitude,
        command: 20, // MAV_CMD_NAV_RETURN_TO_LAUNCH
    });

    return waypoints;
}

/**
 * Calculate the optimal scan-line spacing from camera FOV and overlap.
 * @param altitude - Flight altitude in meters
 * @param overlapPercent - Desired overlap percentage (0-100)
 * @param fovDeg - Camera field of view in degrees (default: 60° for typical camera)
 * @returns Spacing in meters between scan lines
 */
export function calculateSpacing(altitude: number, overlapPercent: number, fovDeg = 60): number {
    const footprint = 2 * altitude * Math.tan(deg2rad(fovDeg / 2));
    return footprint * (1 - overlapPercent / 100);
}
