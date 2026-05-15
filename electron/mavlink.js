/**
 * Sky ResQ — Native MAVLink Handler for Electron Main Process
 *
 * Handles:
 *  1. SerialPort connection to drone radio (COM3 etc.)
 *  2. MAVLink v2 message parsing (lightweight, no external mavlink lib)
 *  3. State aggregation into DroneState matching frontend interfaces
 *  4. 10Hz IPC broadcast to renderer
 *  5. Command sending (arm/disarm/mode)
 */

const { SerialPort } = require("serialport");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

// Load .env from project root
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ═══════════════════════════════════════════════════════════
// MAVLink v2 Constants & Parsing
// ═══════════════════════════════════════════════════════════

const MAVLINK2_STX = 0xfd;
const MAVLINK1_STX = 0xfe;

// Message IDs we care about
const MSG_HEARTBEAT = 0;
const MSG_SYS_STATUS = 1;
const MSG_GPS_RAW_INT = 24;
const MSG_ATTITUDE = 30;
const MSG_GLOBAL_POSITION_INT = 33;
const MSG_VFR_HUD = 74;
const MSG_MISSION_REQUEST_INT = 51;
const MSG_MISSION_REQUEST = 40;
const MSG_MISSION_ACK = 47;
const MSG_COMMAND_ACK = 77;
const MSG_STATUSTEXT = 253;
const MSG_NAMED_VALUE_INT = 252;

// ArduPilot Copter mode mapping
const COPTER_MODES = {
    0: "STABILIZE", 1: "ACRO", 2: "ALT_HOLD", 3: "AUTO", 4: "GUIDED",
    5: "LOITER", 6: "RTL", 7: "CIRCLE", 9: "LAND", 11: "DRIFT",
    13: "SPORT", 14: "FLIP", 15: "AUTOTUNE", 16: "POSHOLD", 17: "BRAKE",
    18: "THROW", 21: "SMART_RTL",
};

// MAVLink command IDs
const MAV_CMD_COMPONENT_ARM_DISARM = 400;
const MAV_CMD_DO_SET_SERVO = 183;
const MAV_CMD_DO_REPOSITION = 192;
const MAV_CMD_DO_MOUNT_CONTROL = 205;
const MAV_CMD_DO_SET_MISSION_CURRENT = 224;
const MAV_CMD_USER_1 = 31010;                   // repurposed: payload toggle to Pi
const MAV_CMD_USER_2 = 31011;                   // repurposed: SAR mission enable
const MAV_COMP_ID_ONBOARD_COMPUTER = 191;       // companion Pi component id
// Pi mavlink_bridge advertises sysid=2 compid=191 so ArduPilot's MAVLink
// router treats it as a separate system and forwards GCS→(2,191) cleanly
// to TELEM2. Using sysid=1 (same as FC) collapsed the route entries.
const PI_TARGET_SYSTEM = 2;

// MAV_RESULT enum (subset)
const MAV_RESULT = {
    0: "ACCEPTED",
    1: "TEMPORARILY_REJECTED",
    2: "DENIED",
    3: "UNSUPPORTED",
    4: "FAILED",
    5: "IN_PROGRESS",
    6: "CANCELLED",
};

function getDefaultSerialPortByPlatform() {
    if (process.platform === "win32") return "COM3";
    if (process.platform === "darwin") return "/dev/cu.usbserial-0001";
    return "/dev/ttyUSB0";
}

function formatSerialOpenError(error, connectionString) {
    const raw = error?.message || "Unknown serial error";
    const lowered = raw.toLowerCase();
    const code = error?.code || "";

    const isPermissionIssue =
        code === "EACCES" ||
        lowered.includes("permission denied") ||
        lowered.includes("access denied");

    if (isPermissionIssue && process.platform === "linux") {
        return `Permission denied for ${connectionString}. Add your user to dialout and re-login: sudo usermod -aG dialout $USER`;
    }

    const isMissingDevice =
        code === "ENOENT" ||
        lowered.includes("no such file") ||
        lowered.includes("cannot open");

    if (isMissingDevice && process.platform !== "win32") {
        return `Serial device not found: ${connectionString}. Check connected devices under /dev/ttyUSB* or /dev/ttyACM*.`;
    }

    return raw;
}

function scoreSerialPath(devicePath = "") {
    const candidate = devicePath.toLowerCase();
    if (!candidate) return 100;

    if (candidate.startsWith("/dev/serial/by-id/")) return 0;
    if (candidate.includes("ttyusb") || candidate.includes("ttyacm") || candidate.includes("cu.usb")) return 1;
    if (candidate.includes("/dev/ttyama") || candidate.includes("/dev/ttyths")) return 2;
    if (candidate.startsWith("com")) return 3;
    if (candidate.includes("/dev/ttys")) return 20;
    return 10;
}

function buildLinuxSerialAliasMap() {
    const aliasMap = new Map();

    if (process.platform !== "linux") {
        return aliasMap;
    }

    try {
        const byIdRoot = "/dev/serial/by-id";
        if (!fs.existsSync(byIdRoot)) {
            return aliasMap;
        }

        const entries = fs.readdirSync(byIdRoot);
        for (const entry of entries) {
            const aliasPath = path.join(byIdRoot, entry);
            try {
                const realPath = fs.realpathSync(aliasPath);
                aliasMap.set(realPath, aliasPath);
            } catch {
                // ignore unresolved symlink
            }
        }
    } catch {
        // ignore alias map failures
    }

    return aliasMap;
}

/**
 * Lightweight MAVLink v1/v2 parser.
 * Buffers serial bytes and emits parsed messages.
 */
class MAVLinkParser {
    constructor() {
        /** @type {Buffer} */
        this._buffer = Buffer.alloc(0);
        /** @type {((msg: {msgId: number, sysId: number, compId: number, payload: Buffer}) => void) | null} */
        this.onMessage = null;
    }

    /**
     * Feed raw serial bytes into the parser.
     * @param {Buffer} data
     */
    parse(data) {
        this._buffer = Buffer.concat([this._buffer, data]);

        while (this._buffer.length > 0) {
            // Find start of frame
            const v2Idx = this._buffer.indexOf(MAVLINK2_STX);
            const v1Idx = this._buffer.indexOf(MAVLINK1_STX);

            let startIdx = -1;
            let isV2 = false;

            if (v2Idx >= 0 && (v1Idx < 0 || v2Idx <= v1Idx)) {
                startIdx = v2Idx;
                isV2 = true;
            } else if (v1Idx >= 0) {
                startIdx = v1Idx;
                isV2 = false;
            }

            if (startIdx < 0) {
                this._buffer = Buffer.alloc(0);
                return;
            }

            // Discard bytes before start
            if (startIdx > 0) {
                this._buffer = this._buffer.subarray(startIdx);
            }

            if (isV2) {
                if (!this._parseV2()) return;
            } else {
                if (!this._parseV1()) return;
            }
        }
    }

    /** @returns {boolean} true if a message was consumed, false if more bytes needed */
    _parseV2() {
        // v2 header: STX(1) + len(1) + incompat(1) + compat(1) + seq(1) + sysid(1) + compid(1) + msgid(3) = 10
        // + payload(len) + checksum(2) + optional signature(13)
        if (this._buffer.length < 10) return false;

        const payloadLen = this._buffer[1];
        const incompatFlags = this._buffer[2];
        const hasSigning = (incompatFlags & 0x01) !== 0;
        const frameLen = 10 + payloadLen + 2 + (hasSigning ? 13 : 0);

        if (this._buffer.length < frameLen) return false;

        const sysId = this._buffer[5];
        const compId = this._buffer[6];
        const msgId = this._buffer[7] | (this._buffer[8] << 8) | (this._buffer[9] << 16);
        const payload = this._buffer.subarray(10, 10 + payloadLen);

        if (this.onMessage) {
            this.onMessage({ msgId, sysId, compId, payload: Buffer.from(payload) });
        }

        this._buffer = this._buffer.subarray(frameLen);
        return true;
    }

