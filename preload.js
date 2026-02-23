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

    /** Listen for survivor detection events (from Pi or mock). */
    onSurvivorDetection: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on("survivor-detection", handler);
        return () => ipcRenderer.removeListener("survivor-detection", handler);
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

    // ── Mission Commands ──────────────────────────────────────
    /** Upload mission waypoints to the drone. */
    uploadMission: (waypoints) => ipcRenderer.invoke("mavlink-upload-mission", waypoints),

    /** Clear the current mission on the drone. */
    clearMission: () => ipcRenderer.invoke("mavlink-clear-mission"),

    /** Fly to a specific GPS coordinate (GUIDED mode). */
    flyToPoint: (lat, lon, alt) => ipcRenderer.invoke("mavlink-fly-to", { lat, lon, alt }),

    // ── Payload ───────────────────────────────────────────────
    /** Deploy rescue payload via servo. */
    deployPayload: () => ipcRenderer.invoke("mavlink-deploy-payload"),

    // ── Window controls (frameless) ───────────────────────────
    minimize: () => ipcRenderer.send("window-minimize"),
    maximize: () => ipcRenderer.send("window-maximize"),
    close: () => ipcRenderer.send("window-close"),
});
