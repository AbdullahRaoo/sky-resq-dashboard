/**
 * Mission Planning Store — manages survey polygon, waypoints,
 * mission state, active waypoint tracking, and rescue payload policy.
 */

import { create } from "zustand";
import type {
    PayloadState,
    PayloadInterlocks,
    AutoDropPolicy,
} from "@/types/electron";

export interface LatLng {
    lat: number;
    lon: number;
}

export interface Waypoint {
    seq: number;
    lat: number;
    lon: number;
    alt: number;
    command: number; // MAV_CMD
    holdTime?: number;
}

export type MissionState = "idle" | "planning" | "uploading" | "uploaded" | "active" | "paused" | "completed";

export interface SurveyConfig {
    altitude: number;   // meters AGL
    overlap: number;    // percentage (0-100)
    speed: number;      // m/s
    spacing: number;    // meters between scan lines (derived from overlap + altitude)
}

interface MissionStore {
    // Survey
    polygon: LatLng[];
    surveyConfig: SurveyConfig;

    // Waypoints
    waypoints: Waypoint[];
    currentWP: number;
    totalWP: number;

    // State
    missionState: MissionState;
    drawMode: boolean;

    // Payload (driven by Electron main process)
    autoDropPolicy: AutoDropPolicy;
    payloadState: PayloadState;
    payloadInterlocks: PayloadInterlocks;

    // Actions
    setPolygon: (points: LatLng[]) => void;
    addPolygonPoint: (point: LatLng) => void;
    removeLastPolygonPoint: () => void;
    clearPolygon: () => void;
    setSurveyConfig: (config: Partial<SurveyConfig>) => void;
    setWaypoints: (wps: Waypoint[]) => void;
    setMissionState: (state: MissionState) => void;
    setCurrentWP: (wp: number) => void;
    setDrawMode: (on: boolean) => void;
    resetMission: () => void;

    setAutoDropPolicy: (p: Partial<AutoDropPolicy>) => void;
    setPayloadState: (state: PayloadState) => void;
    setPayloadInterlocks: (interlocks: PayloadInterlocks) => void;
}

const defaultSurveyConfig: SurveyConfig = {
    altitude: 30,
    overlap: 60,
    speed: 5,
    spacing: 20,
};

const defaultAutoDropPolicy: AutoDropPolicy = {
    enabled: false,
    trigger: "manual",
    horizontal_tolerance_m: 1.0,
    altitude_min_m: 2.0,
    altitude_max_m: 5.0,
    hold_time_s: 3.0,
    require_active_detection: true,
    one_shot: true,
};

const defaultInterlocks: PayloadInterlocks = {
    armed: false,
    guided: false,
    gpsFixOk: false,
    batteryOk: false,
    altitudeOk: false,
    notDropped: true,
    linkOk: false,
};

export const useMissionStore = create<MissionStore>((set) => ({
    polygon: [],
    surveyConfig: defaultSurveyConfig,
    waypoints: [],
    currentWP: 0,
    totalWP: 0,
    missionState: "idle",
    drawMode: false,

    autoDropPolicy: defaultAutoDropPolicy,
    payloadState: "ready",
    payloadInterlocks: defaultInterlocks,

    setPolygon: (points) => set({ polygon: points }),
    addPolygonPoint: (point) => set((s) => ({ polygon: [...s.polygon, point] })),
    removeLastPolygonPoint: () => set((s) => ({ polygon: s.polygon.slice(0, -1) })),
    clearPolygon: () => set({ polygon: [], waypoints: [], totalWP: 0, currentWP: 0, missionState: "idle" }),
    setSurveyConfig: (config) => set((s) => ({ surveyConfig: { ...s.surveyConfig, ...config } })),
    setWaypoints: (wps) => set({ waypoints: wps, totalWP: wps.length, currentWP: 0 }),
    setMissionState: (state) => set({ missionState: state }),
    setCurrentWP: (wp) => set({ currentWP: wp }),
    setDrawMode: (on) => set({ drawMode: on }),
    resetMission: () => set({
        polygon: [],
        waypoints: [],
        currentWP: 0,
        totalWP: 0,
        missionState: "idle",
        drawMode: false,
        surveyConfig: defaultSurveyConfig,
        payloadState: "ready",
    }),

    setAutoDropPolicy: (p) => set((s) => ({ autoDropPolicy: { ...s.autoDropPolicy, ...p } })),
    setPayloadState: (state) => set({ payloadState: state }),
    setPayloadInterlocks: (interlocks) => set({ payloadInterlocks: interlocks }),
}));
