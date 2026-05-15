/**
 * useSurvivorIPC — bridges Electron IPC pipeline events into Zustand stores.
 *
 * Subscribes to:
 *   - survivor-detection → upserts into survivorStore
 *   - detection-frame    → updates latestDetectionFrame
 *   - payload-state      → mirrored into missionStore.payloadState
 *
 * Also fires an alert + audio beep on the FIRST sighting of each cluster id.
 */

"use client";

import { useEffect, useRef } from "react";
import { useSurvivorStore } from "@/store/survivorStore";
import { useMissionStore } from "@/store/missionStore";
import { usePiStatusStore } from "@/store/piStatusStore";
import { useLinkStore } from "@/store/linkStore";
import { useSystemWarningsStore } from "@/store/systemWarningsStore";
import type {
    SurvivorClusterEvent,
    DetectionFrameEvent,
    PayloadStateEvent,
    PiStatusEvent,
    LinkStatusEvent,
    SystemWarningEvent,
} from "@/types/electron";

function playSurvivorBeep() {
    try {
        const ctx = new (window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 1320;
        gain.gain.value = 0.18;
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
    } catch { /* ignore */ }
}

export function useSurvivorIPC() {
    const upsertDetection = useSurvivorStore((s) => s.upsertDetection);
    const setDetectionFrame = useSurvivorStore((s) => s.setDetectionFrame);
    const addAlert = useSurvivorStore((s) => s.addAlert);
    const setPayloadState = useMissionStore((s) => s.setPayloadState);
    const setInterlocks = useMissionStore((s) => s.setPayloadInterlocks);
    const updatePiStatus = usePiStatusStore((s) => s.update);
    const markPiOffline = usePiStatusStore((s) => s.markOffline);
    const updateLinkStatus = useLinkStore((s) => s.update);
    const addWarning = useSystemWarningsStore((s) => s.add);

    const seenIds = useRef<Set<string>>(new Set());
    const lastFrameRef = useRef<number>(0);

    useEffect(() => {
        if (typeof window === "undefined" || !window.electron) return;

        const cleanupCluster = window.electron.onSurvivorDetection((data: SurvivorClusterEvent) => {
            const isNew = !seenIds.current.has(data.id);
            seenIds.current.add(data.id);

            upsertDetection({
                id: data.id,
                lat: data.lat,
                lon: data.lon,
                alt: data.alt,
                count: data.count,
                confidence: data.confidence,
                timestamp: data.first_seen_ms,
                lastUpdatedMs: data.last_seen_ms,
                nSamples: data.n_samples,
                status: isNew ? "new" : undefined,
            });

            if (isNew) {
                addAlert({
                    type: "survivor",
                    title: "SURVIVOR DETECTED",
                    message: `${data.count} ${data.count === 1 ? "person" : "people"} @ ${data.lat.toFixed(5)}, ${data.lon.toFixed(5)} — conf ${(data.confidence * 100).toFixed(0)}%`,
                });
                playSurvivorBeep();
            }
        });

        const cleanupFrame = window.electron.onDetectionFrame((data: DetectionFrameEvent) => {
            // Drop frames that arrive faster than ~30Hz to be polite to React.
            const now = performance.now();
            if (now - lastFrameRef.current < 32) return;
            lastFrameRef.current = now;

            setDetectionFrame({
                frameTsMs: data.frame_ts_ms,
                streamWidth: data.stream_width,
                streamHeight: data.stream_height,
                detections: data.detections.map((d) => ({
                    bbox: d.bbox,
                    confidence: d.confidence,
                    class: d.class,
                    clusterId: d.cluster_id,
                })),
            });
        });

        const cleanupPayload = window.electron.onPayloadState((data: PayloadStateEvent) => {
            setPayloadState(data.state);
            setInterlocks(data.interlocks);
        });

        const cleanupPi = window.electron.onPiStatus((data: PiStatusEvent) => {
            updatePiStatus(data);
        });

        const cleanupLink = window.electron.onLinkStatus((data: LinkStatusEvent) => {
            updateLinkStatus(data);
        });

        const cleanupWarning = window.electron.onSystemWarning?.((data: SystemWarningEvent) => {
            addWarning(data);
        });

        // Stale-clear: if no new detection frame in 1.5s, clear so overlays vanish.
        const staleTimer = setInterval(() => {
            const frame = useSurvivorStore.getState().latestDetectionFrame;
            if (frame && Date.now() - frame.frameTsMs > 1500) {
                setDetectionFrame(null);
            }
            const lastPi = usePiStatusStore.getState().lastArrivedMs;
            if (lastPi && Date.now() - lastPi > 6000) {
                markPiOffline();
            }
        }, 500);

        return () => {
            cleanupCluster();
            cleanupFrame();
            cleanupPayload();
            cleanupPi();
            cleanupLink();
            if (typeof cleanupWarning === "function") cleanupWarning();
            clearInterval(staleTimer);
        };
    }, [
        upsertDetection,
        setDetectionFrame,
        addAlert,
        setPayloadState,
        setInterlocks,
        updatePiStatus,
        updateLinkStatus,
        markPiOffline,
        addWarning,
    ]);
}
