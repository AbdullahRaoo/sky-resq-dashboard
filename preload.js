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
        // Return cleanup function
        return () => ipcRenderer.removeListener("telemetry-update", handler);
    },

    /** Listen for connection status changes. */
    onConnectionStatus: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on("connection-status", handler);
        return () => ipcRenderer.removeListener("connection-status", handler);
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

    // ── Window controls (frameless) ───────────────────────────
    minimize: () => ipcRenderer.send("window-minimize"),
    maximize: () => ipcRenderer.send("window-maximize"),
    close: () => ipcRenderer.send("window-close"),
});
