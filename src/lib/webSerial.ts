/**
 * Web Serial Service — browser-based SiK radio connection.
 *
 * Key design decisions:
 * 1. Opens port with 256KB buffer to prevent OS-level overrun
 * 2. Reads serial data as fast as possible without blocking
 * 3. Parses MAVLink frames into a PENDING state object (no React re-renders)
 * 4. Flushes pending state to the Zustand store at 10Hz via setInterval
 *    → This prevents React re-renders from blocking reader.read()
 */

import { useTelemetryStore } from "@/store/telemetryStore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let port: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let reader: any = null;
let keepReading = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;

// Pending telemetry — accumulated between flushes (no React involved)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pending: any = {};
let hasPending = false;

export function isWebSerialAvailable(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
}

export function isElectron(): boolean {
    return typeof window !== "undefined" && !!window.electron;
}

/**
 * Connect to a serial port via Web Serial API.
 * Opens with 256KB buffer and starts a 10Hz flush timer.
 */
export async function webSerialConnect(baudRate: number): Promise<{ success: boolean; message: string }> {
    if (!isWebSerialAvailable()) {
        return { success: false, message: "Web Serial API not available. Use Chrome or Edge." };
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        port = await (navigator as any).serial.requestPort();
        await port.open({ baudRate, bufferSize: 262144 }); // 256KB buffer

        useTelemetryStore.getState().updateState({ connected: true });

        keepReading = true;
        pending = {};
        hasPending = false;

        // Flush pending state to React store at 10Hz (every 100ms)
        flushTimer = setInterval(flushToStore, 100);

        // Start reading in background (non-blocking)
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

export async function webSerialDisconnect(): Promise<void> {
    keepReading = false;

    if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
    }

    if (reader) {
        try { await reader.cancel(); } catch { /* ignore */ }
        reader = null;
    }
    if (port) {
        try { await port.close(); } catch { /* ignore */ }
        port = null;
    }

    pending = {};
    hasPending = false;
    useTelemetryStore.getState().resetState();
}

/**
 * Flush accumulated telemetry to the React store.
 * Called at 10Hz by setInterval — decoupled from serial read rate.
 */
function flushToStore() {
    if (!hasPending) return;
    useTelemetryStore.getState().updateState(pending);
    pending = {};
    hasPending = false;
}

/**
 * Read loop — reads as fast as possible, parses into `pending` (no React).
 * The reader.read() call yields to the browser between reads,
 * so this doesn't block the event loop.
 */
async function readLoop() {
    if (!port?.readable) return;

    // Ring buffer for MAVLink frame reassembly
    const buf = new Uint8Array(65536);
    let len = 0;

    while (keepReading && port?.readable) {
        try {
            reader = port.readable.getReader();

            while (keepReading && reader) {
                const { value, done } = await reader.read();
                if (done) break;
                if (!value || value.length === 0) continue;

                // Append to ring buffer
                const incoming = value.length;
                if (len + incoming > buf.length) {
                    // Drop oldest half to make room
                    const keep = Math.floor(buf.length / 2);
                    buf.copyWithin(0, len - keep, len);
                    len = keep;
                }
                buf.set(value, len);
                len += incoming;

                // Parse all complete frames (writes to `pending`, NOT to React)
                len = parseFrames(buf, len);
            }
        } catch (err) {
            if (keepReading) {
                console.warn("[WebSerial] Read hiccup:", err);
                // Minimal delay — just yield to event loop
                await new Promise((r) => setTimeout(r, 50));
            }
        } finally {
            if (reader) {
                try { reader.releaseLock(); } catch { /* ignore */ }
                reader = null;
            }
        }
    }
}

export async function webSerialSend(data: Uint8Array): Promise<void> {
    if (!port?.writable) return;
    const writer = port.writable.getWriter();
    try { await writer.write(data); }
    finally { writer.releaseLock(); }
}

// ═══════════════════════════════════════════════════════════
// MAVLink Frame Parser — writes to `pending` (no React)
// ═══════════════════════════════════════════════════════════

const MV1 = 0xfe; // MAVLink v1
const MV2 = 0xfd; // MAVLink v2

function parseFrames(buf: Uint8Array, len: number): number {
    let pos = 0;

    while (pos < len) {
        // Scan for start byte
        while (pos < len && buf[pos] !== MV2 && buf[pos] !== MV1) pos++;
        if (pos >= len) break;

        const isV2 = buf[pos] === MV2;
        const hdrLen = isV2 ? 10 : 6;

        if (pos + hdrLen + 2 > len) break; // Need header + CRC

        const plen = buf[pos + 1];
        const frameLen = hdrLen + plen + 2;
        if (pos + frameLen > len) break; // Need full frame

        const msgId = isV2
            ? (buf[pos + 7] | (buf[pos + 8] << 8) | (buf[pos + 9] << 16))
            : buf[pos + 5];

        const o = pos + hdrLen; // payload offset

        try {
            switch (msgId) {
                case 0: if (plen >= 9) hb(buf, o); break;
                case 1: if (plen >= 31) ss(buf, o); break;
                case 24: if (plen >= 30) gps(buf, o); break;
                case 30: if (plen >= 28) att(buf, o); break;
                case 33: if (plen >= 28) gpi(buf, o); break;
                case 74: if (plen >= 20) vfr(buf, o); break;
                case 253: if (plen >= 2) stx(buf, o, plen); break;
            }
        } catch { /* skip malformed */ }

        pos += frameLen;
    }

    // Compact remaining bytes
    if (pos > 0 && pos < len) buf.copyWithin(0, pos, len);
    return len - pos;
}

// ─── Binary helpers (zero-copy) ────────────────────────────

function i32(d: Uint8Array, o: number) { return d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24); }
function u16(d: Uint8Array, o: number) { return d[o] | (d[o + 1] << 8); }
function i16(d: Uint8Array, o: number) { const v = u16(d, o); return v > 0x7fff ? v - 0x10000 : v; }

