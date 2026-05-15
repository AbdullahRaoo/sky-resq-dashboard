/**
 * DemoBanner — top-of-screen demo mode indicator with always-visible
 * emergency HOVER (LOITER) and RTL buttons. Visible only when demoMode = true.
 */

"use client";

import { useCallback } from "react";
import { useDemoStore, DEMO_STEPS } from "@/store/demoStore";

export default function DemoBanner() {
    const currentStep = useDemoStore((s) => s.currentStep);
    const setDemoMode = useDemoStore((s) => s.setDemoMode);
    const resetDemo = useDemoStore((s) => s.resetDemo);

    const step = DEMO_STEPS[currentStep];

    const handleHover = useCallback(async () => {
        if (window.electron) {
            try { await window.electron.setMode("LOITER"); } catch { /* ignore */ }
        }
    }, []);

    const handleRtl = useCallback(async () => {
        if (window.electron) {
            try { await window.electron.setMode("RTL"); } catch { /* ignore */ }
        }
    }, []);

    return (
        <div className="demo-banner">
            <div className="demo-banner__steps">
                DEMO MODE — Step {currentStep + 1}/{DEMO_STEPS.length}: {step.title}
            </div>
            <div className="demo-banner__emergency">
                <button className="demo-btn-hover" onClick={handleHover}>HOVER</button>
                <button className="demo-btn-rtl" onClick={handleRtl}>RTL</button>
                <button
                    onClick={() => { resetDemo(); setDemoMode(false); }}
                    style={{ color: "var(--text-muted)" }}
                >EXIT</button>
            </div>
        </div>
    );
}