    /** @returns {boolean} */
    _parseV1() {
        // v1 header: STX(1) + len(1) + seq(1) + sysid(1) + compid(1) + msgid(1) = 6
        // + payload(len) + checksum(2)
        if (this._buffer.length < 6) return false;

        const payloadLen = this._buffer[1];
        const frameLen = 6 + payloadLen + 2;

        if (this._buffer.length < frameLen) return false;

        const sysId = this._buffer[3];
        const compId = this._buffer[4];
        const msgId = this._buffer[5];
        const payload = this._buffer.subarray(6, 6 + payloadLen);

        if (this.onMessage) {
            this.onMessage({ msgId, sysId, compId, payload: Buffer.from(payload) });
        }

        this._buffer = this._buffer.subarray(frameLen);
        return true;
    }
}

// ═══════════════════════════════════════════════════════════
// Message Decoders (little-endian binary → JS objects)
// ═══════════════════════════════════════════════════════════
//
// MAVLink v2 wire format: fields are ordered by sizeof(type),
// largest first. v2 also truncates trailing zero bytes in the
// payload, so we pad with zeros to the full message size.

/**
 * Pad a MAVLink payload buffer to at least `minLen` bytes.
 * MAVLink v2 truncates trailing zero bytes — this restores them.
 */
function padPayload(buf, minLen) {
    if (buf.length >= minLen) return buf;
    const padded = Buffer.alloc(minLen, 0);
    buf.copy(padded);
    return padded;
}

function decodeHeartbeat(buf) {
    // Wire: custom_mode(u32,4) | type(u8,1) | autopilot(u8,1) | base_mode(u8,1) | system_status(u8,1) | mavlink_version(u8,1)
    // Total: 9 bytes
    const p = padPayload(buf, 9);
    const customMode = p.readUInt32LE(0);
    const type = p.readUInt8(4);
    const autopilot = p.readUInt8(5);
    const baseMode = p.readUInt8(6);
    const systemStatus = p.readUInt8(7);

    return {
        armed: (baseMode & 128) !== 0,
        flight_mode: COPTER_MODES[customMode] || "UNKNOWN",
        system_status: systemStatus,
        mav_type: type,
        autopilot,
    };
}

function decodeAttitude(buf) {
    // Wire: time_boot_ms(u32,4) | roll(f32,4) | pitch(f32,4) | yaw(f32,4) | rollspeed(f32,4) | pitchspeed(f32,4) | yawspeed(f32,4)
    // Total: 28 bytes — all 4-byte types, no reordering needed
    if (buf.length < 16) return null; // need at least time+roll+pitch+yaw
    const p = padPayload(buf, 28);
    const toDeg = (rad) => Math.round(rad * (180 / Math.PI) * 100) / 100;
    return {
        roll: toDeg(p.readFloatLE(4)),
        pitch: toDeg(p.readFloatLE(8)),
        yaw: toDeg(p.readFloatLE(12)),
        rollspeed: toDeg(p.readFloatLE(16)),
        pitchspeed: toDeg(p.readFloatLE(20)),
        yawspeed: toDeg(p.readFloatLE(24)),
    };
}

function decodeGlobalPosition(buf) {
    // Wire: time_boot_ms(u32,4) | lat(i32,4) | lon(i32,4) | alt(i32,4) | relative_alt(i32,4) | vx(i16,2) | vy(i16,2) | vz(i16,2) | hdg(u16,2)
    // Total: 28 bytes — 4-byte fields first, then 2-byte
    if (buf.length < 12) return null; // need at least time+lat+lon
    const p = padPayload(buf, 28);
    const hdg = p.readUInt16LE(26);
    return {
        lat: p.readInt32LE(4) / 1e7,
        lon: p.readInt32LE(8) / 1e7,
        alt: p.readInt32LE(12) / 1000.0,
        relative_alt: p.readInt32LE(16) / 1000.0,
        vx: p.readInt16LE(20) / 100.0,
        vy: p.readInt16LE(22) / 100.0,
        vz: p.readInt16LE(24) / 100.0,
        heading: hdg !== 65535 ? hdg : 0,
    };
}

function decodeVfrHud(buf) {
    // Wire order (sorted by sizeof): float fields first, then int16/uint16
    //   airspeed(f32,4) @ 0 | groundspeed(f32,4) @ 4 | alt(f32,4) @ 8 | climb(f32,4) @ 12 | heading(i16,2) @ 16 | throttle(u16,2) @ 18
    // Total: 20 bytes
    if (buf.length < 16) return null; // need at least the 4 floats
    const p = padPayload(buf, 20);
    return {
        airspeed: Math.round(p.readFloatLE(0) * 100) / 100,
        groundspeed: Math.round(p.readFloatLE(4) * 100) / 100,
        alt: Math.round(p.readFloatLE(8) * 100) / 100,
        climb: Math.round(p.readFloatLE(12) * 100) / 100,
        heading: p.readInt16LE(16),
        throttle: p.readUInt16LE(18),
    };
}

function decodeSysStatus(buf) {
    // Wire order (sorted by sizeof): uint32 fields, then uint16, then int8
    //   sensors_present(u32,4) @ 0 | sensors_enabled(u32,4) @ 4 | sensors_health(u32,4) @ 8
    //   load(u16,2) @ 12 | voltage_battery(u16,2) @ 14 | current_battery(i16,2) @ 16
    //   drop_rate_comm(u16,2) @ 18 | errors_comm(u16,2) @ 20
    //   errors_count1(u16,2) @ 22 | errors_count2(u16,2) @ 24 | errors_count3(u16,2) @ 26 | errors_count4(u16,2) @ 28
    //   battery_remaining(i8,1) @ 30
    // Total: 31 bytes
    if (buf.length < 17) return null; // need at least through current_battery
    const p = padPayload(buf, 31);
    const voltage = p.readUInt16LE(14);
    const current = p.readInt16LE(16);
    const remaining = p.readInt8(30);
    return {
        voltage: voltage !== 65535 ? voltage / 1000.0 : 0.0,
        current: current !== -1 ? current / 100.0 : 0.0,
        remaining,
    };
}

function decodeGpsRaw(buf) {
    // Wire order (sorted by sizeof): uint64, then int32, then uint16, then uint8
    //   time_usec(u64,8) @ 0 | lat(i32,4) @ 8 | lon(i32,4) @ 12 | alt(i32,4) @ 16
    //   eph(u16,2) @ 20 | epv(u16,2) @ 22 | vel(u16,2) @ 24 | cog(u16,2) @ 26
    //   fix_type(u8,1) @ 28 | satellites_visible(u8,1) @ 29
    // Total: 30 bytes
    if (buf.length < 10) return null; // need at least time_usec + part of lat
    const p = padPayload(buf, 30);
    const fixType = p.readUInt8(28);
    const eph = p.readUInt16LE(20);
    const sats = p.readUInt8(29);
    return {
        fix_type: fixType,
        satellites_visible: sats,
        hdop: eph !== 65535 ? eph / 100.0 : 0.0,
    };
}

