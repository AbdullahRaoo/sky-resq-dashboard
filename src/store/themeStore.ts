/**
 * Theme Store — controls dark/light mode.
 */

import { create } from "zustand";

export type ThemeMode = "dark" | "light";

interface ThemeStore {
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
    toggleTheme: () => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
    theme: "dark",
    setTheme: (theme) => set({ theme }),
    toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
}));
