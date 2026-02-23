/**
 * Web Serial Service — browser-based SiK radio connection.
 * Uses the Web Serial API (Chrome/Edge only) to connect directly
 * to a USB serial device from the browser without Electron.
 *
 * Opens the port with a 32KB read buffer to prevent overrun at 57600 baud.
 * Uses efficient Uint8Array-based MAVLink v2 parsing.
 */

import { useTelemetryStore } from "@/store/telemetryStore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let port: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let reader: any = null;
let keepReading = false;

/** Check if Web Serial API is available in this browser. */
export function isWebSerialAvailable(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
}

/** Check if running inside Electron. */
export function isElectron(): boolean {
    return typeof window !== "undefined" && !!window.electron;
}

/**
 * Request a serial port from the user and open it.
 * Uses a 32KB buffer to prevent overrun at high baud rates.
 */
export async function webSerialConnect(baudRate: number): Promise<{ success: boolean; message: string }> {
    if (!isWebSerialAvailable()) {
        return {
            success: false,
            message: "Web Serial API not available. Use Chrome or Edge browser.",
        };
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        port = await (navigator as any).serial.requestPort();
        // 32KB buffer prevents overrun at 57600+ baud
        await port.open({ baudRate, bufferSize: 32768 });

        const store = useTelemetryStore.getState();
        store.updateState({ connected: true });

        keepReading = true;
        readLoop();

        return { success: true, message: `Connected at ${baudRate} baud` };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (msg.includes("No port selected")) {
            return { success: false, message: "No serial port selected" };
        }
        return { success: false, message: `Connection failed: ${msg}` };
    }
}

/** Disconnect and close the serial port. */
export async function webSerialDisconnect(): Promise<void> {
    keepReading = false;

    if (reader) {
        try { await reader.cancel(); } catch { /* ignore */ }
        reader = null;
    }

    if (port) {
        try { await port.close(); } catch { /* ignore */ }
        port = null;
    }

    useTelemetryStore.getState().resetState();
}

/**
 * Read loop — uses a ring buffer approach.
 * Reads raw bytes, appends to a pre-allocated Uint8Array, and parses in-place.
 */
async function readLoop() {
    if (!port?.readable) return;

    // Pre-allocated ring buffer — much faster than array push/splice
    let buf = new Uint8Array(8192);
    let len = 0;

    while (keepReading && port.readable) {
        try {
            reader = port.readable.getReader();

            while (keepReading && reader) {
                const { value, done } = await reader.read();
                if (done) break;
                if (!value || value.length === 0) continue;

                // Append incoming data to buffer
                if (len + value.length > buf.length) {
                    // Either grow the buffer or drop old data
                    if (len + value.length > 65536) {
                        // Buffer too large — drop everything and start fresh
                        len = 0;
                    } else {
                        const newBuf = new Uint8Array(Math.max(buf.length * 2, len + value.length));
                        newBuf.set(buf.subarray(0, len));
                        buf = newBuf;
                    }
                }
                buf.set(value, len);
                len += value.length;

                // Parse all complete MAVLink frames
                len = parseFrames(buf, len);
            }
        } catch (err) {
            if (keepReading) {
                console.warn("[WebSerial] Read error, retrying:", err);
                await new Promise((r) => setTimeout(r, 200));
            }
        } finally {
            if (reader) {
                try { reader.releaseLock(); } catch { /* ignore */ }
                reader = null;
            }
        }
    }
}

/** Send raw bytes over the serial port. */
export async function webSerialSend(data: Uint8Array): Promise<void> {
    if (!port?.writable) return;
    const writer = port.writable.getWriter();
    try {
        await writer.write(data);
    } finally {
        writer.releaseLock();
    }
}

// ═══════════════════════════════════════════════════════════
// MAVLink v2 Frame Parser (Uint8Array-based, zero-copy)
// ═══════════════════════════════════════════════════════════

const MAVLINK_V1_START = 0xfe;
const MAVLINK_V2_START = 0xfd;

/**
 * Parse complete MAVLink frames from a Uint8Array buffer.
 * Returns the number of unprocessed bytes remaining.
 */
