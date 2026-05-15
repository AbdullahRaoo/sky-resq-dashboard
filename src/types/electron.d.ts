/**
 * TypeScript declarations for the Electron IPC bridge.
 * Exposed via contextBridge in preload.js → window.electron
 */

import type { DroneState, CommandResponse, ConnectionProfile } from "./telemetry";

interface ConnectionConfig {
    connection_string: string;
    baud_rate: number;
}

interface ConnectionStatusEvent {
    connected: boolean;
    message: string;
}

interface MissionProgressEvent {
    currentWP: number;
    totalWP: number;
}

export interface SurvivorClusterEvent {
    id: string;
    lat: number;
    lon: number;
    alt?: number;
    count: number;
    confidence: number;
    first_seen_ms: number;
    last_seen_ms: number;
    n_samples?: number;
}

export interface DetectionBoxEvent {
    bbox: [number, number, number, number];
    confidence: number;
    class: string;
    cluster_id: string | null;
}

export interface DetectionFrameEvent {
    frame_ts_ms: number;
    stream_width: number;
    stream_height: number;
    detections: DetectionBoxEvent[];
}

export type PayloadState =
    | "ready"
    | "armed"
    | "confirming"
    | "dropping"
    | "dropped"
    | "fault";

export interface PayloadInterlocks {
    armed: boolean;
    guided: boolean;
    gpsFixOk: boolean;
    batteryOk: boolean;
    altitudeOk: boolean;
    notDropped: boolean;
    linkOk: boolean;
}

export interface PayloadStateEvent {
    state: PayloadState;
    interlocks: PayloadInterlocks;
    message?: string;
    droppedAt?: { lat: number; lon: number; alt: number } | null;
    survivorId?: string | null;
}

export interface PiStatusEvent {
    type: "pi_status";
    ts_ms: number;
    arrivedMs: number;
    uptime_s?: number;
    cpu_temp_c?: number | null;
    cpu_load1?: number;
    ram_used_mb?: number;
    ram_total_mb?: number;
    detector?: { ok: boolean; fps?: number };
    camera?: { ok: boolean; fps?: number };
    gimbal?: { ok: boolean; pitch_deg?: number; yaw_deg?: number };
    fc_link?: { ok: boolean; armed?: boolean };
    gcs_link?: { ok: boolean };
    cluster_count?: number;
}

export interface SarMissionStateEvent {
    state: string;          // "IDLE" | "SEARCH" | "DETECTION_HOLD" | "APPROACH" | "DROP" | "DROP_HOLD" | "RTL" | "DONE"
    sub_state: string;      // current FC flight mode (echoed by orchestrator)
    target_distance_m: number | null;
    altitude_agl_m: number | null;
    battery_remaining: number | null;
    vision_locked: boolean;
    gimbal_healthy: boolean;
    gps_healthy: boolean;
    ts_ms: number;
}

export type ActiveLinkName = "udp" | "sik" | "none";

export interface LinkStatusEvent {
    active: ActiveLinkName;
    forced: ActiveLinkName | "auto";
    sik: { connected: boolean; lastHbMs: number; freshMs: number };
    udp: { connected: boolean; lastHbMs: number; freshMs: number };
}

export interface SystemWarningEvent {
    id: string;
    severity: "warning" | "error";
    title: string;
    message: string;
    hint?: string;
}

export interface AutoDropPolicy {
    enabled: boolean;
    trigger: "manual" | "auto";
    horizontal_tolerance_m: number;
    altitude_min_m: number;
    altitude_max_m: number;
    hold_time_s: number;
    require_active_detection: boolean;
    one_shot: boolean;
}

export interface DeployPayloadOptions {
    survivorId?: string | null;
    /** If true, skip non-critical interlocks. Always blocked by armed/link. */
    force?: boolean;
}

interface MissionWaypoint {
    seq: number;
    lat: number;
    lon: number;
    alt: number;
    command: number;
    holdTime?: number;
}

interface SerialPortInfo {
    path: string;
    manufacturer?: string;
    serialNumber?: string;
    vendorId?: string;
    productId?: string;
    friendlyName: string;
    /** True if scoreSerialPath ranks this as a probable MAVLink device
     * (USB CP2102/CDC-ACM/by-id). False for /dev/ttyS0 motherboard serial. */
    likelyMavlink?: boolean;
}

interface ElectronAPI {
    // Telemetry
    onTelemetry: (callback: (data: DroneState) => void) => () => void;
    onConnectionStatus: (callback: (data: ConnectionStatusEvent) => void) => () => void;
    onMissionProgress: (callback: (data: MissionProgressEvent) => void) => () => void;
    onSurvivorDetection: (callback: (data: SurvivorClusterEvent) => void) => () => void;
    onDetectionFrame: (callback: (data: DetectionFrameEvent) => void) => () => void;
    onPayloadState: (callback: (data: PayloadStateEvent) => void) => () => void;
    onPiStatus: (callback: (data: PiStatusEvent) => void) => () => void;
    onLinkStatus: (callback: (data: LinkStatusEvent) => void) => () => void;
    onSystemWarning: (callback: (data: SystemWarningEvent) => void) => () => void;

    // Commands
    connect: (config: ConnectionConfig) => Promise<CommandResponse>;
    disconnect: () => Promise<CommandResponse>;
    arm: () => Promise<CommandResponse>;
    disarm: () => Promise<CommandResponse>;
    setMode: (modeName: string) => Promise<CommandResponse>;
    getConnectionProfiles: () => Promise<ConnectionProfile[]>;
    listSerialPorts: () => Promise<SerialPortInfo[]>;

    // Mission
    uploadMission: (waypoints: MissionWaypoint[]) => Promise<CommandResponse>;
    clearMission: () => Promise<CommandResponse>;
    flyToPoint: (lat: number, lon: number, alt: number) => Promise<CommandResponse>;
    resetMission: () => Promise<CommandResponse>;

    // Payload (legacy FC-servo path)
    deployPayload: (options?: DeployPayloadOptions) => Promise<CommandResponse>;
    setPayloadPolicy: (policy: Partial<AutoDropPolicy>) => Promise<CommandResponse>;
    getPayloadState: () => Promise<PayloadStateEvent | null>;

    // Payload (simple toggle via Pi GPIO 16 over MAV_CMD_USER_1)
    payloadToggle: (action: "open" | "close" | "toggle") => Promise<CommandResponse>;
    getPayloadOpen: () => Promise<boolean>;
    onPayloadToggleState: (
        callback: (data: { open: boolean; source: string; ts: number }) => void,
    ) => () => void;

    // SAR autonomous mission (Pi sar_orchestrator gate)
    missionEnable: (enable: boolean) => Promise<CommandResponse>;
    onMissionState: (callback: (data: SarMissionStateEvent) => void) => () => void;

    // Gimbal
    setGimbalAngle: (pitch: number, yaw: number) => Promise<CommandResponse>;

    // Link selection
    setActiveLink: (mode: ActiveLinkName | "auto") => Promise<CommandResponse>;

    // Demo
    isDemoLocked: () => Promise<boolean>;

    // Window controls
    minimize: () => void;
    maximize: () => void;
    close: () => void;
}

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}

export { };
