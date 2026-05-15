/**
 * SAR Pipeline — UDP receiver + broadcaster for survivor pipeline data.
 *
 * Listens on a UDP port for newline-delimited JSON from the Pi:
 *   - {type: "survivor_cluster", id, lat, lon, count, confidence, ...}
 *   - {type: "detection_frame", frame_ts_ms, detections: [...]}
 *
 * Forwards each message to the renderer over IPC:
 *   - "survivor-detection"  → SurvivorClusterEvent
 *   - "detection-frame"     → DetectionFrameEvent
 *
 * If `SAR_MOCK=1` (or no UDP port is configured), a mock generator
 * emits cluster + frame data so the dashboard is testable without the Pi.
 */

const dgram = require("dgram");

// Per spec §8.3 the Pi sends survivor_cluster + detection_frame + pi_status
// JSON to PI_DETECTION_PORT (default 5005). SAR_UDP_PORT is retained as a
// legacy alias.
const DEFAULT_UDP_HOST = process.env.PI_DETECTION_HOST || "0.0.0.0";
const DEFAULT_UDP_PORT = parseInt(
    process.env.PI_DETECTION_PORT || process.env.SAR_UDP_PORT || "5005",
    10,
);
const ENABLE_MOCK = process.env.SAR_MOCK === "1" || process.env.SAR_MOCK === "true";

class SarPipeline {
    /**
     * @param {Electron.BrowserWindow} mainWindow
     * @param {{
     *   getDronePosition: () => {lat: number, lon: number} | null,
     *   onDetectionTick?: (tsMs: number) => void,
     * }} ctx
     */
    constructor(mainWindow, ctx) {
        this._window = mainWindow;
        this._ctx = ctx || { getDronePosition: () => null };
        this._socket = null;
        this._mockTimer = null;
        this._mockClusters = [];
        this._frameTimer = null;
        this._port = DEFAULT_UDP_PORT;
        this._host = DEFAULT_UDP_HOST;
        /** @type {((status: object) => void) | null} */
        this._piStatusListener = null;
    }

    /** Register a listener for pi_status heartbeats. */
    onPiStatus(callback) {
        this._piStatusListener = callback;
    }

    start() {
        try {
            this._socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
            this._socket.on("error", (err) => {
                console.warn("[SAR] UDP socket error:", err.message);
                if (err.code === "EADDRINUSE") {
                    this._emitWarning({
                        id: `sar-eaddrinuse-${this._port}`,
                        severity: "error",
                        title: `SAR pipeline can't bind UDP ${this._port}`,
                        message: `Another process is already listening on ${this._host}:${this._port}. Survivor + detection-frame + pi_status packets from the Pi will not be received.`,
                        hint: `Find the conflicting process with: ss -ulnp | grep :${this._port}  — then kill it and restart the dashboard.`,
                    });
                }
            });
            this._socket.on("message", (buf) => this._handleDatagram(buf));
            this._socket.bind(this._port, this._host, () => {
                console.log(`[SAR] Listening for survivor pipeline on udp ${this._host}:${this._port}`);
            });
        } catch (err) {
            console.warn("[SAR] Failed to start UDP listener:", err.message);
        }

        if (ENABLE_MOCK) {
            this._startMockGenerator();
        }
    }

    stop() {
        if (this._socket) {
            try { this._socket.close(); } catch { /* ignore */ }
            this._socket = null;
        }
        this._stopMockGenerator();
    }

    _handleDatagram(buf) {
        // Pipe may batch multiple JSON objects with newlines; split & parse each.
        const text = buf.toString("utf8");
        for (const line of text.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let msg;
            try {
                msg = JSON.parse(trimmed);
            } catch {
                continue;
            }
            this._dispatch(msg);
        }
    }

    _emitWarning(payload) {
        if (!this._window || this._window.isDestroyed()) return;
        try { this._window.webContents.send("system-warning", payload); } catch { /* ignore */ }
    }

    _dispatch(msg) {
        if (!msg || typeof msg !== "object") return;

        if (msg.type === "survivor_cluster") {
            this._sendCluster(msg);
        } else if (msg.type === "detection_frame") {
            this._sendDetectionFrame(msg);
        } else if (msg.type === "pi_status") {
            this._sendPiStatus(msg);
        } else if (msg.type === "mission_state") {
            this._sendMissionState(msg);
        }
    }

    _sendMissionState(msg) {
        if (!this._window || this._window.isDestroyed()) return;
        const payload = {
            state: String(msg.state || "UNKNOWN"),
            sub_state: String(msg.sub_state || ""),
            target_distance_m: msg.target_distance_m ?? null,
            altitude_agl_m: msg.altitude_agl_m ?? null,
            battery_remaining: msg.battery_remaining ?? null,
            vision_locked: !!msg.vision_locked,
            gimbal_healthy: !!msg.gimbal_healthy,
            gps_healthy: !!msg.gps_healthy,
            ts_ms: Number(msg.ts_ms || Date.now()),
        };
        try {
            this._window.webContents.send("mission-state", payload);
        } catch { /* window may be gone */ }
    }

    _sendPiStatus(msg) {
        if (!this._window || this._window.isDestroyed()) return;
        // Re-emit verbatim (already shaped per spec §1.4) plus a wall-clock arrival ts.
        const payload = { ...msg, arrivedMs: Date.now() };
        try {
            this._window.webContents.send("pi-status", payload);
        } catch { /* window may be gone */ }
        if (this._piStatusListener) {
            try { this._piStatusListener(payload); } catch { /* ignore */ }
        }
    }

