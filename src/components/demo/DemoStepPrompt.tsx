/**
 * DemoStepPrompt — floating bottom-center step prompt for the demo walkthrough.
 *
 * Auto-advances the step counter based on observed telemetry / store state:
 *   arm     → when heartbeat.armed becomes true
 *   takeoff → when relative_alt > 1 m
 *   searching → when relative_alt > 2 m (settled at altitude)
 *   detected → when at least one survivor exists in survivorStore
 *   drop    → when payload state moves to "dropped"
 *   returning → when mode = RTL
 *   complete → when mode = RTL AND altitude < 0.5 m
 */

"use client";

import { useEffect } from "react";
import { useDemoStore, DEMO_STEPS } from "@/store/demoStore";
import { useHeartbeat, useVfrHud } from "@/hooks/useTelemetry";
import { useSurvivorStore } from "@/store/survivorStore";
import { useMissionStore } from "@/store/missionStore";

export default function DemoStepPrompt() {
    const currentStep = useDemoStore((s) => s.currentStep);
    const setStep = useDemoStore((s) => s.setStep);
    const checklistOpen = useDemoStore((s) => s.checklistOpen);
    const heartbeat = useHeartbeat();
    const hud = useVfrHud();
    const survivors = useSurvivorStore((s) => s.detections);
    const payloadState = useMissionStore((s) => s.payloadState);

    // Auto-advance logic.
    useEffect(() => {
        // 1: ready → arm (handled by checklist completion)

        // 2 arm → 3 takeoff
        if (currentStep === 1 && heartbeat.armed) setStep(2);

        // 3 takeoff → 4 searching (climbing above 1m)
        if (currentStep === 2 && hud.alt > 1.0) setStep(3);

        // 4 searching → 5 detected (a survivor exists)
        if (currentStep === 3 && survivors.length > 0) setStep(4);

        // 5 detected → 6 drop (payload dropped)
        if (currentStep === 4 && payloadState === "dropped") setStep(5);

        // 6 drop → 7 returning (RTL mode)
        if (currentStep >= 5 && currentStep < 6 && heartbeat.flight_mode === "RTL") setStep(6);

        // 7 returning → 8 complete (landed in RTL)
        if (currentStep === 6 && heartbeat.flight_mode === "RTL" && hud.alt < 0.5) setStep(7);
    }, [currentStep, heartbeat.armed, heartbeat.flight_mode, hud.alt, survivors.length, payloadState, setStep]);

    if (checklistOpen) return null;
    const step = DEMO_STEPS[currentStep];

    return (
        <div className="demo-step-prompt">
            <div className="demo-step-prompt__step">Step {currentStep + 1}/{DEMO_STEPS.length} — {step.title}</div>
            <div>{step.prompt}</div>
        </div>
    );
}