function decodeMissionRequestInt(buf) {
    // Wire: seq(u16,2) @ 0 | target_system(u8,1) @ 2 | target_component(u8,1) @ 3 | mission_type(u8,1) @ 4
    if (buf.length < 4) return null;
    const p = padPayload(buf, 5);
    return { seq: p.readUInt16LE(0), missionType: buf.length >= 5 ? p.readUInt8(4) : 0 };
}

function decodeMissionAck(buf) {
    // Wire: target_system(u8,1) @ 0 | target_component(u8,1) @ 1 | type(u8,1) @ 2 | mission_type(u8,1) @ 3
    if (buf.length < 3) return null;
    const p = padPayload(buf, 4);
    return { type: p.readUInt8(2), missionType: buf.length >= 4 ? p.readUInt8(3) : 0 };
}

function decodeCommandAck(buf) {
    // Wire (v2, sorted by size):
    //   command(u16, 2) @ 0 | result(u8, 1) @ 2 | progress(u8, 1) @ 3 (v2 ext)
    //   | result_param2(i32, 4) @ 4 | target_system(u8, 1) @ 8 | target_component(u8, 1) @ 9
    if (buf.length < 3) return null;
    const p = padPayload(buf, 10);
    return {
        command: p.readUInt16LE(0),
        result: p.readUInt8(2),
        progress: buf.length >= 4 ? p.readUInt8(3) : 255,
    };
}

function decodeNamedValueInt(buf) {
    // Wire: time_boot_ms(u32,4) @ 0 | value(i32,4) @ 4 | name(char[10]) @ 8
    if (buf.length < 12) return null;
    const value = buf.readInt32LE(4);
    const name = buf.subarray(8, Math.min(18, buf.length))
        .toString("ascii").replace(/\0/g, "").trim();
    return { name, value };
}

function decodeStatusText(buf) {
    // Wire: severity(u8,1) @ 0 | text(char[50]) @ 1
    // Total: 51 bytes (but usually truncated)
    if (buf.length < 2) return "";
    const text = buf.subarray(1).toString("ascii").replace(/\0/g, "").trim();
    return text;
}

// ═══════════════════════════════════════════════════════════
// MAVLink v2 Message Builder (for sending commands)
// ═══════════════════════════════════════════════════════════

/**
 * Build a MAVLink v2 COMMAND_LONG (msgId=76) message.
 */
function buildCommandLong(targetSys, targetComp, command, params, seq = 0) {
    // Wire payload: param1-7(f32 x7) | command(u16) | target_system(u8) | target_component(u8) | confirmation(u8)
    // Total payload: 33 bytes
    const payloadLen = 33;
    const buf = Buffer.alloc(10 + payloadLen + 2);

    buf[0] = MAVLINK2_STX;
    buf[1] = payloadLen;
    buf[2] = 0; buf[3] = 0;
    buf[4] = seq & 0xff;
    buf[5] = 255; buf[6] = 0;
    buf[7] = 76; buf[8] = 0; buf[9] = 0;

    let offset = 10;
    buf.writeFloatLE(params[0] || 0, offset); offset += 4;
    buf.writeFloatLE(params[1] || 0, offset); offset += 4;
    buf.writeFloatLE(params[2] || 0, offset); offset += 4;
    buf.writeFloatLE(params[3] || 0, offset); offset += 4;
    buf.writeFloatLE(params[4] || 0, offset); offset += 4;
    buf.writeFloatLE(params[5] || 0, offset); offset += 4;
    buf.writeFloatLE(params[6] || 0, offset); offset += 4;
    buf.writeUInt16LE(command, offset); offset += 2;
    buf.writeUInt8(targetSys, offset); offset += 1;
    buf.writeUInt8(targetComp, offset); offset += 1;
    buf.writeUInt8(0, offset); offset += 1;

    const crc = mavlinkCrc(buf, payloadLen, 152);
    buf.writeUInt16LE(crc, 10 + payloadLen);

    return buf;
}

/**
 * Build a SET_MODE message (msgId=11).
 * Wire payload: custom_mode(u32) | target_system(u8) | base_mode(u8)
 */
function buildSetMode(targetSys, customMode) {
    const payloadLen = 6;
    const buf = Buffer.alloc(10 + payloadLen + 2);

    buf[0] = MAVLINK2_STX;
    buf[1] = payloadLen;
    buf[2] = 0; buf[3] = 0; buf[4] = 0;
    buf[5] = 255; buf[6] = 0;
    buf[7] = 11; buf[8] = 0; buf[9] = 0;

    let offset = 10;
    buf.writeUInt32LE(customMode, offset); offset += 4;
    buf.writeUInt8(targetSys, offset); offset += 1;
    buf.writeUInt8(1 | 128, offset);

    const crc = mavlinkCrc(buf, payloadLen, 89);
    buf.writeUInt16LE(crc, 10 + payloadLen);

    return buf;
}

/**
 * Build a REQUEST_DATA_STREAM message (msgId=66).
 * Tells the autopilot to start sending telemetry streams.
 * Wire payload: req_message_rate(u16,2) @ 0 | target_system(u8,1) @ 2 | target_component(u8,1) @ 3 | req_stream_id(u8,1) @ 4 | start_stop(u8,1) @ 5
 * CRC_EXTRA: 148
 */
function buildRequestDataStream(targetSys, targetComp, streamId, rate, startStop = 1) {
    const payloadLen = 6;
    const buf = Buffer.alloc(10 + payloadLen + 2);

    buf[0] = MAVLINK2_STX;
    buf[1] = payloadLen;
    buf[2] = 0; buf[3] = 0; buf[4] = 0;
    buf[5] = 255; buf[6] = 0;
    buf[7] = 66; buf[8] = 0; buf[9] = 0; // msgId = 66

    let offset = 10;
    buf.writeUInt16LE(rate, offset); offset += 2;           // req_message_rate
    buf.writeUInt8(targetSys, offset); offset += 1;         // target_system
    buf.writeUInt8(targetComp, offset); offset += 1;        // target_component
    buf.writeUInt8(streamId, offset); offset += 1;          // req_stream_id
    buf.writeUInt8(startStop, offset);                      // start_stop (1 = start)

    const crc = mavlinkCrc(buf, payloadLen, 148); // 148 = REQUEST_DATA_STREAM CRC_EXTRA
    buf.writeUInt16LE(crc, 10 + payloadLen);

    return buf;
}

/**
 * Build a GCS HEARTBEAT message (msgId=0).
 * Sent at 1Hz to prevent drone failsafe RTL on heartbeat timeout.
 * Wire payload: custom_mode(u32,4) @ 0 | type(u8,1) @ 4 | autopilot(u8,1) @ 5
 *   base_mode(u8,1) @ 6 | system_status(u8,1) @ 7 | mavlink_version(u8,1) @ 8
 * CRC_EXTRA: 50
 */
