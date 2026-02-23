/**
 * MissionPanel — ConOps-aligned phased mission workflow.
 *
 * Phase 1 — PLAN: Draw search polygon, configure survey params, generate grid
 * Phase 2 — REVIEW: See waypoints on map, upload to drone
 * Phase 3 — EXECUTE: Arm & Auto, live progress, detection alerts
 * Phase 4 — ACTION: Survivor markers, fly-to, deploy payload
 * Phase 5 — RTL: Return to launch
 */

"use client";

import { useCallback, useState } from "react";
import { useMissionStore } from "@/store/missionStore";
import { generateLawnmowerGrid, calculateSpacing } from "@/lib/surveyGrid";
import { useConnected, useHeartbeat, useGps } from "@/hooks/useTelemetry";

type Phase = 1 | 2 | 3 | 4 | 5;

const PHASE_LABELS: Record<Phase, { title: string; subtitle: string }> = {
    1: { title: "Mission Planning", subtitle: "Define search area & parameters" },
    2: { title: "Review & Upload", subtitle: "Verify grid and upload to drone" },
    3: { title: "Execute Mission", subtitle: "Autonomous search in progress" },
    4: { title: "Target Action", subtitle: "Confirm survivors & deploy payload" },
    5: { title: "Return to Launch", subtitle: "Recovery & post-flight" },
};

