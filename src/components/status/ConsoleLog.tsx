/**
 * ConsoleLog — bottom panel showing scrolling drone STATUSTEXT messages.
 * Listens to the telemetry store for status_text updates.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useTelemetryStore } from "@/store/telemetryStore";

interface LogEntry {
    id: number;
    timestamp: string;
    message: string;
}

let logCounter = 0;

export default function ConsoleLog() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [collapsed, setCollapsed] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Watch for status_text changes
    const statusText = useTelemetryStore((s) => s.status_text);
    const connected = useTelemetryStore((s) => s.connected);
    const prevTextRef = useRef("");

    useEffect(() => {
        if (statusText && statusText !== prevTextRef.current) {
            prevTextRef.current = statusText;
            const now = new Date();
            const ts = now.toLocaleTimeString("en-US", { hour12: false });
            setLogs((prev) => {
                const next = [...prev, { id: logCounter++, timestamp: ts, message: statusText }];
                // Keep last 100 entries
                return next.slice(-100);
            });
        }
    }, [statusText]);

    // Log connection events
    useEffect(() => {
        const now = new Date();
        const ts = now.toLocaleTimeString("en-US", { hour12: false });
        if (connected) {
            setLogs((prev) => [...prev, { id: logCounter++, timestamp: ts, message: "▶ Connected to drone" }].slice(-100));
        }
    }, [connected]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className={`console-panel ${collapsed ? "console-panel--collapsed" : ""}`}>
            <div className="console-panel__header" onClick={() => setCollapsed(!collapsed)}>
                <span className="console-panel__title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="4 17 10 11 4 5" />
                        <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                    Console
                </span>
                <span className="console-panel__count">{logs.length} entries</span>
                <button
                    className="console-panel__toggle"
                    aria-label={collapsed ? "Expand" : "Collapse"}
                >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        {collapsed
                            ? <polyline points="2 8 6 4 10 8" />
                            : <polyline points="2 4 6 8 10 4" />
                        }
                    </svg>
                </button>
            </div>

            {!collapsed && (
                <div className="console-panel__body" ref={scrollRef}>
                    {logs.length === 0 ? (
                        <div className="console-panel__empty">No messages yet. Connect to drone to see system logs.</div>
                    ) : (
                        logs.map((entry) => (
                            <div key={entry.id} className="console-panel__line">
                                <span className="console-panel__ts">{entry.timestamp}</span>
                                <span className="console-panel__msg">{entry.message}</span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