function buildGcsHeartbeat(seq = 0) {
    const payloadLen = 9;
    const buf = Buffer.alloc(10 + payloadLen + 2);

    buf[0] = MAVLINK2_STX;
    buf[1] = payloadLen;
    buf[2] = 0; buf[3] = 0;
    buf[4] = seq & 0xff;
    buf[5] = 255; buf[6] = 0;         // sysId=255 (GCS), compId=0
    buf[7] = 0; buf[8] = 0; buf[9] = 0; // msgId = 0 (HEARTBEAT)

    let offset = 10;
    buf.writeUInt32LE(0, offset); offset += 4;  // custom_mode = 0
    buf.writeUInt8(6, offset); offset += 1;      // type = MAV_TYPE_GCS (6)
    buf.writeUInt8(8, offset); offset += 1;      // autopilot = MAV_AUTOPILOT_INVALID (8)
    buf.writeUInt8(0, offset); offset += 1;      // base_mode = 0
    buf.writeUInt8(4, offset); offset += 1;      // system_status = MAV_STATE_ACTIVE (4)
    buf.writeUInt8(3, offset);                   // mavlink_version = 3 (v2)

    const crc = mavlinkCrc(buf, payloadLen, 50); // 50 = HEARTBEAT CRC_EXTRA
    buf.writeUInt16LE(crc, 10 + payloadLen);

    return buf;
}

/**
 * Build SET_POSITION_TARGET_GLOBAL_INT (msgId 86), CRC_EXTRA 5.
 * Wire payload (sorted by sizeof, 51 bytes):
 *   time_boot_ms(u32,4) @ 0 | lat_int(i32,4) @ 4 | lon_int(i32,4) @ 8
 *   | alt(f32,4) @ 12 | vx(f32,4) @ 16 | vy(f32,4) @ 20 | vz(f32,4) @ 24
 *   | afx(f32,4) @ 28 | afy(f32,4) @ 32 | afz(f32,4) @ 36
 *   | yaw(f32,4) @ 40 | yaw_rate(f32,4) @ 44
 *   | type_mask(u16,2) @ 48 | target_system(u8,1) @ 50 | target_component(u8,1) @ 51
 *   | coordinate_frame(u8,1) @ 52
 *   Total: 53. We pad to that size.
 */
function buildSetPositionTargetGlobalInt(targetSys, targetComp, latDeg, lonDeg, altM, seq = 0) {
    const payloadLen = 53;
    const buf = Buffer.alloc(10 + payloadLen + 2);
    buf[0] = MAVLINK2_STX; buf[1] = payloadLen;
    buf[2] = 0; buf[3] = 0; buf[4] = seq & 0xff;
    buf[5] = 255; buf[6] = 0;
    buf[7] = 86; buf[8] = 0; buf[9] = 0; // msgId = 86

    let o = 10;
    buf.writeUInt32LE(0, o); o += 4;                            // time_boot_ms
    buf.writeInt32LE(Math.round(latDeg * 1e7), o); o += 4;      // lat_int
    buf.writeInt32LE(Math.round(lonDeg * 1e7), o); o += 4;      // lon_int
    buf.writeFloatLE(altM, o); o += 4;                          // alt (relative)
    for (let i = 0; i < 8; i++) { buf.writeFloatLE(0, o); o += 4; } // vx,vy,vz,afx,afy,afz,yaw,yaw_rate
    // type_mask: ignore vel(1<<3..5)+accel(1<<6..8)+yaw(1<<10..11)+force(1<<9). Keep position.
    // 0b0000_1111_1111_1000 = 0x0FF8
    buf.writeUInt16LE(0x0FF8, o); o += 2;
    buf.writeUInt8(targetSys, o); o += 1;
    buf.writeUInt8(targetComp, o); o += 1;
    buf.writeUInt8(6, o); // coordinate_frame = MAV_FRAME_GLOBAL_RELATIVE_ALT_INT (6)

    const crc = mavlinkCrc(buf, payloadLen, 5);
    buf.writeUInt16LE(crc, 10 + payloadLen);
    return buf;
}

/**
 * Build MISSION_COUNT (msgId 44), CRC_EXTRA 221.
 * Wire payload (5 bytes): count(u16) | target_system(u8) | target_component(u8) | mission_type(u8)
 */
function buildMissionCount(targetSys, targetComp, count, seq = 0) {
    const payloadLen = 5;
    const buf = Buffer.alloc(10 + payloadLen + 2);
    buf[0] = MAVLINK2_STX; buf[1] = payloadLen;
    buf[2] = 0; buf[3] = 0; buf[4] = seq & 0xff;
    buf[5] = 255; buf[6] = 0;
    buf[7] = 44; buf[8] = 0; buf[9] = 0;

    let o = 10;
    buf.writeUInt16LE(count, o); o += 2;
    buf.writeUInt8(targetSys, o); o += 1;
    buf.writeUInt8(targetComp, o); o += 1;
    buf.writeUInt8(0, o);   // mission_type = MISSION

    const crc = mavlinkCrc(buf, payloadLen, 221);
    buf.writeUInt16LE(crc, 10 + payloadLen);
    return buf;
}

/**
 * Build MISSION_ITEM_INT (msgId 73), CRC_EXTRA 38.
 * Wire payload (sorted, 38 bytes):
 *   param1(f32,4) @ 0 | param2(f32,4) @ 4 | param3(f32,4) @ 8 | param4(f32,4) @ 12
 *   | x(i32,4) @ 16 | y(i32,4) @ 20 | z(f32,4) @ 24
 *   | seq(u16,2) @ 28 | command(u16,2) @ 30
 *   | target_system(u8,1) @ 32 | target_component(u8,1) @ 33
 *   | frame(u8,1) @ 34 | current(u8,1) @ 35 | autocontinue(u8,1) @ 36 | mission_type(u8,1) @ 37
 */
function buildMissionItemInt(targetSys, targetComp, item, seq = 0) {
    const payloadLen = 38;
    const buf = Buffer.alloc(10 + payloadLen + 2);
    buf[0] = MAVLINK2_STX; buf[1] = payloadLen;
    buf[2] = 0; buf[3] = 0; buf[4] = seq & 0xff;
    buf[5] = 255; buf[6] = 0;
    buf[7] = 73; buf[8] = 0; buf[9] = 0;

    let o = 10;
    buf.writeFloatLE(item.param1 || 0, o); o += 4;
    buf.writeFloatLE(item.param2 || 0, o); o += 4;
    buf.writeFloatLE(item.param3 || 0, o); o += 4;
    buf.writeFloatLE(item.param4 || 0, o); o += 4;
    buf.writeInt32LE(Math.round((item.lat || 0) * 1e7), o); o += 4;
    buf.writeInt32LE(Math.round((item.lon || 0) * 1e7), o); o += 4;
    buf.writeFloatLE(item.alt || 0, o); o += 4;
    buf.writeUInt16LE(item.seq || 0, o); o += 2;
    buf.writeUInt16LE(item.command || 16, o); o += 2;  // 16 = NAV_WAYPOINT
    buf.writeUInt8(targetSys, o); o += 1;
    buf.writeUInt8(targetComp, o); o += 1;
    buf.writeUInt8(item.frame ?? 3, o); o += 1;        // 3 = MAV_FRAME_GLOBAL_RELATIVE_ALT
    buf.writeUInt8(item.current ? 1 : 0, o); o += 1;
    buf.writeUInt8(item.autocontinue ?? 1, o); o += 1;
    buf.writeUInt8(0, o);                              // mission_type = MISSION

    const crc = mavlinkCrc(buf, payloadLen, 38);
    buf.writeUInt16LE(crc, 10 + payloadLen);
    return buf;
}

/**
 * MAVLink x25 CRC with message CRC_EXTRA seed.
 */
