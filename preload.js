/**
 * Sky ResQ Dashboard — Electron Preload Script
 *
 * Securely exposes a typed API to the renderer process via contextBridge.
 * All communication goes through IPC — no nodeIntegration.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
    // ── Telemetry stream ──────────────────────────────────────
    /** Listen for 10Hz telemetry updates from the main process. */
    onTelemetry: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on("telemetry-update", handler);
        return () => ipcRenderer.removeListener("telemetry-update", handler);
    },

    /** Listen for connection status changes. */
    onConnectionStatus: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on("connection-status", handler);
        return () => ipcRenderer.removeListener("connection-status", handler);
    },

    /** Listen for mission progress updates. */
    onMissionProgress: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on("mission-progress", handler);
        return () => ipcRenderer.removeListener("mission-progress", handler);
    },

    /** Listen for survivor cluster updates from the Pi pipeline. */
    onSurvivorDetection: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on("survivor-detection", handler);
        return () => ipcRenderer.removeListener("survivor-detection", handler);
    },

    /** Listen for per-frame detection bounding boxes (video overlay). */
    onDetectionFrame: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on("detection-frame", handler);
        return () => ipcRenderer.removeListener("detection-frame", handler);
    },

    /** Listen for payload state transitions (READY/ARMED/CONFIRMING/.../DROPPED/FAULT). */
    onPayloadState: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on("payload-state", handler);
        return () => ipcRenderer.removeListener("payload-state", handler);
    },

    /** Listen for Pi companion-computer status heartbeats (§1.4). */
    onPiStatus: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on("pi-status", handler);
        return () => ipcRenderer.removeListener("pi-status", handler);
    },

    /** Listen for MAVLink link health snapshots (4G + SiK failover, §8.5). */
    onLinkStatus: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on("link-status", handler);
        return () => ipcRenderer.removeListener("link-status", handler);
    },

    /** Listen for non-fatal system warnings (UDP bind failures, etc.). */
    onSystemWarning: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on("system-warning", handler);
        return () => ipcRenderer.removeListener("system-warning", handler);
    },

    // ── Commands (invoke = async with response) ───────────────
    /** Connect to a MAVLink source. */
    connect: (config) => ipcRenderer.invoke("mavlink-connect", config),

    /** Disconnect from the current MAVLink source. */
    disconnect: () => ipcRenderer.invoke("mavlink-disconnect"),

    /** Arm drone motors. */
    arm: () => ipcRenderer.invoke("mavlink-arm"),

    /** Disarm drone motors. */
    disarm: () => ipcRenderer.invoke("mavlink-disarm"),

    /** Set flight mode by name. */
    setMode: (modeName) => ipcRenderer.invoke("mavlink-set-mode", modeName),

    /** Get available connection profiles. */
    getConnectionProfiles: () => ipcRenderer.invoke("get-connection-profiles"),

    /** Get currently detected host serial ports. */
    listSerialPorts: () => ipcRenderer.invoke("mavlink-list-serial-ports"),

    // ── Mission Commands ──────────────────────────────────────
    /** Upload mission waypoints to the drone. */
    uploadMission: (waypoints) => ipcRenderer.invoke("mavlink-upload-mission", waypoints),

    /** Clear the current mission on the drone. */
    clearMission: () => ipcRenderer.invoke("mavlink-clear-mission"),

    /** Fly to a specific GPS coordinate (GUIDED mode). */
    flyToPoint: (lat, lon, alt) => ipcRenderer.invoke("mavlink-fly-to", { lat, lon, alt }),

    /** Reset payload one-shot + mission progress flags. */
    resetMission: () => ipcRenderer.invoke("mavlink-reset-mission"),

    /** Command the gimbal to a (pitch, yaw) angle in degrees. */
    setGimbalAngle: (pitch, yaw) => ipcRenderer.invoke("mavlink-set-gimbal", { pitch, yaw }),

    /** Force the active MAVLink link ('udp' | 'sik' | 'auto'). */
    setActiveLink: (mode) => ipcRenderer.invoke("mavlink-set-active-link", mode),

    // ── Payload ───────────────────────────────────────────────
    /** Deploy rescue payload via servo with interlock validation. */
    deployPayload: (options) => ipcRenderer.invoke("mavlink-deploy-payload", options),

    /** Update the auto-drop policy. */
    setPayloadPolicy: (policy) => ipcRenderer.invoke("mavlink-set-payload-policy", policy),

    /** Get the current payload state + interlock snapshot. */
    getPayloadState: () => ipcRenderer.invoke("mavlink-get-payload-state"),

    /** Simple toggle: dashboard -> MAV_CMD_USER_1 -> Pi GPIO 16. action: "open"|"close"|"toggle". */
    payloadToggle: (action) => ipcRenderer.invoke("mavlink-payload-toggle", action),

    /** Get last known toggle state (true = open). */
    getPayloadOpen: () => ipcRenderer.invoke("mavlink-get-payload-open"),

    /** Listen for NAMED_VALUE_INT(PLDOPEN) echoes from the Pi. */
    onPayloadToggleState: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on("payload-toggle-state", handler);
        return () => ipcRenderer.removeListener("payload-toggle-state", handler);
    },

    /** Engage / disengage Pi sar_orchestrator (autonomous SAR mission). */
    missionEnable: (enable) => ipcRenderer.invoke("mavlink-mission-enable", !!enable),

    /** Listen for SAR orchestrator state ticks from the Pi. */
    onMissionState: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on("mission-state", handler);
        return () => ipcRenderer.removeListener("mission-state", handler);
    },

    // ── Window controls (frameless) ───────────────────────────
    minimize: () => ipcRenderer.send("window-minimize"),
    maximize: () => ipcRenderer.send("window-maximize"),
    close: () => ipcRenderer.send("window-close"),
});
