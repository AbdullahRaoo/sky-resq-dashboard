/**
 * useWebSocket hook — DEPRECATED.
 *
 * This hook has been replaced by useElectronTelemetry.ts which uses
 * Electron IPC instead of WebSocket for telemetry data.
 *
 * Kept for reference only. Not imported anywhere.
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useTelemetryStore } from "@/store/telemetryStore";
import type { DroneState } from "@/types/telemetry";

const WS_URL = "ws://localhost:8000/ws/telemetry";
const WS_RECONNECT_INTERVAL_MS = 3000;

/** @deprecated Use useElectronTelemetry instead. */
export function useWebSocket() {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const updateState = useTelemetryStore((s) => s.updateState);
    const resetState = useTelemetryStore((s) => s.resetState);
    const mountedRef = useRef(true);

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        try {
            const ws = new WebSocket(WS_URL);

            ws.onopen = () => {
                console.log("[WS] Connected to telemetry stream");
            };

            ws.onmessage = (event: MessageEvent) => {
                try {
                    const data: DroneState = JSON.parse(event.data);
                    updateState(data);
                } catch (e) {
                    console.warn("[WS] Failed to parse message:", e);
                }
            };

            ws.onclose = () => {
                console.log("[WS] Disconnected");
                resetState();
                wsRef.current = null;

                if (mountedRef.current) {
                    reconnectTimer.current = setTimeout(() => {
                        console.log("[WS] Reconnecting...");
                        connect();
                    }, WS_RECONNECT_INTERVAL_MS);
                }
            };

            ws.onerror = (error) => {
                console.error("[WS] Error:", error);
                ws.close();
            };

            wsRef.current = ws;
        } catch (e) {
            console.error("[WS] Connection attempt failed:", e);
        }
    }, [updateState, resetState]);

    const disconnect = useCallback(() => {
        if (reconnectTimer.current) {
            clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
        }
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        resetState();
    }, [resetState]);

    useEffect(() => {
        mountedRef.current = true;
        connect();

        return () => {
            mountedRef.current = false;
            disconnect();
        };
    }, [connect, disconnect]);

    return {
        isWsConnected: wsRef.current?.readyState === WebSocket.OPEN,
        reconnect: connect,
        disconnect,
    };
}