function mavlinkCrc(buf, payloadLen, crcExtra) {
    let crc = 0xffff;
    for (let i = 1; i < 10 + payloadLen; i++) {
        let tmp = buf[i] ^ (crc & 0xff);
        tmp ^= (tmp << 4) & 0xff;
        crc = (crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4);
        crc &= 0xffff;
    }
    let tmp = crcExtra ^ (crc & 0xff);
    tmp ^= (tmp << 4) & 0xff;
    crc = (crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4);
    crc &= 0xffff;
    return crc;
}

// ═══════════════════════════════════════════════════════════
// MAVLink Handler — Orchestrates serial + parsing + IPC
// ═══════════════════════════════════════════════════════════

const MODE_NAME_TO_ID = {};
for (const [id, name] of Object.entries(COPTER_MODES)) {
    MODE_NAME_TO_ID[name] = parseInt(id);
}

class MAVLinkHandler {
    /**
     * @param {Electron.BrowserWindow} mainWindow
     */
    constructor(mainWindow) {
        this._window = mainWindow;
        this._port = null;
        this._parser = new MAVLinkParser();
        this._targetSystem = 1;
        this._targetComponent = 1;
        this._seq = 0;
        this._broadcastInterval = null;
        this._heartbeatInterval = null; // 1Hz GCS heartbeat to drone
        this._msgCounts = {};  // debug: track message counts
        this._streamsRequested = false; // flag: have we requested telemetry streams?
        /** @type {Set<(ack: {command: number, result: number, progress: number}) => void>} */
        this._ackListeners = new Set();
        /** @type {Set<(msg: {msgId: number, sysId: number, compId: number, payload: Buffer}) => void>} */
        this._messageListeners = new Set();
        this._payloadService = null;
        this._linkRouter = null;
        /** Per-source parser for UDP-injected MAVLink bytes (so partial frames
         * from the UDP socket don't corrupt the serial parser buffer). */
        this._udpParser = new MAVLinkParser();
        this._udpParser.onMessage = (msg) => this._handleMessage(msg, "udp");

        // Drone state (matches frontend DroneState interface exactly)
        this._state = {
            connected: false,
            last_heartbeat: 0,
            heartbeat: { armed: false, flight_mode: "UNKNOWN", system_status: 0, mav_type: 0, autopilot: 0 },
            attitude: { roll: 0, pitch: 0, yaw: 0, rollspeed: 0, pitchspeed: 0, yawspeed: 0 },
            position: { lat: 0, lon: 0, alt: 0, relative_alt: 0, vx: 0, vy: 0, vz: 0, heading: 0 },
            vfr_hud: { airspeed: 0, groundspeed: 0, heading: 0, throttle: 0, alt: 0, climb: 0 },
            battery: { voltage: 0, current: 0, remaining: -1 },
            gps: { fix_type: 0, satellites_visible: 0, hdop: 0 },
            status_text: "",
            payloadOpen: false,
            timestamp: 0,
        };

        this._parser.onMessage = (msg) => this._handleMessage(msg, "serial");
    }

    /** Ingest MAVLink bytes received via an alternate transport (e.g. UDP/4G). */
    ingestExternalBytes(buf, source) {
        if (source === "udp") this._udpParser.parse(buf);
    }

    /** Register a generic message listener (used by mission/gimbal helpers). */
    onMessage(listener) {
        this._messageListeners.add(listener);
        return () => this._messageListeners.delete(listener);
    }

    /** Wire the link router so we can tell it when UDP heartbeats arrive. */
    setLinkRouter(router) {
        this._linkRouter = router;
    }

    /**
     * Connect to a serial/MAVLink source.
     * @param {string} connectionString - e.g. 'COM3'
     * @param {number} baudRate
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async connect(connectionString, baudRate = 57600) {
        if (this._port && this._port.isOpen) {
            return { success: false, message: "Already connected" };
        }

        return new Promise((resolve) => {
            try {
                console.log(`[MAVLink] Connecting: ${connectionString} @ ${baudRate}`);

                this._port = new SerialPort({
                    path: connectionString,
                    baudRate: baudRate,
                    autoOpen: false,
                });

                this._port.on("data", (data) => {
                    try {
                        this._parser.parse(data);
                    } catch (e) {
                        console.error("[MAVLink] Parse error:", e.message);
                    }
                });

                this._port.on("error", (err) => {
                    console.error("[MAVLink] Serial error:", err.message);
                    this._state.connected = false;
                    this._sendConnectionStatus(false, err.message);
                });

                this._port.on("close", () => {
                    console.log("[MAVLink] Port closed");
                    this._state.connected = false;
                    this._stopBroadcast();
                    this._sendConnectionStatus(false, "Port closed");
                });

                this._port.open((err) => {
                    if (err) {
                        const userFriendlyError = formatSerialOpenError(err, connectionString);
                        console.error("[MAVLink] Failed to open port:", userFriendlyError);
                        resolve({ success: false, message: userFriendlyError });
                        return;
                    }

                    console.log("[MAVLink] Port opened, waiting for heartbeat...");
                    this._startBroadcast();

                    // Wait for first heartbeat with timeout
                    const timeout = setTimeout(() => {
                        if (!this._state.connected) {
                            console.warn("[MAVLink] No heartbeat received in 10s");
                            resolve({ success: true, message: `Connected to ${connectionString} (awaiting heartbeat)` });
                        }
                    }, 10000);

                    // Check for heartbeat periodically
                    const hbCheck = setInterval(() => {
                        if (this._state.last_heartbeat > 0) {
                            clearTimeout(timeout);
                            clearInterval(hbCheck);
                            this._state.connected = true;
                            this._sendConnectionStatus(true, `Connected to ${connectionString}`);
                            console.log(`[MAVLink] Heartbeat received!`);
                            resolve({ success: true, message: `Connected to ${connectionString}` });
                        }
                    }, 200);
                });
            } catch (err) {
                console.error("[MAVLink] Connection error:", err);
                resolve({ success: false, message: err.message });
            }
        });
    }

    /**
     * Disconnect from the current serial port.
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async disconnect() {
        this._stopBroadcast();

        if (this._port && this._port.isOpen) {
            return new Promise((resolve) => {
                this._port.close((err) => {
                    this._port = null;
                    this._state.connected = false;
                    this._state.last_heartbeat = 0;
                    this._streamsRequested = false;
                    this._stopGcsHeartbeat();
                    this._sendConnectionStatus(false, "Disconnected");
                    resolve({ success: true, message: "Disconnected" });
                });
            });
        }

        this._state.connected = false;
        return { success: true, message: "Already disconnected" };
    }

    /**
     * Arm the drone.
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async arm() {
        if (!this._port || !this._port.isOpen) {
            return { success: false, message: "Not connected" };
        }
        const buf = buildCommandLong(
            this._targetSystem, this._targetComponent,
            MAV_CMD_COMPONENT_ARM_DISARM,
            [1, 0, 0, 0, 0, 0, 0]
        );
        this._port.write(buf);
        return { success: true, message: "Arm command sent" };
    }

    /**
     * Disarm the drone.
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async disarm() {
        if (!this._port || !this._port.isOpen) {
            return { success: false, message: "Not connected" };
        }
        const buf = buildCommandLong(
            this._targetSystem, this._targetComponent,
            MAV_CMD_COMPONENT_ARM_DISARM,
            [0, 0, 0, 0, 0, 0, 0]
        );
        this._port.write(buf);
        return { success: true, message: "Disarm command sent" };
    }

    /**
     * Set flight mode by name.
     * @param {string} modeName
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async setMode(modeName) {
        if (!this._port || !this._port.isOpen) {
            return { success: false, message: "Not connected" };
        }

        const modeId = MODE_NAME_TO_ID[modeName.toUpperCase()];
        if (modeId === undefined) {
            return { success: false, message: `Unknown mode: ${modeName}` };
        }

        const buf = buildSetMode(this._targetSystem, modeId);
        this._port.write(buf);
        return { success: true, message: `Set mode to ${modeName}` };
    }

    /** Return the drone's current position (lat, lon, relative_alt). */
    getCurrentPosition() {
        return {
            lat: this._state.position.lat,
            lon: this._state.position.lon,
            alt: this._state.position.relative_alt,
        };
    }