export default function MissionPanel() {
    const connected = useConnected();
    const { armed } = useHeartbeat();
    const gps = useGps();

    const {
        polygon, surveyConfig, waypoints, currentWP, totalWP,
        missionState, drawMode,
        setSurveyConfig, setWaypoints, setMissionState,
        setDrawMode, clearPolygon, resetMission,
    } = useMissionStore();

    const [phase, setPhase] = useState<Phase>(1);
    const [uploading, setUploading] = useState(false);

    const gpsReady = gps.fix_type >= 3 && gps.satellites_visible >= 6;

    // ── Phase 1: Generate grid ──
    const handleGenerate = useCallback(() => {
        if (polygon.length < 3) return;
        const spacing = calculateSpacing(surveyConfig.altitude, surveyConfig.overlap);
        const wps = generateLawnmowerGrid(polygon, surveyConfig.altitude, spacing);
        setWaypoints(wps);
        setMissionState("planning");
        setDrawMode(false);
        setPhase(2);
    }, [polygon, surveyConfig, setWaypoints, setMissionState, setDrawMode]);

    // ── Phase 2: Upload ──
    const handleUpload = useCallback(async () => {
        if (!window.electron || waypoints.length === 0) return;
        setUploading(true);
        setMissionState("uploading");
        try {
            const result = await window.electron.uploadMission(waypoints);
            if (result.success) {
                setMissionState("uploaded");
                setPhase(3);
            } else {
                setMissionState("planning");
            }
        } catch (e) {
            setMissionState("planning");
        } finally {
            setUploading(false);
        }
    }, [waypoints, setMissionState]);

    // ── Phase 3: Arm & Auto ──
    const handleStart = useCallback(async () => {
        if (!window.electron) return;
        try {
            if (!armed) await window.electron.arm();
            await window.electron.setMode("AUTO");
            setMissionState("active");
        } catch (e) { /* */ }
    }, [armed, setMissionState]);

    const handlePause = useCallback(async () => {
        if (!window.electron) return;
        await window.electron.setMode("LOITER");
        setMissionState("paused");
    }, [setMissionState]);

    const handleResume = useCallback(async () => {
        if (!window.electron) return;
        await window.electron.setMode("AUTO");
        setMissionState("active");
    }, [setMissionState]);

    // ── Phase 5: RTL ──
    const handleRTL = useCallback(async () => {
        if (!window.electron) return;
        await window.electron.setMode("RTL");
        setPhase(5);
    }, []);

    const handleFullReset = useCallback(() => {
        resetMission();
        setPhase(1);
    }, [resetMission]);

    const progressPct = totalWP > 0 ? Math.round((currentWP / totalWP) * 100) : 0;

    return (
        <div className="mission-wizard">
            {/* Phase Timeline */}
            <div className="mission-timeline">
                {([1, 2, 3, 4, 5] as Phase[]).map((p) => (
                    <button
                        key={p}
                        className={`mission-phase-dot ${p === phase ? "mission-phase-dot--active" : ""} ${p < phase ? "mission-phase-dot--done" : ""}`}
                        onClick={() => p <= phase && setPhase(p)}
                        title={PHASE_LABELS[p].title}
                    >
                        {p < phase ? "✓" : p}
                    </button>
                ))}
                <div className="mission-timeline-line" />
            </div>

            {/* Phase Header */}
            <div className="mission-phase-header">
                <div className="mission-phase-title">{PHASE_LABELS[phase].title}</div>
                <div className="mission-phase-sub">{PHASE_LABELS[phase].subtitle}</div>
            </div>

            {/* ═══ Phase 1: PLAN ═══ */}
            {phase === 1 && (
                <div className="mission-phase-content">
                    {/* Pre-flight checklist */}
                    <div className="mission-checklist">
                        <div className="mission-check-title">Pre-Flight Checklist</div>
                        <div className={`mission-check-item ${connected ? "mission-check--pass" : ""}`}>
                            {connected ? "✓" : "○"} GCS Connected
                        </div>
                        <div className={`mission-check-item ${gpsReady ? "mission-check--pass" : ""}`}>
                            {gpsReady ? "✓" : "○"} GPS 3D Fix ({gps.satellites_visible} sats, HDOP {gps.hdop.toFixed(1)})
                        </div>
                        <div className={`mission-check-item ${polygon.length >= 3 ? "mission-check--pass" : ""}`}>
                            {polygon.length >= 3 ? "✓" : "○"} Search Area Defined ({polygon.length} vertices)
                        </div>
                    </div>

                    {/* Draw button */}
                    <button
                        className={`mission-btn mission-btn--draw ${drawMode ? "mission-btn--active" : ""}`}
                        onClick={() => setDrawMode(!drawMode)}
                        disabled={!connected}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                        </svg>
                        {drawMode ? "Click map to place vertices..." : "Draw Search Area on Map"}
                    </button>

                    {polygon.length > 0 && (
                        <button className="mission-link" onClick={clearPolygon}>Clear polygon</button>
                    )}

                    {/* Survey Config */}
                    {polygon.length >= 3 && (
                        <div className="mission-config">
                            <div className="mission-config-title">Survey Parameters</div>
                            <div className="mission-config-grid">
                                <div className="mission-config-item">
                                    <label className="mission-config-label">Altitude (m)</label>
                                    <input type="number" className="mission-config-input" value={surveyConfig.altitude}
                                        min={5} max={120} step={5}
                                        onChange={(e) => setSurveyConfig({ altitude: Number(e.target.value) })} />
                                </div>
                                <div className="mission-config-item">
                                    <label className="mission-config-label">Overlap (%)</label>
                                    <input type="number" className="mission-config-input" value={surveyConfig.overlap}
                                        min={10} max={90} step={5}
                                        onChange={(e) => setSurveyConfig({ overlap: Number(e.target.value) })} />
                                </div>
                                <div className="mission-config-item">
                                    <label className="mission-config-label">Speed (m/s)</label>
                                    <input type="number" className="mission-config-input" value={surveyConfig.speed}
                                        min={1} max={15} step={0.5}
                                        onChange={(e) => setSurveyConfig({ speed: Number(e.target.value) })} />
                                </div>
                            </div>

                            <button className="mission-btn mission-btn--generate" onClick={handleGenerate}>
                                Generate Lawnmower Grid →
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Phase 2: REVIEW & UPLOAD ═══ */}
            {phase === 2 && (
                <div className="mission-phase-content">
                    <div className="mission-summary-grid">
                        <div className="mission-stat">
                            <span className="mission-stat__label">Waypoints</span>
                            <span className="mission-stat__value">{waypoints.length}</span>
                        </div>
                        <div className="mission-stat">
                            <span className="mission-stat__label">Altitude</span>
                            <span className="mission-stat__value">{surveyConfig.altitude}m</span>
                        </div>
                        <div className="mission-stat">
                            <span className="mission-stat__label">Speed</span>
                            <span className="mission-stat__value">{surveyConfig.speed}m/s</span>
                        </div>
                    </div>

                    <div className="mission-action-stack">
                        <button className="mission-btn mission-btn--upload" onClick={handleUpload}
                            disabled={!connected || uploading}>
                            {uploading ? "Uploading..." : "⬆ Upload Mission to Drone"}
                        </button>
                        <button className="mission-btn mission-btn--reset" onClick={() => setPhase(1)}>
                            ← Back to Planning
                        </button>
                    </div>
                </div>
            )}

            {/* ═══ Phase 3: EXECUTE ═══ */}
            {phase === 3 && (
                <div className="mission-phase-content">
                    {/* GPS readiness gate */}
                    {!gpsReady && (
                        <div className="mission-warning">
                            ⚠ Waiting for GPS: {gps.satellites_visible} sats (need ≥6), HDOP {gps.hdop.toFixed(1)} (need ≤1.5)
                        </div>
                    )}

                    {/* Progress */}
                    {(missionState === "active" || missionState === "paused") && (
                        <div className="mission-progress">
                            <div className="mission-progress__info">
                                <span>Waypoint {currentWP} / {totalWP}</span>
                                <span>{progressPct}%</span>
                            </div>
                            <div className="mission-progress__bar">
                                <div className="mission-progress__fill" style={{ width: `${progressPct}%` }} />
                            </div>
                        </div>
                    )}

                    <div className="mission-action-stack">
                        {missionState === "uploaded" && (
                            <button className="mission-btn mission-btn--start" onClick={handleStart}
                                disabled={!connected}>
                                🚀 Arm & Start Mission
                            </button>
                        )}
                        {missionState === "active" && (
                            <button className="mission-btn mission-btn--pause" onClick={handlePause}>
                                ⏸ Pause (Hold Position)
                            </button>
                        )}
                        {missionState === "paused" && (
                            <button className="mission-btn mission-btn--resume" onClick={handleResume}>
                                ▶ Resume Mission
                            </button>
                        )}
                        <button className="mission-btn mission-btn--proceed"
                            onClick={() => setPhase(4)} disabled={missionState !== "active" && missionState !== "paused"}>
                            Proceed to Target Action →
                        </button>
                    </div>
                </div>
            )}

            {/* ═══ Phase 4: TARGET ACTION ═══ */}
            {phase === 4 && (
                <div className="mission-phase-content">
                    <div className="mission-action-info">
                        When survivors are detected, their markers will appear on the map. Click a marker to fly the drone there and deploy the rescue payload.
                    </div>

                    <div className="mission-action-stack">
                        <button className="mission-btn mission-btn--rtl" onClick={handleRTL}
                            disabled={!connected || !armed}>
                            🏠 Return to Launch
                        </button>
                    </div>
                </div>
            )}

            {/* ═══ Phase 5: RTL ═══ */}
            {phase === 5 && (
                <div className="mission-phase-content">
                    <div className="mission-action-info">
                        Drone is returning to launch point. It will autonomously land and disarm.
                    </div>

                    <div className="mission-action-stack">
                        <button className="mission-btn mission-btn--reset" onClick={handleFullReset}>
                            ✕ Clear Mission & Reset
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
