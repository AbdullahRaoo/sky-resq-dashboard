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

interface ElectronAPI {
    // Telemetry
    onTelemetry: (callback: (data: DroneState) => void) => () => void;
    onConnectionStatus: (callback: (data: ConnectionStatusEvent) => void) => () => void;

    // Commands
    connect: (config: ConnectionConfig) => Promise<CommandResponse>;
    disconnect: () => Promise<CommandResponse>;
    arm: () => Promise<CommandResponse>;
    disarm: () => Promise<CommandResponse>;
    setMode: (modeName: string) => Promise<CommandResponse>;
    getConnectionProfiles: () => Promise<ConnectionProfile[]>;

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