    /** Return a frozen snapshot of the current drone state. */
    getStateSnapshot() {
        return {
            connected: this._state.connected,
            armed: this._state.heartbeat.armed,
            mode: this._state.heartbeat.flight_mode,
            position: { ...this._state.position },
            battery: { ...this._state.battery },
            gps: { ...this._state.gps },
            lastHeartbeat: this._state.last_heartbeat,
        };
    }

    /** Register a payload service so commands and IPC can be routed to it. */
    setPayloadService(service) {
        this._payloadService = service;
    }

    /** Get current payload state for IPC queries. */
    getPayloadState() {
        return this._payloadService ? this._payloadService.snapshot() : null;
    }

    /**
     * Deploy the rescue payload after interlock validation.
     * Delegates to the payload service.
     */
    async deployPayload(options = {}) {
        if (!this._payloadService) return { success: false, message: "Payload service unavailable" };
        return this._payloadService.requestManualDrop(options);
    }

    /** Update the auto-drop policy. */
    async setAutoDropPolicy(policy) {
        if (!this._payloadService) return { success: false, message: "Payload service unavailable" };
        return this._payloadService.setPolicy(policy);
    }

    /**
     * Send a payload toggle command to the Pi companion via MAV_CMD_USER_1.
     * ArduPilot routes COMMAND_LONG with target_component=191 to TELEM2,
     * where mavlink_bridge picks it up and drives the GPIO 16 servo.
     *
     * `action` is one of "open" | "close" | "toggle".
     * param1 encoding: 1.0 open, 0.0 close, 2.0 toggle.
     *
     * Returns when the Pi responds with COMMAND_ACK or after timeoutMs.
     */
    async sendPayloadCommand(action, timeoutMs = 1500) {
        const param1 = action === "open" ? 1.0
            : action === "close" ? 0.0
            : action === "toggle" ? 2.0
            : null;
        if (param1 === null) {
            return { success: false, message: `Unknown action: ${action}` };
        }
        const buf = buildCommandLong(
            PI_TARGET_SYSTEM,
            MAV_COMP_ID_ONBOARD_COMPUTER,
            MAV_CMD_USER_1,
            [param1, 0, 0, 0, 0, 0, 0],
        );

        // Send via UDP (Tailscale) too — ArduPilot does not reliably forward
        // COMMAND_LONG with target_component=191 between TELEM1 (SiK) and
        // TELEM2 (companion Pi), so the UDP path is what actually delivers
        // the command to the Pi today. SiK still tries as a backup.
        let udpOk = false;
        if (this._linkRouter && typeof this._linkRouter.sendCommandUdp === "function") {
            udpOk = this._linkRouter.sendCommandUdp(buf);
        }

        if ((!this._port || !this._port.isOpen) && !udpOk) {
            return { success: false, message: "Not connected" };
        }
        return new Promise((resolve) => {
            let settled = false;
            const listener = (ack) => {
                if (ack.command !== MAV_CMD_USER_1) return;
                if (settled) return;
                settled = true;
                this._ackListeners.delete(listener);
                clearTimeout(timer);
                const name = MAV_RESULT[ack.result] || `RESULT_${ack.result}`;
                resolve({
                    success: ack.result === 0,
                    result: ack.result,
                    message: `payload ${action}: ${name}`,
                });
            };
            this._ackListeners.add(listener);
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                this._ackListeners.delete(listener);
                // No ACK is not necessarily a failure — the Pi may have driven
                // the servo but the ACK got lost on the return link. Report
                // optimistically and let the UI reconcile via NAMED_VALUE_INT.
                resolve({ success: true, result: -1, message: `payload ${action} sent (no ACK)` });
            }, timeoutMs);
            try {
                if (this._port && this._port.isOpen) this._port.write(buf);
            } catch (err) {
                if (!udpOk) {
                    settled = true;
                    this._ackListeners.delete(listener);
                    clearTimeout(timer);
                    resolve({ success: false, result: -1, message: err.message });
                }
            }
        });
    }

    /** Current known payload state (true=open). */
    getPayloadOpen() {
        return !!this._state.payloadOpen;
    }

    /**
     * Engage/disengage the Pi-side SAR mission orchestrator.
     * Sends MAV_CMD_USER_2 with param1=1 (enable) or 0 (disable). Same SiK +
     * UDP-fallback dual-path as the payload toggle.
     */
    async sendMissionEnable(enable) {
        const param1 = enable ? 1.0 : 0.0;
        const buf = buildCommandLong(
            PI_TARGET_SYSTEM,
            MAV_COMP_ID_ONBOARD_COMPUTER,
            MAV_CMD_USER_2,
            [param1, 0, 0, 0, 0, 0, 0],
        );
        let udpOk = false;
        if (this._linkRouter && typeof this._linkRouter.sendCommandUdp === "function") {
            udpOk = this._linkRouter.sendCommandUdp(buf);
        }
        if ((!this._port || !this._port.isOpen) && !udpOk) {
            return { success: false, message: "Not connected" };
        }
        try {
            if (this._port && this._port.isOpen) this._port.write(buf);
        } catch (err) {
            if (!udpOk) return { success: false, message: err.message };
        }
        return { success: true, message: `SAR mission ${enable ? "enabled" : "disabled"}` };
    }

    /** Reset mission flags (one-shot payload, mission state). */
    async resetMission() {
        if (this._payloadService) this._payloadService.resetMissionFlags();
        console.log("[MAVLink] Mission reset");
        return { success: true, message: "Mission reset" };
    }

    /**
     * Send a MAV_CMD command and wait for COMMAND_ACK (with timeout).
     * @param {number} command - MAV_CMD id
     * @param {number[]} params - params 1..7
     * @param {number} timeoutMs
     * @returns {Promise<{success: boolean, result: number, message: string}>}
     */
    sendCommandWithAck(command, params, timeoutMs = 1500) {
        if (!this._port || !this._port.isOpen) {
            return Promise.resolve({ success: false, result: -1, message: "Not connected" });
        }
        const buf = buildCommandLong(this._targetSystem, this._targetComponent, command, params);
        return new Promise((resolve) => {
            let settled = false;
            const listener = (ack) => {
                if (ack.command !== command) return;
                if (settled) return;
                settled = true;
                this._ackListeners.delete(listener);
                clearTimeout(timer);
                const name = MAV_RESULT[ack.result] || `RESULT_${ack.result}`;
                resolve({
                    success: ack.result === 0,
                    result: ack.result,
                    message: `COMMAND_ACK: ${name}`,
                });
            };
            this._ackListeners.add(listener);
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                this._ackListeners.delete(listener);
                resolve({ success: false, result: -1, message: "ACK timeout" });
            }, timeoutMs);
            try {
                this._port.write(buf);
            } catch (err) {
                settled = true;
                this._ackListeners.delete(listener);
                clearTimeout(timer);
                resolve({ success: false, result: -1, message: err.message });
            }
        });
    }

    /**
     * Fly the drone to a (lat, lon, alt-AGL) point.
     *
     * Safety: refuses unless the FC is already in GUIDED. The operator
     * (or "Engage GUIDED" button) must transition into GUIDED first, so
     * the dashboard never overrides the pilot's stick/TX-switch authority.
     * If the pilot flips out of GUIDED mid-mission, ArduPilot reverts
     * control to them and subsequent flyTo calls will be refused here too.
     */
    async flyTo(lat, lon, alt) {
        if (!this._port || !this._port.isOpen) {
            return { success: false, message: "Not connected" };
        }
        if (Number.isNaN(lat) || Number.isNaN(lon)) {
            return { success: false, message: "Invalid coordinates" };
        }
        const currentMode = this._state?.heartbeat?.flight_mode || "UNKNOWN";
        if (currentMode !== "GUIDED") {
            return {
                success: false,
                message: `Refused: FC is in ${currentMode}, not GUIDED. ` +
                    "Flip TX switch to GUIDED or click 'Engage GUIDED' first.",
            };
        }

        try {
            const buf = buildSetPositionTargetGlobalInt(
                this._targetSystem,
                this._targetComponent,
                lat, lon, Math.max(0, alt || 0),
                this._seq++,
            );
            this._port.write(buf);
            return { success: true, message: `Flying to ${lat.toFixed(6)}, ${lon.toFixed(6)} @ ${alt}m` };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }

    /**
     * Upload a list of waypoints to the FC using the standard ArduPilot
     * mission upload handshake:
     *   GCS → MISSION_COUNT
     *   FC  → MISSION_REQUEST_INT (seq=0)
     *   GCS → MISSION_ITEM_INT (seq=0)
     *   ... repeat for all items ...
     *   FC  → MISSION_ACK
     * Returns {success, message} based on the final ACK.
     */
    async uploadMission(waypoints) {
        if (!this._port || !this._port.isOpen) {
            return { success: false, message: "Not connected" };
        }
        if (!Array.isArray(waypoints) || waypoints.length === 0) {
            return { success: false, message: "No waypoints to upload" };
        }

        const count = waypoints.length;
        const targetSys = this._targetSystem;
        const targetComp = this._targetComponent;
        const HANDSHAKE_TIMEOUT_MS = 6000;

        return new Promise((resolve) => {
            let settled = false;
            let nextSeq = 0;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                cleanup();
                resolve(result);
            };

            const cleanup = this.onMessage((msg) => {
                try {
                    if (msg.msgId === MSG_MISSION_REQUEST_INT || msg.msgId === MSG_MISSION_REQUEST) {
                        const req = decodeMissionRequestInt(msg.payload);
                        if (!req) return;
                        const wp = waypoints[req.seq] || waypoints[nextSeq];
                        if (!wp) {
                            finish({ success: false, message: `FC asked for seq ${req.seq}, out of range` });
                            return;
                        }
                        const itemBuf = buildMissionItemInt(targetSys, targetComp, {
                            ...wp,
                            seq: req.seq,
                            current: req.seq === 0 ? 1 : 0,
                            autocontinue: 1,
                        }, this._seq++);
                        try { this._port.write(itemBuf); } catch (err) {
                            finish({ success: false, message: `Write failed: ${err.message}` });
                            return;
                        }
                        nextSeq = req.seq + 1;
                    } else if (msg.msgId === MSG_MISSION_ACK) {
                        const ack = decodeMissionAck(msg.payload);
                        if (!ack) return;
                        if (ack.type === 0) {
                            finish({ success: true, message: `${count} waypoints uploaded` });
                        } else {
                            finish({ success: false, message: `MISSION_ACK type=${ack.type}` });
                        }
                    }
                } catch (err) {
                    finish({ success: false, message: `Handshake error: ${err.message}` });
                }
            });

            const timer = setTimeout(() => {
                finish({ success: false, message: "Mission upload timed out" });
            }, HANDSHAKE_TIMEOUT_MS);

            // Kick off
            try {
                this._port.write(buildMissionCount(targetSys, targetComp, count, this._seq++));
            } catch (err) {
                finish({ success: false, message: `Initial write failed: ${err.message}` });
            }
        });
    }

    /**
     * Command the gimbal to (pitch, yaw) in degrees using
     * MAV_CMD_DO_MOUNT_CONTROL (cmd 205).
     *  param1 = pitch deg, param2 = roll deg (0), param3 = yaw deg
     *  param7 = MAV_MOUNT_MODE_MAVLINK_TARGETING (2)
     */
    async setGimbalAngle(pitch, yaw) {
        if (!this._port || !this._port.isOpen) {
            return { success: false, message: "Not connected" };
        }
        const result = await this.sendCommandWithAck(
            MAV_CMD_DO_MOUNT_CONTROL,
            [pitch, 0, yaw, 0, 0, 0, 2],
            1500,
        );
        return result.success
            ? { success: true, message: `Gimbal → pitch ${pitch}°, yaw ${yaw}°` }
            : { success: false, message: result.message };
    }

    /**
     * Get available connection profiles.
     * @returns {Array<{name: string, connection_string: string, baud_rate: number, description: string}>}
     */
    getConnectionProfiles() {
        const comPort = process.env.MAVLINK_CONNECTION_STRING || getDefaultSerialPortByPlatform();
        const baudRate = parseInt(process.env.MAVLINK_BAUD_RATE || "57600");
        return [
            {
                name: "Radio Telemetry",
                connection_string: comPort,
                baud_rate: baudRate,
                description: "SiK Radio on Serial Port",
            },
            {
                name: "SITL Simulator",
                connection_string: "tcp:127.0.0.1:5760",
                baud_rate: 115200,
                description: "ArduPilot SITL over TCP",
            },
        ];
    }

    /**
     * List serial ports available on the host machine.
     * @returns {Promise<Array<{path: string, manufacturer?: string, serialNumber?: string, vendorId?: string, productId?: string, friendlyName: string}>>}
     */
    async listSerialPorts() {
        try {
            const ports = await SerialPort.list();
            const aliasMap = buildLinuxSerialAliasMap();

            const ranked = ports
                .map((port) => {
                    const aliasPath = aliasMap.get(port.path);
                    const preferredPath = aliasPath || port.path;
                    const primaryName =
                        port.friendlyName ||
                        port.manufacturer ||
                        preferredPath;

                    return {
                        path: preferredPath,
                        manufacturer: port.manufacturer,
                        serialNumber: port.serialNumber,
                        vendorId: port.vendorId,
                        productId: port.productId,
                        friendlyName: primaryName,
                        likelyMavlink: scoreSerialPath(preferredPath) < 10,
                    };
                })
                .sort((a, b) => {
                    const scoreDiff = scoreSerialPath(a.path) - scoreSerialPath(b.path);
                    if (scoreDiff !== 0) return scoreDiff;
                    return a.path.localeCompare(b.path);
                });

            return ranked;
        } catch (error) {
            return [];
        }
    }

    /** Clean up on app close. */
    destroy() {
        this._stopBroadcast();
        if (this._port && this._port.isOpen) {
            try { this._port.close(); } catch (e) { /* ignore */ }
        }
    }

    // ── Private Methods ─────────────────────────────────────

    _handleMessage(msg, source = "serial") {
        // Skip GCS heartbeats
        if (msg.msgId === MSG_HEARTBEAT && msg.sysId === 255) return;

        // Notify the link router so its dots/failover stay live.
        if (msg.msgId === MSG_HEARTBEAT && source === "udp" && this._linkRouter) {
            try { this._linkRouter.noteUdpHeartbeat(); } catch { /* ignore */ }
        }

        // Fan out to generic listeners (mission upload, gimbal ack, etc.)
        if (this._messageListeners.size) {
            for (const listener of this._messageListeners) {
                try { listener(msg, source); } catch { /* ignore */ }
            }
        }

        // Debug: count messages (log every 50 heartbeats)
        this._msgCounts[msg.msgId] = (this._msgCounts[msg.msgId] || 0) + 1;
        if (msg.msgId === MSG_HEARTBEAT && this._msgCounts[MSG_HEARTBEAT] % 50 === 0) {
            console.log("[MAVLink] Message counts:", JSON.stringify(this._msgCounts));
            console.log("[MAVLink] State sample:", JSON.stringify({
                pos: this._state.position,
                bat: this._state.battery,
                gps: this._state.gps,
            }));
        }

        try {
            switch (msg.msgId) {
                case MSG_HEARTBEAT: {
                    const hb = decodeHeartbeat(msg.payload);
                    if (hb && msg.payload.length >= 5 && msg.payload.readUInt8(4) !== 6) {
                        this._state.heartbeat = hb;
                        this._state.last_heartbeat = Date.now() / 1000;
                        this._targetSystem = msg.sysId;
                        this._targetComponent = msg.compId;

                        // After first heartbeat, request all telemetry streams
                        if (!this._streamsRequested) {
                            this._streamsRequested = true;
                            this._requestAllStreams();
                            this._startGcsHeartbeat();
                        }
                    }
                    break;
                }
                case MSG_ATTITUDE: {
                    const att = decodeAttitude(msg.payload);
                    if (att) this._state.attitude = att;
                    break;
                }
                case MSG_GLOBAL_POSITION_INT: {
                    const pos = decodeGlobalPosition(msg.payload);
                    if (pos) this._state.position = pos;
                    break;
                }
                case MSG_VFR_HUD: {
                    const hud = decodeVfrHud(msg.payload);
                    if (hud) this._state.vfr_hud = hud;
                    break;
                }
                case MSG_SYS_STATUS: {
                    const bat = decodeSysStatus(msg.payload);
                    if (bat) this._state.battery = bat;
                    break;
                }
                case MSG_GPS_RAW_INT: {
                    const gps = decodeGpsRaw(msg.payload);
                    if (gps) this._state.gps = gps;
                    break;
                }
                case MSG_COMMAND_ACK: {
                    const ack = decodeCommandAck(msg.payload);
                    if (ack && this._ackListeners.size) {
                        for (const listener of this._ackListeners) {
                            try { listener(ack); } catch { /* ignore */ }
                        }
                    }
                    break;
                }
                case MSG_STATUSTEXT: {
                    const text = decodeStatusText(msg.payload);
                    if (text) this._state.status_text = text;
                    break;
                }
                case MSG_NAMED_VALUE_INT: {
                    const nv = decodeNamedValueInt(msg.payload);
                    if (nv && nv.name === "PLDOPEN") {
                        const isOpen = nv.value !== 0;
                        if (this._state.payloadOpen !== isOpen) {
                            this._state.payloadOpen = isOpen;
                            if (this._window && !this._window.isDestroyed()) {
                                try {
                                    this._window.webContents.send("payload-toggle-state", {
                                        open: isOpen,
                                        source: source,
                                        ts: Date.now(),
                                    });
                                } catch { /* window may be gone */ }
                            }
                        }
                    }
                    break;
                }
            }
        } catch (e) {
            console.error(`[MAVLink] Decode error for msg ${msg.msgId}:`, e.message);
        }

        // Update connection status based on heartbeat freshness
        const now = Date.now() / 1000;
        if (this._state.last_heartbeat > 0) {
            this._state.connected = (now - this._state.last_heartbeat) < 5;
        }
    }

    /** Start broadcasting state to renderer at 10Hz. */
    _startBroadcast() {
        if (this._broadcastInterval) return;

        this._broadcastInterval = setInterval(() => {
            if (this._window && !this._window.isDestroyed()) {
                this._state.timestamp = Date.now() / 1000;
                try {
                    this._window.webContents.send("telemetry-update", this._state);
                } catch (e) {
                    // Window may have been destroyed
                }
            }
        }, 100); // 10Hz
    }

    /** Stop the broadcast timer. */
    _stopBroadcast() {
        if (this._broadcastInterval) {
            clearInterval(this._broadcastInterval);
            this._broadcastInterval = null;
        }
    }

    /** Send connection status event to renderer. */
    _sendConnectionStatus(connected, message) {
        if (this._window && !this._window.isDestroyed()) {
            try {
                this._window.webContents.send("connection-status", { connected, message });
            } catch (e) { /* ignore */ }
        }
    }

    /**
     * Request all telemetry data streams from the autopilot.
     * Mirrors what pymavlink does automatically on connection.
     * Stream IDs: 0=ALL, 1=RAW_SENSORS, 2=EXTENDED_STATUS, 6=POSITION, 10=EXTRA1, 11=EXTRA2, 12=EXTRA3
     */
    _requestAllStreams() {
        if (!this._port || !this._port.isOpen) return;

        const rate = 4; // 4 Hz for most streams
        const streams = [
            { id: 0, rate: 4, name: "ALL" },
            { id: 1, rate: 2, name: "RAW_SENSORS" },      // GPS_RAW_INT, SYS_STATUS
            { id: 2, rate: 2, name: "EXTENDED_STATUS" },   // SYS_STATUS, GPS_STATUS
            { id: 6, rate: 4, name: "POSITION" },          // GLOBAL_POSITION_INT
            { id: 10, rate: 10, name: "EXTRA1" },            // ATTITUDE
            { id: 11, rate: 4, name: "EXTRA2" },            // VFR_HUD
            { id: 12, rate: 2, name: "EXTRA3" },            // Battery, etc.
        ];

        console.log("[MAVLink] Requesting telemetry data streams...");

        // Send each stream request with a small delay to avoid flooding
        streams.forEach((stream, i) => {
            setTimeout(() => {
                if (this._port && this._port.isOpen) {
                    const buf = buildRequestDataStream(
                        this._targetSystem, this._targetComponent,
                        stream.id, stream.rate, 1 // start_stop = 1 (start)
                    );
                    this._port.write(buf);
                    console.log(`[MAVLink]   → Stream ${stream.id} (${stream.name}) @ ${stream.rate} Hz`);
                }
            }, i * 100); // stagger by 100ms
        });
    }

    /**
     * Start sending 1Hz GCS heartbeat to the drone.
     * Prevents Pixhawk from triggering failsafe RTL on heartbeat timeout.
     */
    _startGcsHeartbeat() {
        this._stopGcsHeartbeat();
        console.log("[MAVLink] Starting GCS heartbeat (1Hz)");
        this._heartbeatInterval = setInterval(() => {
            if (this._port && this._port.isOpen) {
                const buf = buildGcsHeartbeat(this._seq++);
                this._port.write(buf);
            }
        }, 1000); // 1Hz
    }

    /** Stop the GCS heartbeat timer. */
    _stopGcsHeartbeat() {
        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
            this._heartbeatInterval = null;
        }
    }
}

module.exports = { MAVLinkHandler };
