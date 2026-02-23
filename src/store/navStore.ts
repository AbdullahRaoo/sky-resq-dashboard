/**
 * Navigation Store — controls which view is active in the GCS.
 */

import { create } from "zustand";

export type GcsView = "dashboard" | "mission" | "camera";

interface NavStore {
    activeView: GcsView;
    setView: (view: GcsView) => void;
}

export const useNavStore = create<NavStore>((set) => ({
    activeView: "dashboard",
    setView: (view) => set({ activeView: view }),
}));
