/**
 * Sidebar — icon navigation with settings callback.
 */

"use client";

import { useNavStore, type GcsView } from "@/store/navStore";
import { useSurvivorStore } from "@/store/survivorStore";
import type { ReactNode } from "react";

interface NavItem {
    id: GcsView;
    label: string;
    icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
    {
        id: "dashboard",
        label: "Dashboard",
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
        ),
    },
    {
        id: "mission",
        label: "Mission Planner",
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
        ),
    },
    {
        id: "camera",
        label: "Camera & Payload",
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
        ),
    },
    {
        id: "survivors",
        label: "Survivors",
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
        ),
    },
];

interface SidebarProps {
    onSettingsClick: () => void;
}

export default function Sidebar({ onSettingsClick }: SidebarProps) {
    const { activeView, setView } = useNavStore();
    const survivorCount = useSurvivorStore((s) => s.detections.length);

    return (
        <aside className="sidebar">

            {NAV_ITEMS.map((item) => (
                <button
                    key={item.id}
                    className={`sidebar-btn ${activeView === item.id ? "active" : ""}`}
                    title={item.label}
                    onClick={() => setView(item.id)}
                    style={{ position: "relative" }}
                >
                    {item.icon}
                    {item.id === "survivors" && survivorCount > 0 && (
                        <span style={{
                            position: "absolute",
                            top: 4,
                            right: 4,
                            minWidth: 16,
                            height: 16,
                            padding: "0 4px",
                            background: "var(--accent-primary)",
                            color: "#1a1a1a",
                            borderRadius: 8,
                            fontSize: "0.62rem",
                            fontWeight: 800,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            lineHeight: 1,
                        }}>{survivorCount}</span>
                    )}
                </button>
            ))}

            <div style={{ flex: 1 }} />
            <div className="sidebar-divider" />

            <button className="sidebar-btn" title="Settings" onClick={onSettingsClick}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
            </button>
        </aside>
    );
}
