/**
 * Web Serial Service — browser-based SiK radio connection.
 *
 * Modeled after Betaflight Configurator's WebSerial.js implementation:
 * - Simple port.open() with DEFAULT bufferSize (no oversized buffers)
 * - Async generator + for-await-of for proper ReadableStream backpressure
 * - Raw bytes dispatched, parsing happens separately on a timer
 * - Minimal code in the read loop
 *
 * Reference: github.com/betaflight/betaflight-configurator/blob/master/src/js/protocols/WebSerial.js
 */

import { useTelemetryStore } from "@/store/telemetryStore";

// ─── State ─────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let port: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let reader: any = null;
let reading = false;
let connected = false;
let processTimer: ReturnType<typeof setInterval> | null = null;

// Raw byte accumulator — appended by read loop, consumed by parse timer
let rawChunks: Uint8Array[] = [];

// MAVLink reassembly buffer
const mavBuf = new Uint8Array(4096);
let mavLen = 0;

// Pending telemetry (written by parser, flushed to React)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pending: any = {};
let hasPending = false;

// ─── Public API ────────────────────────────────────────────

export function isWebSerialAvailable(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
}

export function isElectron(): boolean {
    return typeof window !== "undefined" && !!window.electron;
}

export async function webSerialConnect(baudRate: number): Promise<{ success: boolean; message: string }> {
    if (!isWebSerialAvailable()) {
        return { success: false, message: "Web Serial not available. Use Chrome or Edge." };
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        port = await (navigator as any).serial.requestPort();

        // Open with just baudRate — same as Betaflight. No custom bufferSize.
        await port.open({ baudRate });

        // Get reader and writer immediately (Betaflight pattern)
        reader = port.readable.getReader();

        connected = true;
        reading = true;
        rawChunks = [];
        mavLen = 0;
        pending = {};
        hasPending = false;

        // Start process timer (parse + flush at 10Hz)
        processTimer = setInterval(processAndFlush, 100);

        // Start read loop (Betaflight-style async generator)
        readLoop();

        return { success: true, message: `Connected at ${baudRate} baud` };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (msg.includes("No port selected") || msg.includes("cancelled")) {
            return { success: false, message: "No serial port selected" };
        }
        return { success: false, message: `Connection failed: ${msg}` };
    }
}

export async function webSerialDisconnect(): Promise<void> {
    connected = false;
    reading = false;

    if (processTimer) {
        clearInterval(processTimer);
        processTimer = null;
    }

    // Small delay to let read loop notice reading=false
    await new Promise(r => setTimeout(r, 50));

    if (reader) {
        try { await reader.cancel(); } catch { /* ok */ }
        try { if (reader.locked !== false) reader.releaseLock(); } catch { /* ok */ }
        reader = null;
    }

    if (port) {
        try { await port.close(); } catch { /* ok */ }
        port = null;
    }

    rawChunks = [];
    mavLen = 0;
    pending = {};
    hasPending = false;
    useTelemetryStore.getState().resetState();
}

export async function webSerialSend(data: Uint8Array): Promise<void> {
    if (!port?.writable) return;
    const writer = port.writable.getWriter();
    try { await writer.write(data); }
    finally { writer.releaseLock(); }
}

// ─── Read Loop (Betaflight pattern) ────────────────────────

/**
 * Betaflight-style async generator that yields Uint8Array chunks.
 * Uses for-await-of which properly handles ReadableStream backpressure.
 * On error, breaks cleanly and releases the reader lock.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function* streamAsyncIterable(rdr: any) {
    try {
        while (reading) {
            const { done, value } = await rdr.read();
            if (done) return;
            yield value;
        }
    } catch (error) {
        console.warn("[WebSerial] Read error:", error);
    } finally {
        try {
            if (rdr?.locked !== false) rdr.releaseLock();
        } catch { /* ok */ }
    }
}

/**
 * Read loop — iterates the async generator.
 * Only job: push raw chunks to the array. Zero parsing.
 */
async function readLoop() {
    try {
        for await (const chunk of streamAsyncIterable(reader)) {
            // Just accumulate the raw Uint8Array — no processing
            rawChunks.push(chunk);
        }
    } catch (error) {
        console.error("[WebSerial] readLoop error:", error);
    }

    // If we get here and we're still supposed to be connected, it means
    // the stream ended unexpectedly
    if (connected) {
        console.warn("[WebSerial] Stream ended, disconnecting...");
        connected = false;
        reading = false;
        useTelemetryStore.getState().resetState();
    }
}

// ─── Process + Flush Timer (100ms) ─────────────────────────

function processAndFlush() {
    if (!connected) return;

    // 1. Drain raw chunks into MAVLink reassembly buffer
    drainChunks();

    // 2. Parse MAVLink frames → pending
    if (mavLen > 0) {
        mavLen = parseFrames(mavBuf, mavLen);
    }

    // 3. Flush pending to React
    if (hasPending) {
        useTelemetryStore.getState().updateState(pending);
        pending = {};
        hasPending = false;
    }
}

