/**
 * Payload Service — auto-drop FSM, interlock validation, and
 * MAV_CMD_DO_SET_SERVO orchestration.
 *
 * Drives state transitions:
 *   IDLE/READY ──policy.enabled & auto──► ARMED
 *   ARMED  ──in_tolerance & detection_fresh──► CONFIRMING
 *   CONFIRMING ──held > hold_time_s──► DROPPING
 *   CONFIRMING ──drift_out──► ARMED (reset hold)
 *   DROPPING ──ack ok──► DROPPED
 *   DROPPING ──fail──► ARMED (up to 3 retries, then FAULT)
 *
 * Listens to:
 *   - 5Hz tick of telemetry from MAVLinkHandler
 *   - SAR pipeline detection frames (for require_active_detection)
 *
 * Broadcasts "payload-state" IPC events whenever state OR interlocks change.
 */

const MAV_CMD_DO_SET_SERVO = 183;

const DEFAULT_POLICY = {
    enabled: false,
    trigger: "manual",                  // "manual" | "auto"
    horizontal_tolerance_m: 1.0,
    altitude_min_m: 2.0,
    altitude_max_m: 5.0,
    hold_time_s: 3.0,
    require_active_detection: true,
    one_shot: true,
};

const DEFAULT_CONFIG = {
    // Servo + PWM endpoints are configurable via .env (see spec §8.2).
    servoChannel: parseInt(process.env.PAYLOAD_SERVO_CHANNEL || "9", 10),
    pwmOpen: parseInt(process.env.PAYLOAD_PWM_OPEN_US || "1900", 10),
    pwmClosed: parseInt(process.env.PAYLOAD_PWM_CLOSED_US || "1100", 10),
    openHoldSecs: parseFloat(process.env.PAYLOAD_OPEN_HOLD_S || "3"),
    minBatteryPercent: 30,
    minGpsFix: 3,
    maxHdop: 2.0,
    linkTimeoutSec: 1.0,
};

const DEFAULT_TARGET_SURVIVOR = null;

class PayloadService {
    /**
     * @param {Electron.BrowserWindow} mainWindow
     * @param {import('./mavlink').MAVLinkHandler} mavlinkHandler
     */
    constructor(mainWindow, mavlinkHandler) {
        this._window = mainWindow;
        this._mavlink = mavlinkHandler;

        this._state = "ready";           // ready | armed | confirming | dropping | dropped | fault
        this._policy = { ...DEFAULT_POLICY };
        this._config = { ...DEFAULT_CONFIG };

        this._interlocks = this._defaultInterlocks();
        this._lastBroadcast = "";

        /** Target lat/lon/alt for auto-drop attempts (driven externally or
         * derived from drone position when manual). */
        this._target = DEFAULT_TARGET_SURVIVOR;
        this._lastDetectionTs = 0;
        this._holdStartedTs = 0;
        this._dropAttempts = 0;

        this._tickHandle = null;
    }

    start() {
        this._tickHandle = setInterval(() => this._tick(), 200); // 5Hz
        console.log("[Payload] Service started");
    }

    stop() {
        if (this._tickHandle) clearInterval(this._tickHandle);
        this._tickHandle = null;
    }

    /** Called by SAR pipeline whenever a detection_frame arrives. */
    noteDetection(ts) {
        this._lastDetectionTs = ts || Date.now();
    }

    /** Set the auto-drop target survivor (lat/lon). */
    setTarget(target) {
        this._target = target;
    }

    snapshot() {
        return {
            state: this._state,
            interlocks: { ...this._interlocks },
            policy: { ...this._policy },
            droppedAt: this._droppedAt || null,
            survivorId: this._target?.survivorId || null,
        };
    }

    /** Reset one-shot guard + state machine. */
    resetMissionFlags() {
        if (this._state === "dropping") {
            // Don't interrupt an in-flight drop. Caller should wait.
            return;
        }
        this._state = "ready";
        this._dropAttempts = 0;
        this._holdStartedTs = 0;
        this._droppedAt = null;
        this._broadcastIfChanged("Mission reset");
    }

