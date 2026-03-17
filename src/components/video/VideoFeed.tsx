/**
 * VideoFeed — embeds the Pi-hosted WebRTC page inside the dashboard.
 * Provides loading and offline fallbacks for field operations.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const FALLBACK_PI_IP = "100.123.87.26";
const STREAM_PORT = "8889";
const STREAM_PATH = "/skyresq_cam";
const LOAD_TIMEOUT_MS = 12000;

function resolvePiHost(rawHost?: string) {
    const trimmed = rawHost?.trim();
    if (!trimmed) return FALLBACK_PI_IP;

    return trimmed
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "")
        .replace(/:\d+$/, "") || FALLBACK_PI_IP;
}

export default function VideoFeed() {
    const [fullscreen, setFullscreen] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    const streamUrl = useMemo(() => {
        const host = resolvePiHost(process.env.NEXT_PUBLIC_PI_TAILSCALE_IP);
        return `http://${host}:${STREAM_PORT}${STREAM_PATH}`;
    }, []);

    useEffect(() => {
        if (isLoaded || hasError) return;

        const timer = window.setTimeout(() => {
            setHasError(true);
            setIsLoaded(false);
        }, LOAD_TIMEOUT_MS);

        return () => window.clearTimeout(timer);
    }, [isLoaded, hasError, reloadKey, streamUrl]);

    useEffect(() => {
        const handleOffline = () => {
            setHasError(true);
            setIsLoaded(false);
        };

        window.addEventListener("offline", handleOffline);

        return () => {
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    const handleLoad = useCallback(() => {
        setIsLoaded(true);
        setHasError(false);
    }, []);

    const handleError = useCallback(() => {
        setHasError(true);
        setIsLoaded(false);
    }, []);

    const handleRetry = useCallback(() => {
        setReloadKey((current) => current + 1);
        setIsLoaded(false);
        setHasError(false);
    }, []);

    const feedActive = isLoaded && !hasError;

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
                            <span className="video-badge">WEBRTC</span>
                        </>
                    ) : hasError ? (
                        <span className="video-badge video-badge--offline">OFFLINE</span>
                    ) : (
                        <span className="video-badge">CONNECTING</span>
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
                {!hasError && (
                    <iframe
                        key={reloadKey}
                        className="video-feed__iframe"
                        src={streamUrl}
                        title="Sky ResQ live camera stream"
                        allow="autoplay; fullscreen"
                        loading="eager"
                        onLoad={handleLoad}
                        onError={handleError}
                    />
                )}

                {!isLoaded && !hasError && (
                    <div className="video-feed__overlay" role="status" aria-live="polite">
                        <div className="video-feed__spinner" aria-hidden="true" />
                        <div className="video-feed__placeholder-text">Connecting to stream...</div>
                        <div className="video-feed__placeholder-sub">Negotiating WebRTC session via Pi relay</div>
                    </div>
                )}

                {hasError && (
                    <div className="video-feed__fallback" role="alert">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.3">
                            <polygon points="23 7 16 12 23 17 23 7" />
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                        <div className="video-feed__placeholder-text">Stream Offline</div>
                        <div className="video-feed__placeholder-sub">Unable to load {streamUrl}</div>
                        <button className="video-feed__retry" onClick={handleRetry}>
                            Retry Stream
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
