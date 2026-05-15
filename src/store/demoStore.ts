/**
 * Demo Mode Store — guides the operator through a constrained,
 * audience-safe workflow with a checklist, step-by-step prompts,
 * and an altitude clamp.
 */

import { create } from "zustand";

export interface DemoStep {
    id: string;
    title: string;
    prompt: string;
}

export const DEMO_STEPS: DemoStep[] = [
    { id: "ready",     title: "Ready",      prompt: "Complete the pre-flight checklist to begin." },
    { id: "arm",       title: "Arm",        prompt: "Click ARM to power the motors when ready." },
    { id: "takeoff",   title: "Takeoff",    prompt: "Drone is taking off — climbing to 3m AGL." },
    { id: "searching", title: "Searching",  prompt: "Drone is searching the demo area… stand by." },
    { id: "detected",  title: "Detected",   prompt: "Survivor detected! Click the marker to investigate." },
    { id: "drop",      title: "Drop",       prompt: "Visual confirmation — click DROP when ready." },
    { id: "returning", title: "Returning",  prompt: "Click RTL to return to home and land." },
    { id: "complete",  title: "Complete",   prompt: "Demo complete. Review the summary card." },
];

export const DEMO_CHECKLIST_ITEMS = [
    { id: "powered", label: "Drone powered on, props attached", auto: false },
    { id: "gps", label: "GPS fix ≥ 3D", auto: true },
    { id: "battery", label: "Battery > 70 %", auto: true },
    { id: "clear", label: "Clear sky, no people in flight zone", auto: false },
    { id: "spotter", label: "Spotter assigned", auto: false },
] as const;

export type DemoChecklistId = typeof DEMO_CHECKLIST_ITEMS[number]["id"];

interface DemoStore {
    demoMode: boolean;
    currentStep: number;            // index into DEMO_STEPS
    checklistOpen: boolean;
    checklist: Record<DemoChecklistId, boolean>;

    setDemoMode: (on: boolean) => void;
    setStep: (index: number) => void;
    advanceStep: () => void;
    setChecklistOpen: (open: boolean) => void;
    setChecklistItem: (id: DemoChecklistId, value: boolean) => void;
    resetDemo: () => void;
}

const emptyChecklist = (): Record<DemoChecklistId, boolean> => ({
    powered: false,
    gps: false,
    battery: false,
    clear: false,
    spotter: false,
});

export const useDemoStore = create<DemoStore>((set) => ({
    demoMode: false,
    currentStep: 0,
    checklistOpen: false,
    checklist: emptyChecklist(),

    setDemoMode: (on) => set((s) => ({
        demoMode: on,
        checklistOpen: on && s.currentStep === 0,
        currentStep: on ? 0 : s.currentStep,
        checklist: on ? emptyChecklist() : s.checklist,
    })),
    setStep: (index) => set({ currentStep: Math.max(0, Math.min(index, DEMO_STEPS.length - 1)) }),
    advanceStep: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, DEMO_STEPS.length - 1) })),
    setChecklistOpen: (open) => set({ checklistOpen: open }),
    setChecklistItem: (id, value) => set((s) => ({ checklist: { ...s.checklist, [id]: value } })),
    resetDemo: () => set({
        demoMode: false,
        currentStep: 0,
        checklistOpen: false,
        checklist: emptyChecklist(),
    }),
}));

/** Demo mode caps altitude across all commands at this value (m AGL). */
export const DEMO_ALTITUDE_CAP_M = 3;