    /** Update policy values. */
    async setPolicy(partial) {
        this._policy = { ...this._policy, ...partial };
        // Transition based on new policy
        if (!this._policy.enabled && (this._state === "armed" || this._state === "confirming")) {
            this._state = "ready";
            this._holdStartedTs = 0;
        }
        this._broadcastIfChanged("Policy updated");
        return { success: true, message: "Policy updated" };
    }

    /**
     * Operator-initiated manual drop. Validates critical interlocks then
     * issues the MAV_CMD_DO_SET_SERVO sequence. Bypasses auto-drop FSM.
     */
    async requestManualDrop(options = {}) {
        const force = !!options.force;
        const survivorId = options.survivorId || null;

        // Refresh interlocks
        this._evaluateInterlocks();

        if (!force) {
            const reason = this._whyDropBlocked();
            if (reason) {
                return { success: false, message: reason };
            }
        } else {
            // Even with force, never drop if not armed or no link.
            if (!this._interlocks.armed) return { success: false, message: "Refused: drone disarmed" };
            if (!this._interlocks.linkOk) return { success: false, message: "Refused: link lost" };
        }

        if (this._state === "dropped" && this._policy.one_shot) {
            return { success: false, message: "Refused: payload already dropped this mission (use Reset Mission)" };
        }

        if (this._state === "dropping") {
            return { success: false, message: "Drop already in progress" };
        }

        const result = await this._executeDropSequence(survivorId);
        return result;
    }

    // ─── Private ─────────────────────────────────────────────

    _defaultInterlocks() {
        return {
            armed: false,
            guided: false,
            gpsFixOk: false,
            batteryOk: false,
            altitudeOk: false,
            notDropped: true,
            linkOk: false,
        };
    }

    _whyDropBlocked() {
        const i = this._interlocks;
        if (!i.linkOk) return "Refused: link to drone lost";
        if (!i.armed) return "Refused: drone is not armed";
        if (!i.guided) return "Refused: drone must be in GUIDED mode";
        if (!i.gpsFixOk) return "Refused: GPS fix insufficient";
        if (!i.batteryOk) return `Refused: battery below ${this._config.minBatteryPercent}%`;
        if (!i.altitudeOk) return `Refused: altitude outside ${this._policy.altitude_min_m}-${this._policy.altitude_max_m}m`;
        if (!i.notDropped && this._policy.one_shot) return "Refused: already dropped (one-shot)";
        return null;
    }

    _evaluateInterlocks() {
        const snap = this._mavlink.getStateSnapshot();
        const now = Date.now() / 1000;
        const linkAgeS = snap.lastHeartbeat ? now - snap.lastHeartbeat : Infinity;

        const armed = !!snap.armed;
        const guided = snap.mode === "GUIDED";
        const gpsFixOk = (snap.gps?.fix_type || 0) >= this._config.minGpsFix &&
            (snap.gps?.hdop || 99) <= this._config.maxHdop;
        const batteryOk = (snap.battery?.remaining || -1) === -1 ||
            (snap.battery?.remaining || 0) > this._config.minBatteryPercent;
        const relAlt = snap.position?.relative_alt || 0;
        const altitudeOk = relAlt >= this._policy.altitude_min_m && relAlt <= this._policy.altitude_max_m;
        const notDropped = this._state !== "dropped";
        const linkOk = snap.connected && linkAgeS < this._config.linkTimeoutSec * 5;

        this._interlocks = { armed, guided, gpsFixOk, batteryOk, altitudeOk, notDropped, linkOk };
    }

