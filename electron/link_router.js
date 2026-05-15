/**
 * Link Router — 4G/SiK MAVLink failover per spec §8.5.
 *
 * Listens for the Pi's UDP MAVLink mirror on port 14550 and tracks the
 * freshness of both that UDP channel and the existing SiK serial channel
 * (whose state is read from MAVLinkHandler). Picks the active link as
 * the one with the freshest heartbeat (UDP preferred when both fresh).
 *
 * Pushes both telemetry frames (UDP path) into the same MAVLinkHandler
 * pipeline so the rest of the app doesn't need to know which radio
 * provided the data.
 *
 * Emits "link-status" IPC at ~2 Hz so the title-bar dots stay live.
 */

const dgram = require("dgram");

const FRESH_MS = 1500;

class LinkRouter {
    /**
     * @param {Electron.BrowserWindow} mainWindow
     * @param {import('./mavlink').MAVLinkHandler} mavlinkHandler
     */
    constructor(mainWindow, mavlinkHandler) {
        this._window = mainWindow;
        this._mavlink = mavlinkHandler;

        this._socket = null;
        this._host = process.env.MAVLINK_UDP_HOST || "0.0.0.0";
        this._port = parseInt(process.env.MAVLINK_UDP_PORT || "14550", 10);
        this._bidir = process.env.MAVLINK_UDP_BIDIR === "1" || process.env.MAVLINK_UDP_BIDIR === "true";

        /** Last UDP heartbeat (wall clock ms). */
        this._udpLastHbMs = 0;
        /** Remote address of the most recent datagram (used for command writes). */
        this._udpRemote = null;

        /** Forced link override: "auto" (default), "udp", "sik". */
        this._forced = "auto";

        this._broadcastTimer = null;
    }

    start() {
        try {
            this._socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
            this._socket.on("error", (err) => {
                console.warn("[Link] UDP socket error:", err.message);
                if (err.code === "EADDRINUSE") {
                    this._emitWarning({
                        id: `link-eaddrinuse-${this._port}`,
                        severity: "warning",
                        title: `4G/UDP MAVLink mirror can't bind UDP ${this._port}`,
                        message: `Another process is already listening on ${this._host}:${this._port}. The dashboard will keep working over SiK serial — only the high-rate 4G failover path is disabled.`,
                        hint: `Find the conflicting process with: ss -ulnp | grep :${this._port}  — then kill it and restart.`,
                    });
                }
            });
            this._socket.on("message", (buf, rinfo) => this._handleUdp(buf, rinfo));
            this._socket.bind(this._port, this._host, () => {
                console.log(`[Link] Listening for MAVLink mirror on udp ${this._host}:${this._port}`);
            });
        } catch (err) {
            console.warn("[Link] Failed to start UDP MAVLink listener:", err.message);
        }

        this._broadcastTimer = setInterval(() => this._broadcast(), 500);
    }

    stop() {
        if (this._broadcastTimer) {
            clearInterval(this._broadcastTimer);
            this._broadcastTimer = null;
        }
        if (this._socket) {
            try { this._socket.close(); } catch { /* ignore */ }
            this._socket = null;
        }
    }

    setForced(mode) {
        if (mode === "auto" || mode === "udp" || mode === "sik") {
            this._forced = mode;
            this._broadcast();
            return { success: true, message: `Active link forced to ${mode}` };
        }
        return { success: false, message: `Unknown link mode: ${mode}` };
    }

    /** Returns the currently chosen active link name. */
    activeLink() {
        if (this._forced !== "auto") return this._forced;
        const now = Date.now();
        const sik = this._mavlink ? this._mavlink.getStateSnapshot() : null;
        const sikLastHbMs = sik && sik.lastHeartbeat ? sik.lastHeartbeat * 1000 : 0;
        const sikFresh = sikLastHbMs && (now - sikLastHbMs) < FRESH_MS;
        const udpFresh = this._udpLastHbMs && (now - this._udpLastHbMs) < FRESH_MS;

        // Prefer UDP/4G when fresh (10Hz, lower latency).
        if (udpFresh) return "udp";
        if (sikFresh) return "sik";
        if (this._udpLastHbMs > 0) return "udp";
        if (sikLastHbMs > 0) return "sik";
        return "none";
    }

    /**
     * Optionally relay a command buffer over UDP to the Pi (which writes it
     * to the FC serial). Used only when MAVLINK_UDP_BIDIR=1.
     */
    sendCommandUdp(buf) {
        if (!this._bidir || !this._socket || !this._udpRemote) return false;
        try {
            // Pi spec: write back to <pi-ip>:14551
            this._socket.send(buf, 0, buf.length, 14551, this._udpRemote.address);
            return true;
        } catch (err) {
            console.warn("[Link] UDP send failed:", err.message);
            return false;
        }
    }

    // ─── Private ─────────────────────────────────────────────

    _emitWarning(payload) {
        if (!this._window || this._window.isDestroyed()) return;
        try { this._window.webContents.send("system-warning", payload); } catch { /* ignore */ }
    }

    _handleUdp(buf, rinfo) {
        this._udpRemote = rinfo;

        // Feed the bytes through the MAVLinkHandler's parser so the rest of
        // the app sees a unified telemetry stream. We piggyback on the
        // existing parser since the protocol is identical.
        if (this._mavlink && typeof this._mavlink.ingestExternalBytes === "function") {
            try {
                this._mavlink.ingestExternalBytes(buf, "udp");
            } catch (err) {
                console.warn("[Link] Parse error:", err.message);
            }
        }
    }

    /** Called by MAVLinkHandler when a HEARTBEAT arrives on the UDP path. */
    noteUdpHeartbeat() {
        this._udpLastHbMs = Date.now();
    }

    _broadcast() {
        if (!this._window || this._window.isDestroyed()) return;

        const now = Date.now();
        const sik = this._mavlink ? this._mavlink.getStateSnapshot() : null;
        const sikLastHbMs = sik && sik.lastHeartbeat ? sik.lastHeartbeat * 1000 : 0;

        const payload = {
            active: this.activeLink(),
            forced: this._forced,
            sik: {
                connected: !!(sik && sik.connected),
                lastHbMs: sikLastHbMs,
                freshMs: sikLastHbMs ? now - sikLastHbMs : Infinity,
            },
            udp: {
                connected: this._udpLastHbMs > 0 && (now - this._udpLastHbMs) < FRESH_MS * 4,
                lastHbMs: this._udpLastHbMs,
                freshMs: this._udpLastHbMs ? now - this._udpLastHbMs : Infinity,
            },
        };

        try {
            this._window.webContents.send("link-status", payload);
        } catch { /* window may be gone */ }
    }
}

module.exports = { LinkRouter };
