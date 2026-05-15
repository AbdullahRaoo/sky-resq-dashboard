/**
 * LinkDots — title-bar widget showing the 4G/SiK MAVLink failover state
 * (spec §8.5). Each dot reflects link freshness:
 *   ● green  - active, fresh heartbeats
 *   ● amber  - alive but stale
 *   ● red    - dead
 *
 * Clicking a dot toggles a "force this link" override.
 */

"use client";

import { useState } from "react";
import { useLinkStore } from "@/store/linkStore";

const FRESH_MS = 1500;

function colorForLink(connected: boolean, freshMs: number): string {
    if (!connected) return "var(--accent-red)";
    if (freshMs < FRESH_MS) return "var(--accent-emerald)";
    if (freshMs < FRESH_MS * 4) return "var(--accent-amber)";
    return "var(--accent-red)";
}

interface DotProps {
    label: string;
    active: boolean;
    forced: boolean;
    color: string;
    rate: string;
    onClick: () => void;
}

function Dot({ label, active, forced, color, rate, onClick }: DotProps) {
    return (
        <button
            onClick={onClick}
            title={`${label} — click to ${forced ? "release force" : "force this link"}`}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 6px",
                background: "transparent",
                border: `1px solid ${active ? color : "transparent"}`,
                borderRadius: "var(--radius-sm)",
                color: "var(--text-secondary)",
                fontSize: "0.66rem",
                fontWeight: 700,
                letterSpacing: "0.05em",
                cursor: "pointer",
            }}
        >
            <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: color,
                boxShadow: active ? `0 0 8px ${color}` : "none",
            }} />
            {label}
            <span style={{ opacity: 0.6, marginLeft: 2 }}>{rate}</span>
            {forced && <span style={{ color: "var(--accent-primary)", marginLeft: 2 }}>★</span>}
        </button>
    );
}

export default function LinkDots() {
    const link = useLinkStore();
    const [busy, setBusy] = useState(false);

    const handleForce = async (name: "udp" | "sik") => {
        if (busy || !window.electron) return;
        setBusy(true);
        try {
            const newForced = link.forced === name ? "auto" : name;
            await window.electron.setActiveLink(newForced);
        } finally {
            setBusy(false);
        }
    };

    const udpColor = colorForLink(link.udp.connected, link.udp.freshMs);
    const sikColor = colorForLink(link.sik.connected, link.sik.freshMs);

    return (
        <div style={{ display: "flex", gap: 4, alignItems: "center", marginRight: 8 }}>
            <Dot
                label="4G"
                rate="10Hz"
                active={link.active === "udp"}
                forced={link.forced === "udp"}
                color={udpColor}
                onClick={() => handleForce("udp")}
            />
            <Dot
                label="SiK"
                rate="4Hz"
                active={link.active === "sik"}
                forced={link.forced === "sik"}
                color={sikColor}
                onClick={() => handleForce("sik")}
            />
        </div>
    );
}