const _fb = new ArrayBuffer(4);
const _fv = new DataView(_fb);
const _fu = new Uint8Array(_fb);
function f32(d: Uint8Array, o: number) {
    _fu[0] = d[o]; _fu[1] = d[o + 1]; _fu[2] = d[o + 2]; _fu[3] = d[o + 3];
    return _fv.getFloat32(0, true);
}

const MODES: Record<number, string> = {
    0: "STABILIZE", 2: "ALT_HOLD", 3: "AUTO", 4: "GUIDED",
    5: "LOITER", 6: "RTL", 9: "LAND", 16: "POSHOLD",
};

// ─── Message parsers → write to `pending` ──────────────────

function hb(d: Uint8Array, o: number) {
    const cm = i32(d, o);
    pending.connected = true;
    pending.heartbeat = { flight_mode: MODES[cm] || `MODE_${cm}`, armed: !!(d[o + 6] & 0x80), system_status: d[o + 7] };
    hasPending = true;
}

function ss(d: Uint8Array, o: number) {
    const rem = d[o + 30];
    pending.battery = { voltage: u16(d, o + 14) / 1000, current: i16(d, o + 16) / 100, remaining: rem === 255 ? -1 : rem };
    hasPending = true;
}

function gps(d: Uint8Array, o: number) {
    pending.gps = { fix_type: d[o + 28], satellites_visible: d[o + 29] };
    hasPending = true;
}

function att(d: Uint8Array, o: number) {
    const r2d = 180 / Math.PI;
    pending.attitude = { roll: f32(d, o + 4) * r2d, pitch: f32(d, o + 8) * r2d, yaw: f32(d, o + 12) * r2d };
    hasPending = true;
}

function gpi(d: Uint8Array, o: number) {
    pending.position = { lat: i32(d, o + 4) / 1e7, lon: i32(d, o + 8) / 1e7, alt: i32(d, o + 12) / 1000, relative_alt: i32(d, o + 16) / 1000 };
    hasPending = true;
}

function vfr(d: Uint8Array, o: number) {
    pending.vfr_hud = { airspeed: f32(d, o), groundspeed: f32(d, o + 4), heading: i16(d, o + 8), throttle: u16(d, o + 10), alt: f32(d, o + 12), climb: f32(d, o + 16) };
    hasPending = true;
}

function stx(d: Uint8Array, o: number, plen: number) {
    let end = o + 1;
    const limit = o + plen;
    while (end < limit && d[end] !== 0) end++;
    const text = String.fromCharCode(...d.subarray(o + 1, end));
    if (text.length > 0) {
        pending.status_text = text;
        hasPending = true;
    }
}