function drainChunks() {
    if (rawChunks.length === 0) return;

    // Grab all accumulated chunks and clear
    const chunks = rawChunks;
    rawChunks = [];

    // Copy into MAVLink buffer
    for (const chunk of chunks) {
        const space = mavBuf.length - mavLen;
        if (chunk.length <= space) {
            mavBuf.set(chunk, mavLen);
            mavLen += chunk.length;
        } else {
            // Buffer full — copy what fits, discard rest
            mavBuf.set(chunk.subarray(0, space), mavLen);
            mavLen += space;
            break;
        }
    }
}

// ─── MAVLink Frame Parser ──────────────────────────────────

function parseFrames(buf: Uint8Array, len: number): number {
    let pos = 0;
    while (pos < len) {
        while (pos < len && buf[pos] !== 0xfd && buf[pos] !== 0xfe) pos++;
        if (pos >= len) break;

        const v2 = buf[pos] === 0xfd;
        const hl = v2 ? 10 : 6;
        if (pos + hl + 2 > len) break;

        const pl = buf[pos + 1];
        const fl = hl + pl + 2;
        if (pos + fl > len) break;

        const id = v2 ? (buf[pos + 7] | (buf[pos + 8] << 8) | (buf[pos + 9] << 16)) : buf[pos + 5];
        const o = pos + hl;

        try {
            if (id === 0 && pl >= 9) m_hb(buf, o);
            else if (id === 1 && pl >= 31) m_ss(buf, o);
            else if (id === 24 && pl >= 30) m_gps(buf, o);
            else if (id === 30 && pl >= 28) m_att(buf, o);
            else if (id === 33 && pl >= 28) m_gpi(buf, o);
            else if (id === 74 && pl >= 20) m_vfr(buf, o);
            else if (id === 253 && pl >= 2) m_stx(buf, o, pl);
        } catch { /* skip */ }

        pos += fl;
    }
    if (pos > 0 && pos < len) buf.copyWithin(0, pos, len);
    return len - pos;
}

// ─── Binary helpers ────────────────────────────────────────

function i32(d: Uint8Array, o: number) { return d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24); }
function u16(d: Uint8Array, o: number) { return d[o] | (d[o + 1] << 8); }
function i16(d: Uint8Array, o: number) { const v = u16(d, o); return v > 0x7fff ? v - 0x10000 : v; }
const _b = new ArrayBuffer(4), _v = new DataView(_b), _u = new Uint8Array(_b);
function f32(d: Uint8Array, o: number) { _u[0] = d[o]; _u[1] = d[o + 1]; _u[2] = d[o + 2]; _u[3] = d[o + 3]; return _v.getFloat32(0, true); }

const FM: Record<number, string> = { 0: "STABILIZE", 2: "ALT_HOLD", 3: "AUTO", 4: "GUIDED", 5: "LOITER", 6: "RTL", 9: "LAND", 16: "POSHOLD" };

// ─── Message parsers → pending ─────────────────────────────

function m_hb(d: Uint8Array, o: number) {
    const m = i32(d, o);
    pending.connected = true;
    pending.heartbeat = { flight_mode: FM[m] || `MODE_${m}`, armed: !!(d[o + 6] & 0x80), system_status: d[o + 7] };
    hasPending = true;
}
function m_ss(d: Uint8Array, o: number) {
    const r = d[o + 30];
    pending.battery = { voltage: u16(d, o + 14) / 1000, current: i16(d, o + 16) / 100, remaining: r === 255 ? -1 : r };
    hasPending = true;
}
function m_gps(d: Uint8Array, o: number) {
    pending.gps = { fix_type: d[o + 28], satellites_visible: d[o + 29] };
    hasPending = true;
}
function m_att(d: Uint8Array, o: number) {
    const c = 180 / Math.PI;
    pending.attitude = { roll: f32(d, o + 4) * c, pitch: f32(d, o + 8) * c, yaw: f32(d, o + 12) * c };
    hasPending = true;
}
function m_gpi(d: Uint8Array, o: number) {
    pending.position = { lat: i32(d, o + 4) / 1e7, lon: i32(d, o + 8) / 1e7, alt: i32(d, o + 12) / 1000, relative_alt: i32(d, o + 16) / 1000 };
    hasPending = true;
}
function m_vfr(d: Uint8Array, o: number) {
    pending.vfr_hud = { airspeed: f32(d, o), groundspeed: f32(d, o + 4), heading: i16(d, o + 8), throttle: u16(d, o + 10), alt: f32(d, o + 12), climb: f32(d, o + 16) };
    hasPending = true;
}
function m_stx(d: Uint8Array, o: number, pl: number) {
    let e = o + 1; const lim = o + pl;
    while (e < lim && d[e] !== 0) e++;
    const t = String.fromCharCode(...d.subarray(o + 1, e));
    if (t.length > 0) { pending.status_text = t; hasPending = true; }
}