    _sendCluster(msg) {
        if (!this._window || this._window.isDestroyed()) return;
        const payload = {
            id: String(msg.id || `cluster-${Date.now()}`),
            lat: Number(msg.lat),
            lon: Number(msg.lon),
            alt: msg.alt != null ? Number(msg.alt) : undefined,
            count: Number(msg.count || 1),
            confidence: Number(msg.confidence || 0),
            first_seen_ms: msg.first_seen_ms ? Number(msg.first_seen_ms) : Date.now(),
            last_seen_ms: msg.last_seen_ms ? Number(msg.last_seen_ms) : Date.now(),
            n_samples: msg.n_samples ? Number(msg.n_samples) : 1,
        };
        try {
            this._window.webContents.send("survivor-detection", payload);
        } catch { /* window may be gone */ }
    }

    _sendDetectionFrame(msg) {
        if (!this._window || this._window.isDestroyed()) return;
        if (typeof this._ctx.onDetectionTick === "function") {
            try { this._ctx.onDetectionTick(Number(msg.frame_ts_ms || Date.now())); } catch { /* ignore */ }
        }
        const payload = {
            frame_ts_ms: Number(msg.frame_ts_ms || Date.now()),
            stream_width: Number(msg.stream_width || 1280),
            stream_height: Number(msg.stream_height || 720),
            detections: Array.isArray(msg.detections)
                ? msg.detections.map((d) => ({
                    bbox: Array.isArray(d.bbox) && d.bbox.length === 4 ? d.bbox.map(Number) : [0, 0, 0, 0],
                    confidence: Number(d.confidence || 0),
                    class: String(d.class || "person"),
                    cluster_id: d.cluster_id ?? null,
                }))
                : [],
        };
        try {
            this._window.webContents.send("detection-frame", payload);
        } catch { /* window may be gone */ }
    }

    // ─── Mock generator (for development without the Pi) ─────────

    _startMockGenerator() {
        console.log("[SAR] Mock generator enabled (SAR_MOCK=1)");

        // Generate a cluster every ~8 s, anchored to the drone's current
        // position (or Islamabad default) with a small random offset.
        const generateCluster = () => {
            const home = this._ctx.getDronePosition?.() || { lat: 33.6844, lon: 73.0479 };
            const idx = this._mockClusters.length + 1;
            const id = `mock-cluster-${idx}`;
            const dLat = (Math.random() - 0.5) * 0.0006;
            const dLon = (Math.random() - 0.5) * 0.0006;
            const cluster = {
                type: "survivor_cluster",
                id,
                lat: home.lat + dLat,
                lon: home.lon + dLon,
                alt: 0,
                count: 1 + Math.floor(Math.random() * 3),
                confidence: 0.7 + Math.random() * 0.25,
                first_seen_ms: Date.now(),
                last_seen_ms: Date.now(),
                n_samples: 1,
            };
            this._mockClusters.push(cluster);
            this._dispatch(cluster);
        };

        // First cluster after 6 s; subsequent ones every 15-25 s up to 4.
        setTimeout(() => {
            if (!ENABLE_MOCK) return;
            generateCluster();
            this._mockTimer = setInterval(() => {
                if (this._mockClusters.length >= 4) {
                    clearInterval(this._mockTimer);
                    this._mockTimer = null;
                    return;
                }
                generateCluster();
            }, 18000);
        }, 6000);

        // Emit pi_status @ 1 Hz so the badge shows green during mock runs.
        this._piStatusTimer = setInterval(() => {
            const now = Date.now();
            const start = this._mockStartTs || (this._mockStartTs = now);
            this._dispatch({
                type: "pi_status",
                ts_ms: now,
                uptime_s: Math.round((now - start) / 1000),
                cpu_temp_c: 48 + Math.sin(now / 10000) * 6,
                cpu_load1: 0.3 + Math.random() * 0.2,
                ram_used_mb: 1700 + Math.round(Math.random() * 200),
                ram_total_mb: 4096,
                detector: { ok: true, fps: 8 + Math.random() },
                camera: { ok: true, fps: 24 },
                gimbal: { ok: true, pitch_deg: -90, yaw_deg: 0 },
                fc_link: { ok: true, armed: false },
                gcs_link: { ok: true },
                cluster_count: this._mockClusters.length,
            });
        }, 1000);

        // Emit ~5 Hz detection frames once at least one cluster exists.
        this._frameTimer = setInterval(() => {
            if (!this._mockClusters.length) return;
            const detections = this._mockClusters.slice(0, 2).map((c, i) => {
                const cx = 400 + i * 240 + Math.sin(Date.now() / 700 + i) * 20;
                const cy = 280 + Math.cos(Date.now() / 900 + i) * 30;
                return {
                    bbox: [cx - 40, cy - 60, cx + 40, cy + 60],
                    confidence: c.confidence,
                    class: "person",
                    cluster_id: c.id,
                };
            });
            this._dispatch({
                type: "detection_frame",
                frame_ts_ms: Date.now(),
                stream_width: 1280,
                stream_height: 720,
                detections,
            });
        }, 200);
    }

    _stopMockGenerator() {
        if (this._mockTimer) {
            clearInterval(this._mockTimer);
            this._mockTimer = null;
        }
        if (this._frameTimer) {
            clearInterval(this._frameTimer);
            this._frameTimer = null;
        }
        if (this._piStatusTimer) {
            clearInterval(this._piStatusTimer);
            this._piStatusTimer = null;
        }
        this._mockClusters = [];
        this._mockStartTs = 0;
    }
}

module.exports = { SarPipeline };
