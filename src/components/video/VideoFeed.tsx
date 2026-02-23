/**
 * VideoFeed — 4K camera feed panel with WebRTC architecture.
 * Shows placeholder when no feed is available, ready for Pi integration.
 */

"use client";

import { useState } from "react";

export default function VideoFeed() {
    const [feedActive] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);

    return (
        <div className={`video-feed ${fullscreen ? "video-feed--fullscreen" : ""}`}>
            <div className="video-feed__header">
                <div className="video-feed__title">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                    Camera Feed
                </div>
                <div className="video-feed__badges">
                    {feedActive ? (
                        <>
                            <span className="video-badge video-badge--live">● LIVE</span>
                            <span className="video-badge">4K</span>
                            <span className="video-badge">32ms</span>
                        </>
                    ) : (
                        <span className="video-badge video-badge--offline">OFFLINE</span>
                    )}
                </div>
                <button className="video-feed__btn" onClick={() => setFullscreen(!fullscreen)} title="Toggle fullscreen">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        {fullscreen ? (
                            <><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></>
                        ) : (
                            <><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>
                        )}
                    </svg>
                </button>
            </div>

            <div className="video-feed__viewport">
                {feedActive ? (
                    <video
                        className="video-feed__video"
                        autoPlay
                        playsInline
                        muted
                    />
                ) : (
                    <div className="video-feed__placeholder">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.3">
                            <polygon points="23 7 16 12 23 17 23 7" />
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                        <div className="video-feed__placeholder-text">No Video Feed</div>
                        <div className="video-feed__placeholder-sub">Connect 4G/LTE link to stream</div>
                    </div>
                )}
            </div>
        </div>
    );
}