function parseFrames(buf: Uint8Array, len: number): number {
    const store = useTelemetryStore.getState();
    let pos = 0;

    while (pos < len) {
        // Scan for a start byte
        while (pos < len && buf[pos] !== MAVLINK_V2_START && buf[pos] !== MAVLINK_V1_START) {
            pos++;
        }
        if (pos >= len) break;

        const isV2 = buf[pos] === MAVLINK_V2_START;
        const headerLen = isV2 ? 10 : 6;
        const crcLen = 2;

        // Need at least header + CRC
        if (pos + headerLen + crcLen > len) break;

        const payloadLen = buf[pos + 1];
        const frameLen = headerLen + payloadLen + crcLen;

        // Need the full frame
        if (pos + frameLen > len) break;

        // Extract message ID
        let msgId: number;
        if (isV2) {
            msgId = buf[pos + 7] | (buf[pos + 8] << 8) | (buf[pos + 9] << 16);
        } else {
            msgId = buf[pos + 5];
        }

        // Payload starts after header
        const payloadStart = pos + headerLen;

        // Parse known messages
        try {
            switch (msgId) {
                case 0: parseHeartbeat(buf, payloadStart, payloadLen, store); break;
                case 1: parseSysStatus(buf, payloadStart, payloadLen, store); break;
                case 24: parseGpsRawInt(buf, payloadStart, payloadLen, store); break;
                case 30: parseAttitude(buf, payloadStart, payloadLen, store); break;
                case 33: parseGlobalPositionInt(buf, payloadStart, payloadLen, store); break;
                case 74: parseVfrHud(buf, payloadStart, payloadLen, store); break;
                case 253: parseStatusText(buf, payloadStart, payloadLen, store); break;
            }
        } catch {
            // Skip malformed messages
        }

        pos += frameLen;
    }

    // Compact: move unprocessed bytes to front
    if (pos > 0 && pos < len) {
        buf.copyWithin(0, pos, len);
    }
    return len - pos;
}

// ─── Binary readers (Uint8Array, zero-copy) ────────────────

function i32(d: Uint8Array, o: number): number {
    return d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24);
}
function u16(d: Uint8Array, o: number): number {
    return d[o] | (d[o + 1] << 8);
}
function i16(d: Uint8Array, o: number): number {
    const v = u16(d, o);
    return v > 0x7fff ? v - 0x10000 : v;
}

// Shared DataView for float parsing
const _fb = new ArrayBuffer(4);
const _fv = new DataView(_fb);
const _fu = new Uint8Array(_fb);
function f32(d: Uint8Array, o: number): number {
    _fu[0] = d[o]; _fu[1] = d[o + 1]; _fu[2] = d[o + 2]; _fu[3] = d[o + 3];
    return _fv.getFloat32(0, true);
}

const FLIGHT_MODES: Record<number, string> = {
    0: "STABILIZE", 2: "ALT_HOLD", 3: "AUTO", 4: "GUIDED",
    5: "LOITER", 6: "RTL", 9: "LAND", 16: "POSHOLD",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseHeartbeat(d: Uint8Array, o: number, plen: number, store: any) {
    if (plen < 9) return;
    const customMode = i32(d, o);
    const baseMode = d[o + 6];
    const armed = !!(baseMode & 0x80);
    const mode = FLIGHT_MODES[customMode] || `MODE_${customMode}`;
    store.updateState({
        connected: true,
        heartbeat: { flight_mode: mode, armed, system_status: d[o + 7] },
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSysStatus(d: Uint8Array, o: number, plen: number, store: any) {
    if (plen < 31) return;
    const voltage = u16(d, o + 14) / 1000;
    const current = i16(d, o + 16) / 100;
    const remaining = d[o + 30];
    store.updateState({
        battery: { voltage, current, remaining: remaining === 255 ? -1 : remaining },
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGpsRawInt(d: Uint8Array, o: number, plen: number, store: any) {
    if (plen < 30) return;
    store.updateState({
        gps: { fix_type: d[o + 28], satellites_visible: d[o + 29] },
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseAttitude(d: Uint8Array, o: number, plen: number, store: any) {
    if (plen < 28) return;
    store.updateState({
        attitude: {
            roll: f32(d, o + 4) * (180 / Math.PI),
            pitch: f32(d, o + 8) * (180 / Math.PI),
            yaw: f32(d, o + 12) * (180 / Math.PI),
        },
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGlobalPositionInt(d: Uint8Array, o: number, plen: number, store: any) {
    if (plen < 28) return;
    store.updateState({
        position: {
            lat: i32(d, o + 4) / 1e7,
            lon: i32(d, o + 8) / 1e7,
            alt: i32(d, o + 12) / 1000,
            relative_alt: i32(d, o + 16) / 1000,
        },
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseVfrHud(d: Uint8Array, o: number, plen: number, store: any) {
    if (plen < 20) return;
    store.updateState({
        vfr_hud: {
            airspeed: f32(d, o),
            groundspeed: f32(d, o + 4),
            heading: i16(d, o + 8),
            throttle: u16(d, o + 10),
            alt: f32(d, o + 12),
            climb: f32(d, o + 16),
        },
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseStatusText(d: Uint8Array, o: number, plen: number, store: any) {
    if (plen < 2) return;
    // severity = d[o], text starts at d[o+1]
    let end = o + 1;
    const limit = o + plen;
    while (end < limit && d[end] !== 0) end++;
    const text = String.fromCharCode(...d.subarray(o + 1, end));
    if (text.length > 0) {
        store.updateState({ status_text: text });
    }
}