    _tick() {
        if (!this._mavlink) return;
        this._evaluateInterlocks();

        const linkLost = !this._interlocks.linkOk;
        const guidedLost = !this._interlocks.guided;

        // Safety rails — auto-drop disarms on link loss or GUIDED loss.
        if ((linkLost || guidedLost) && (this._state === "armed" || this._state === "confirming")) {
            this._state = "ready";
            this._holdStartedTs = 0;
            this._broadcastIfChanged(linkLost ? "Auto-drop disarmed: link lost" : "Auto-drop disarmed: not in GUIDED");
            return;
        }

        // Policy gating
        if (!this._policy.enabled || this._policy.trigger !== "auto") {
            this._broadcastIfChanged();
            return;
        }

        // ARM the auto-drop when policy is on + flying in GUIDED + link OK.
        if (this._state === "ready" && this._interlocks.armed && this._interlocks.guided && this._interlocks.linkOk) {
            this._state = "armed";
            this._broadcastIfChanged("Auto-drop armed");
        }

        // Need a target to converge on for auto.
        if (!this._target) {
            if (this._state === "confirming") {
                this._state = "armed";
                this._holdStartedTs = 0;
                this._broadcastIfChanged("Lost target");
            }
            return;
        }

        const snap = this._mavlink.getStateSnapshot();
        const dist = haversineMeters(
            snap.position.lat, snap.position.lon,
            this._target.lat, this._target.lon,
        );

        const inTolerance = dist <= this._policy.horizontal_tolerance_m;
        const detectionFresh = !this._policy.require_active_detection ||
            (Date.now() - this._lastDetectionTs) < 1500;

        if (this._state === "armed" && inTolerance && detectionFresh) {
            this._state = "confirming";
            this._holdStartedTs = Date.now();
            this._broadcastIfChanged("Auto-drop confirming");
        } else if (this._state === "confirming") {
            if (!inTolerance || !detectionFresh) {
                this._state = "armed";
                this._holdStartedTs = 0;
                this._broadcastIfChanged("Auto-drop reset (drift)");
            } else if ((Date.now() - this._holdStartedTs) / 1000 >= this._policy.hold_time_s) {
                // Promote to DROPPING and fire the sequence (async).
                this._state = "dropping";
                this._broadcastIfChanged("Auto-drop firing");
                this._executeDropSequence(this._target.survivorId || null).catch((err) => {
                    console.error("[Payload] Auto-drop sequence failed:", err.message);
                });
            }
        }

        this._broadcastIfChanged();
    }

    async _executeDropSequence(survivorId) {
        this._state = "dropping";
        this._broadcastIfChanged("Sending DO_SET_SERVO open");

        const snap = this._mavlink.getStateSnapshot();
        this._droppedAt = {
            lat: snap.position.lat,
            lon: snap.position.lon,
            alt: snap.position.relative_alt,
        };

        // Try opening servo (up to 3 attempts)
        let attempts = 0;
        let lastMessage = "";
        while (attempts < 3) {
            attempts++;
            const result = await this._mavlink.sendCommandWithAck(
                MAV_CMD_DO_SET_SERVO,
                [this._config.servoChannel, this._config.pwmOpen, 0, 0, 0, 0, 0],
                1500,
            );
            if (result.success) {
                lastMessage = `Servo open ack on attempt ${attempts}`;
                break;
            }
            lastMessage = result.message;
            if (attempts < 3) await sleep(250);
        }

        if (attempts >= 3 && lastMessage !== `Servo open ack on attempt ${attempts}`) {
            this._state = "fault";
            this._dropAttempts = attempts;
            this._broadcastIfChanged(`Drop failed after ${attempts} attempts: ${lastMessage}`);
            return { success: false, message: `Drop failed: ${lastMessage}` };
        }

        // Hold open for openHoldSecs, then re-close.
        await sleep(this._config.openHoldSecs * 1000);

        const closeResult = await this._mavlink.sendCommandWithAck(
            MAV_CMD_DO_SET_SERVO,
            [this._config.servoChannel, this._config.pwmClosed, 0, 0, 0, 0, 0],
            1500,
        );
        if (!closeResult.success) {
            // The drop already happened; we just couldn't close. Log loud, but
            // don't go to FAULT — payload is gone.
            console.warn("[Payload] Servo close ack failed:", closeResult.message);
        }

        this._state = "dropped";
        this._broadcastIfChanged("Payload released", { survivorId });
        return { success: true, message: `Payload deployed (${attempts} attempt${attempts === 1 ? "" : "s"})` };
    }

    _broadcastIfChanged(message, extra) {
        const snapshot = {
            state: this._state,
            interlocks: this._interlocks,
            droppedAt: this._droppedAt || null,
            survivorId: extra?.survivorId || null,
        };
        // Cheap diff — JSON stringification is fine at 5Hz.
        const key = JSON.stringify(snapshot);
        if (key === this._lastBroadcast && !message) return;
        this._lastBroadcast = key;

        if (this._window && !this._window.isDestroyed()) {
            try {
                this._window.webContents.send("payload-state", { ...snapshot, message });
            } catch { /* window may be gone */ }
        }
    }
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
        Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

module.exports = { PayloadService };
