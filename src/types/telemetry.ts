/**
 * TypeScript interfaces for drone telemetry state.
 * Mirrors the backend Pydantic models exactly.
 */

export type FlightMode =
    | "STABILIZE"
    | "ACRO"
    | "ALT_HOLD"
    | "AUTO"
    | "GUIDED"
    | "LOITER"
    | "RTL"
    | "CIRCLE"
    | "LAND"
    | "DRIFT"
    | "SPORT"
    | "FLIP"
    | "AUTOTUNE"
    | "POSHOLD"
    | "BRAKE"
    | "THROW"
    | "SMART_RTL"
    | "UNKNOWN";

export interface AttitudeData {
    roll: number;
    pitch: number;
    yaw: number;
    rollspeed: number;
    pitchspeed: number;
    yawspeed: number;
}

export interface PositionData {
    lat: number;
    lon: number;
    alt: number;
    relative_alt: number;
    vx: number;
    vy: number;
    vz: number;
    heading: number;
}

export interface VfrHudData {
    airspeed: number;
    groundspeed: number;
    heading: number;
    throttle: number;
    alt: number;
    climb: number;
}

export interface BatteryData {
    voltage: number;
    current: number;
    remaining: number;
}

export interface GpsData {
    fix_type: number;
    satellites_visible: number;
    hdop: number;
}

export interface HeartbeatData {
    armed: boolean;
    flight_mode: FlightMode;
    system_status: number;
    mav_type: number;
    autopilot: number;
}

export interface DroneState {
    connected: boolean;
    last_heartbeat: number;
    heartbeat: HeartbeatData;
    attitude: AttitudeData;
    position: PositionData;
    vfr_hud: VfrHudData;
    battery: BatteryData;
    gps: GpsData;
    status_text: string;
    timestamp: number;
}

export interface ConnectionProfile {
    name: string;
    connection_string: string;
    baud_rate: number;
    description: string;
}

export interface CommandResponse {
    success: boolean;
    message: string;
}
