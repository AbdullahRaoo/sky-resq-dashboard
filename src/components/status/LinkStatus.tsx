/**
 * LinkStatus — Shows active communication link status.
 * Displays radio signal strength and 4G connection state.
 */

"use client";

import { useConnected } from "@/hooks/useTelemetry";

export default function LinkStatus() {
    const connected = useConnected();

    // TODO: Read RADIO_STATUS mavlink message for real RSSI
    const radioRssi = connected ? 85 : 0;
    const radioActive = connected;
    const lteActive = false; // Placeholder — 4G not yet integrated

    return (
        <div className="link-status">
            {/* Radio Link */}
            <div className={`link-card ${radioActive ? "link-card--active" : "link-card--inactive"}`}>
                <div className="link-card__icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                        <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                        <line x1="12" y1="20" x2="12.01" y2="20" />
                    </svg>
                </div>
                <div className="link-card__info">
                    <div className="link-card__name">SiK Radio</div>
                    <div className="link-card__detail">
                        {radioActive ? (
                            <>
                                <span className="link-badge link-badge--active">ACTIVE</span>
                                <span className="link-rssi">{radioRssi}% RSSI</span>
                            </>
                        ) : (
                            <span className="link-badge link-badge--inactive">OFFLINE</span>
                        )}
                    </div>
                </div>
                <div className="link-card__bars">
                    {[1, 2, 3, 4].map((bar) => (
                        <div
                            key={bar}
                            className={`link-bar ${radioActive && radioRssi >= bar * 25 ? "link-bar--filled" : ""}`}
                            style={{ height: `${bar * 4 + 4}px` }}
                        />
                    ))}
                </div>
            </div>

            {/* 4G/LTE Link */}
            <div className={`link-card ${lteActive ? "link-card--active" : "link-card--inactive"}`}>
                <div className="link-card__icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                        <line x1="12" y1="18" x2="12.01" y2="18" />
                    </svg>
                </div>
                <div className="link-card__info">
                    <div className="link-card__name">4G / LTE</div>
                    <div className="link-card__detail">
                        <span className="link-badge link-badge--inactive">NOT CONFIGURED</span>
                    </div>
                </div>
                <div className="link-card__bars">
                    {[1, 2, 3, 4].map((bar) => (
                        <div key={bar} className="link-bar" style={{ height: `${bar * 4 + 4}px` }} />
                    ))}
                </div>
            </div>
        </div>
    );
}
