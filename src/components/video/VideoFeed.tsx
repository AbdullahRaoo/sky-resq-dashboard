/**
 * VideoFeed — live camera with clickable detection overlay.
 *
 * Tries Path A first (per spec §8.1 + §8.6): native <video> + WHEP from
 * mediamtx on the Pi. Stacks a transparent <canvas> for bbox outlines and
 * pointer-events: auto cluster badges on top.
 *
 * Falls back to Path B (iframe) if the WHEP endpoint refuses our offer
 * (mediamtx not yet configured, no codec match, network failure, etc.).
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSurvivorStore } from "@/store/survivorStore";
import { useSettingsStore } from "@/store/settingsStore";
import { connectWhep, type WhepSession } from "@/lib/whep";

const FALLBACK_PI_IP = "100.123.87.26";
const WEBRTC_PORT = "8889";   // mediamtx WebRTC + WHEP
const HLS_PORT = "8888";      // mediamtx HLS (works when WebRTC SDP is broken)
const STREAM_PATH = "/skyresq_cam";
const LOAD_TIMEOUT_MS = 12000;
const DETECTION_STALE_MS = 1500;

function resolvePiHost(rawHost?: string) {
    const trimmed = rawHost?.trim();
    if (!trimmed) return FALLBACK_PI_IP;

    return trimmed
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "")
        .replace(/:\d+$/, "") || FALLBACK_PI_IP;
}

type VideoMode = "connecting" | "whep" | "hls" | "iframe" | "offline";

export default function VideoFeed() {
    const [fullscreen, setFullscreen] = useState(false);
    const [mode, setMode] = useState<VideoMode>("connecting");
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const detectionFrame = useSurvivorStore((s) => s.latestDetectionFrame);
    const survivors = useSurvivorStore((s) => s.detections);
    const setSelected = useSurvivorStore((s) => s.setSelected);
    const selectedId = useSurvivorStore((s) => s.selectedId);

    const viewportRef = useRef<HTMLDivElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const sessionRef = useRef<WhepSession | null>(null);
    const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });

    // Host selection: prefer LAN (fast, direct), fall back to remote (Tailscale)
    // if LAN doesn't respond within a short probe timeout. Re-probes on
    // reloadKey change so the user can force re-detection by hitting Retry.
    const piLanHost = useSettingsStore((s) => s.piLanHost);
    const piRemoteHost = useSettingsStore((s) => s.piRemoteHost);
    const lowBandwidthMode = useSettingsStore((s) => s.lowBandwidthMode);
    const lanCandidate = useMemo(() => resolvePiHost(piLanHost), [piLanHost]);
    const remoteCandidate = useMemo(
        () => resolvePiHost(piRemoteHost || process.env.NEXT_PUBLIC_PI_TAILSCALE_IP),
        [piRemoteHost],
    );

    const [activeHost, setActiveHost] = useState<string>(remoteCandidate);
    const [activeHostSource, setActiveHostSource] = useState<"lan" | "remote" | "probing">("probing");

    useEffect(() => {
        // Reachability probe: HEAD the mediamtx WHEP path on the LAN host
        // with a tight timeout. If it responds (any HTTP status counts as
        // "reachable"), use the LAN path; otherwise fall back to remote.
        // CORS/no-cors quirks don't matter — we only need to know the
        // port is open and the server replied.
        if (!lanCandidate || lanCandidate === remoteCandidate) {
            setActiveHost(remoteCandidate);
            setActiveHostSource("remote");
            return;
        }
        let cancelled = false;
        setActiveHostSource("probing");
        const ctrl = new AbortController();
        const probeUrl = `http://${lanCandidate}:${WEBRTC_PORT}${STREAM_PATH}/whep`;
        const timer = setTimeout(() => ctrl.abort(), 800);
        fetch(probeUrl, { method: "OPTIONS", mode: "no-cors", signal: ctrl.signal })
            .then(() => {
                if (cancelled) return;
                setActiveHost(lanCandidate);
                setActiveHostSource("lan");
            })
            .catch(() => {
                if (cancelled) return;
                setActiveHost(remoteCandidate);
                setActiveHostSource("remote");
            })
            .finally(() => clearTimeout(timer));
        return () => { cancelled = true; clearTimeout(timer); ctrl.abort(); };
    }, [lanCandidate, remoteCandidate, reloadKey]);

    const piHost = activeHost;
    const whepUrl = useMemo(() => `http://${piHost}:${WEBRTC_PORT}${STREAM_PATH}/whep`, [piHost]);
    const hlsUrl = useMemo(() => `http://${piHost}:${HLS_PORT}${STREAM_PATH}`, [piHost]);
    const iframeUrl = useMemo(() => `http://${piHost}:${WEBRTC_PORT}${STREAM_PATH}`, [piHost]);

    // Establish the WHEP session — if it fails, or if it "succeeds" but no
    // frames decrypt within 4 s (the SRTP-unprotect failure mode we hit on
    // mediamtx), fall back to the iframe path.
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Low Bandwidth Mode skips WHEP and goes straight to HLS.
        // HLS buffers 2–3 s of segments, hiding the queue-jitter we see
        // when Tailscale is on the DERP relay path (symmetric NAT).
        if (lowBandwidthMode) {
            setMode("hls");
            setError(null);
            return;
        }

        const abortCtrl = new AbortController();
        let cancelled = false;
        let blackFrameTimer: ReturnType<typeof setTimeout> | null = null;
        // Reset UI state to "connecting" for the new attempt (effect responds
        // to an external trigger — the reloadKey/url change).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMode("connecting");
        setError(null);

        (async () => {
            try {
                const session = await connectWhep(whepUrl, video, { signal: abortCtrl.signal });
                if (cancelled) {
                    session.stop();
                    return;
                }
                sessionRef.current = session;
                setMode("whep");

                // Black-frame watchdog: if no actual frames arrive within 4 s,
                // assume mediamtx is producing bad WebRTC SDP (BUNDLE codec
                // collision or SRTP rekey) and fall back to HLS, which uses
                // plain HTTP segments and doesn't share those bugs.
                blackFrameTimer = setTimeout(() => {
                    if (cancelled) return;
                    if (video.videoWidth === 0 || video.videoHeight === 0) {
                        console.warn("[VideoFeed] WHEP connected but no frames decoded — falling back to HLS");
                        try { session.stop(); } catch { /* ignore */ }
                        sessionRef.current = null;
                        setError("WHEP rejected by browser (likely mediamtx codec/SRTP issue) — switching to HLS");
                        setMode("hls");
                    }
                }, 4000);
            } catch (err) {
                if (cancelled) return;
                console.warn("[VideoFeed] WHEP failed, falling back to HLS:", err);
                setMode("hls");
                setError(err instanceof Error ? err.message : "WHEP unavailable");
            }
        })();

        return () => {
            cancelled = true;
            abortCtrl.abort();
            if (blackFrameTimer) clearTimeout(blackFrameTimer);
            if (sessionRef.current) {
                sessionRef.current.stop();
                sessionRef.current = null;
            }
        };
    }, [whepUrl, reloadKey, lowBandwidthMode]);

    // HLS / iframe load watchdog. If HLS doesn't load within the timeout,
    // try the legacy WebRTC iframe next; if that fails too, mark offline.
    useEffect(() => {
        if (mode !== "hls" && mode !== "iframe") return;
        const timer = window.setTimeout(() => {
            if (mode === "hls") {
                console.warn("[VideoFeed] HLS didn't load — falling back to WebRTC iframe");
                setMode("iframe");
            } else {
                setMode("offline");
            }
        }, LOAD_TIMEOUT_MS);
        return () => window.clearTimeout(timer);
    }, [mode, reloadKey]);

    useEffect(() => {
        const handleOffline = () => setMode("offline");
        window.addEventListener("offline", handleOffline);
        return () => window.removeEventListener("offline", handleOffline);
    }, []);

    // Track viewport size for canvas sizing.
    useEffect(() => {
        if (!viewportRef.current) return;
        const el = viewportRef.current;
        const ro = new ResizeObserver(() => {
            setViewportSize({ w: el.clientWidth, h: el.clientHeight });
        });
        ro.observe(el);
        setViewportSize({ w: el.clientWidth, h: el.clientHeight });
        return () => ro.disconnect();
    }, [mode]);

    // Draw bbox outlines on the canvas whenever we get a new frame.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewportSize.w * dpr;
        canvas.height = viewportSize.h * dpr;
        canvas.style.width = `${viewportSize.w}px`;
        canvas.style.height = `${viewportSize.h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, viewportSize.w, viewportSize.h);

        if (!detectionFrame || viewportSize.w === 0 || viewportSize.h === 0) return;
        if (Date.now() - detectionFrame.frameTsMs > DETECTION_STALE_MS) return;

        const scaleX = viewportSize.w / detectionFrame.streamWidth;
        const scaleY = viewportSize.h / detectionFrame.streamHeight;

        ctx.lineWidth = 2;
        ctx.font = "11px 'Space Grotesk', sans-serif";

        for (const det of detectionFrame.detections) {
            const [x1, y1, x2, y2] = det.bbox;
            const rx = x1 * scaleX;
            const ry = y1 * scaleY;
            const rw = (x2 - x1) * scaleX;
            const rh = (y2 - y1) * scaleY;

            const selected = det.clusterId === selectedId;
            ctx.strokeStyle = selected ? "#ef9c18" : "#34d399";
            ctx.fillStyle = selected ? "rgba(239,156,24,0.18)" : "rgba(52,211,153,0.10)";

            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeRect(rx, ry, rw, rh);

            const label = `${det.class} ${(det.confidence * 100).toFixed(0)}%`;
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = selected ? "#ef9c18" : "#34d399";
            ctx.fillRect(rx, ry - 14, tw + 8, 14);
            ctx.fillStyle = "#0c1018";
            ctx.fillText(label, rx + 4, ry - 3);
        }
    }, [detectionFrame, viewportSize, selectedId]);

    // Compute clickable cluster badges (centroid per cluster id).
    const clusterBadges = useMemo(() => {
        if (!detectionFrame || viewportSize.w === 0) return [];

        const scaleX = viewportSize.w / detectionFrame.streamWidth;
        const scaleY = viewportSize.h / detectionFrame.streamHeight;

        const byCluster = new Map<string, { sumX: number; sumY: number; n: number }>();
        for (const det of detectionFrame.detections) {
            if (!det.clusterId) continue;
            const cx = ((det.bbox[0] + det.bbox[2]) / 2) * scaleX;
            const cy = ((det.bbox[1] + det.bbox[3]) / 2) * scaleY;
            const entry = byCluster.get(det.clusterId) || { sumX: 0, sumY: 0, n: 0 };
            entry.sumX += cx;
            entry.sumY += cy;
            entry.n += 1;
            byCluster.set(det.clusterId, entry);
        }

        return Array.from(byCluster.entries()).map(([clusterId, agg]) => {
            const cluster = survivors.find((s) => s.id === clusterId);
            return {
                clusterId,
                x: agg.sumX / agg.n,
                y: agg.sumY / agg.n,
                count: cluster?.count ?? agg.n,
                status: cluster?.status ?? "new",
            };
        });
    }, [detectionFrame, viewportSize, survivors]);

    const handleRetry = useCallback(() => {
        setReloadKey((k) => k + 1);
        setError(null);
        setMode("connecting");
    }, []);

    const feedActive = mode === "whep" || mode === "hls" || mode === "iframe";
    const liveBadgeText =
        mode === "whep" ? "● LIVE"
        : mode === "hls" ? "● LIVE (HLS fallback)"
        : mode === "iframe" ? "● LIVE (WebRTC fallback)"
        : null;
    const protocolBadge =
        mode === "whep" ? "WHEP"
        : mode === "hls" ? "HLS"
        : mode === "iframe" ? "WEBRTC"
        : "—";
    const hostBadge =
        activeHostSource === "lan" ? "LAN"
        : activeHostSource === "remote" ? "REMOTE"
        : "…";

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
                            <span className="video-badge video-badge--live">{liveBadgeText}</span>
                            <span className="video-badge">{protocolBadge}</span>
                            <span className="video-badge" title={`video path: ${activeHost}`}>{hostBadge}</span>
                            {clusterBadges.length > 0 && (
                                <span className="video-badge" style={{ color: "var(--accent-primary)" }}>
                                    {clusterBadges.length} det
                                </span>
                            )}
                        </>
                    ) : mode === "offline" ? (
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

            <div className="video-feed__viewport" ref={viewportRef}>
                {/* Path A: native <video>. Always rendered, hidden when in iframe fallback. */}
                <video
                    ref={videoRef}
                    className="video-feed__iframe"
                    autoPlay
                    muted
                    playsInline
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        background: "#000",
                        display: mode === "whep" ? "block" : "none",
                    }}
                />

                {/* Path B: HLS via mediamtx's HTML player (uses hls.js).
                    More robust than WebRTC when mediamtx ships a broken SDP. */}
                {mode === "hls" && (
                    <iframe
                        key={`hls-${reloadKey}`}
                        className="video-feed__iframe"
                        src={hlsUrl}
                        title="Sky ResQ live camera (HLS)"
                        allow="autoplay; fullscreen"
                        loading="eager"
                        onError={() => setMode("iframe")}
                    />
                )}

                {/* Path C: legacy WebRTC iframe — same media bug usually but
                    we keep it as a last resort. */}
                {mode === "iframe" && (
                    <iframe
                        key={`webrtc-${reloadKey}`}
                        className="video-feed__iframe"
                        src={iframeUrl}
                        title="Sky ResQ live camera stream"
                        allow="autoplay; fullscreen"
                        loading="eager"
                        onError={() => setMode("offline")}
                    />
                )}

                {/* bbox canvas overlay (pointer-events: none via CSS class) */}
                {feedActive && (
                    <canvas ref={canvasRef} className="video-overlay-canvas" aria-hidden="true" />
                )}

                {/* Clickable cluster badges */}
                {feedActive && clusterBadges.map((b) => (
                    <button
                        key={b.clusterId}
                        className="video-cluster-badge"
                        style={{ left: b.x, top: b.y }}
                        onClick={() => setSelected(b.clusterId)}
                        title={`Select cluster #${b.clusterId.slice(-6)}`}
                    >
                        <span>✕</span>
                        <span>{b.count}</span>
                    </button>
                ))}

                {mode === "connecting" && (
                    <div className="video-feed__overlay" role="status" aria-live="polite">
                        <div className="video-feed__spinner" aria-hidden="true" />
                        <div className="video-feed__placeholder-text">Negotiating WHEP session...</div>
                        <div className="video-feed__placeholder-sub">{whepUrl}</div>
                    </div>
                )}

                {mode === "offline" && (
                    <div className="video-feed__fallback" role="alert">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.3">
                            <polygon points="23 7 16 12 23 17 23 7" />
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                        <div className="video-feed__placeholder-text">Stream Offline</div>
                        <div className="video-feed__placeholder-sub">
                            {error ? `Last error: ${error}` : `Unable to reach ${piHost}`}
                        </div>
                        <div className="video-feed__placeholder-sub" style={{ marginTop: 8, fontSize: "0.7rem", opacity: 0.7 }}>
                            Tried: WHEP {WEBRTC_PORT}/whep · HLS {HLS_PORT} · WebRTC {WEBRTC_PORT}.<br />
                            If all three fail, mediamtx on the Pi is likely the issue (BUNDLE codec collision / SRTP rekey bugs).
                        </div>
                        <button className="video-feed__retry" onClick={handleRetry}>
                            Retry Stream
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
