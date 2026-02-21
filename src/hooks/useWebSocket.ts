/**
 * useWebSocket hook — manages WebSocket connection with auto-reconnect.
 *
 * Connects to the backend telemetry WS endpoint and pipes
 * parsed DroneState into the Zustand store at 10Hz.
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useTelemetryStore } from "@/store/telemetryStore";
import { WS_URL, WS_RECONNECT_INTERVAL_MS } from "@/lib/constants";
import type { DroneState } from "@/types/telemetry";

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

                // Auto-reconnect
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
