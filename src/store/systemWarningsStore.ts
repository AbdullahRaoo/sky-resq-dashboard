/**
 * System Warnings Store — non-fatal startup/runtime warnings surfaced
 * from the Electron main process (e.g. UDP port already in use).
 */

import { create } from "zustand";

export interface SystemWarning {
    id: string;
    severity: "warning" | "error";
    title: string;
    message: string;
    hint?: string;
}

interface SystemWarningsStore {
    warnings: SystemWarning[];
    add: (w: SystemWarning) => void;
    dismiss: (id: string) => void;
    clear: () => void;
}

export const useSystemWarningsStore = create<SystemWarningsStore>((set) => ({
    warnings: [],
    add: (w) => set((s) => {
        if (s.warnings.some((x) => x.id === w.id)) return s;
        return { warnings: [...s.warnings, w] };
    }),
    dismiss: (id) => set((s) => ({ warnings: s.warnings.filter((w) => w.id !== id) })),
    clear: () => set({ warnings: [] }),
}));
