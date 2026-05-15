/**
 * DemoChecklist — pre-flight checklist modal that gates the start of demo mode.
 * GPS and battery items are auto-resolved from live telemetry; everything
 * else is operator-confirmed.
 */

"use client";

import { useMemo, useEffect } from "react";
import { useDemoStore, DEMO_CHECKLIST_ITEMS, type DemoChecklistId } from "@/store/demoStore";
import { useBattery, useGps } from "@/hooks/useTelemetry";

export default function DemoChecklist() {
    const open = useDemoStore((s) => s.checklistOpen);
    const checklist = useDemoStore((s) => s.checklist);
    const setItem = useDemoStore((s) => s.setChecklistItem);
    const setOpen = useDemoStore((s) => s.setChecklistOpen);
    const advanceStep = useDemoStore((s) => s.advanceStep);
    const battery = useBattery();
    const gps = useGps();

    // Auto-resolve checklist items from telemetry.
    useEffect(() => {
        setItem("gps", gps.fix_type >= 3 && gps.satellites_visible >= 6);
    }, [gps.fix_type, gps.satellites_visible, setItem]);

    useEffect(() => {
        setItem("battery", battery.remaining < 0 ? false : battery.remaining > 70);
    }, [battery.remaining, setItem]);

    const allChecked = useMemo(
        () => DEMO_CHECKLIST_ITEMS.every((item) => checklist[item.id as DemoChecklistId]),
        [checklist],
    );

    if (!open) return null;

    const handleStart = () => {
        if (!allChecked) return;
        setOpen(false);
        advanceStep();
    };

    return (
        <div className="demo-modal-backdrop" onClick={(e) => e.stopPropagation()}>
            <div className="demo-modal">
                <div className="demo-modal__title">Pre-Flight Checklist</div>
                <div className="demo-checklist">
                    {DEMO_CHECKLIST_ITEMS.map((item) => {
                        const checked = checklist[item.id as DemoChecklistId];
                        const auto = item.auto;
                        return (
                            <label
                                key={item.id}
                                className={`demo-checklist__item ${checked ? "demo-checklist__item--checked" : ""} ${auto ? "demo-checklist__item--auto" : ""}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={auto}
                                    onChange={(e) => !auto && setItem(item.id as DemoChecklistId, e.target.checked)}
                                />
                                {item.label}
                                {auto && (
                                    <span style={{ marginLeft: "auto", fontSize: "0.7rem", opacity: 0.6 }}>
                                        {checked ? "✓ auto" : "auto (waiting)"}
                                    </span>
                                )}
                            </label>
                        );
                    })}
                </div>
                <div className="demo-modal__actions">
                    <button
                        className="demo-modal__btn"
                        onClick={() => setOpen(false)}
                    >Cancel</button>
                    <button
                        className="demo-modal__btn demo-modal__btn--primary"
                        disabled={!allChecked}
                        onClick={handleStart}
                    >Start Demo</button>
                </div>
            </div>
        </div>
    );
}
