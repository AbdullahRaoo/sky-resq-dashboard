/**
 * Web Serial Service — browser-based SiK radio connection.
 *
 * Based on Betaflight Configurator's WebSerial.js pattern, but adapted
 * for MAVLink telemetry radios that stream data immediately on open:
 *
 * - bufferSize: 8192 (1.4 seconds at 57600 baud) — default 255 bytes
 *   overflows in 44ms which any React render will exceed
 * - Async generator read loop with for-await-of (Betaflight pattern)
 * - Processing decoupled on 100ms timer
 * - Proper port cleanup on ALL error paths (prevents "port already open")
 */

import { useTelemetryStore } from "@/store/telemetryStore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let port: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let reader: any = null;
let reading = false;
let isConnected = false;
let processTimer: ReturnType<typeof setInterval> | null = null;

// Raw byte accumulator
let rawChunks: Uint8Array[] = [];

// MAVLink reassembly
const mavBuf = new Uint8Array(4096);
let mavLen = 0;

// Pending telemetry
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

    // If port is still open from a previous failed connection, close it first
    if (port) {
        try { await cleanup(); } catch { /* ignore */ }
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        port = await (navigator as any).serial.requestPort();

        // bufferSize: 8192 = ~1.4 seconds at 57600 baud
        // Default is 255 bytes = 44ms, which any React render will exceed.
        // The SiK radio streams MAVLink continuously on open (unlike Betaflight
        // FCs which wait for MSP requests), so we need this headroom.
        await port.open({ baudRate, bufferSize: 8192 });

        // Get reader immediately after open (Betaflight pattern)
        reader = port.readable.getReader();

        isConnected = true;
        reading = true;
        rawChunks = [];
        mavLen = 0;
        pending = {};
        hasPending = false;

        // Start process timer
        processTimer = setInterval(processAndFlush, 100);

        // Start read loop (returns immediately, runs async)
        readLoop();

        return { success: true, message: `Connected at ${baudRate} baud` };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";

        // Clean up on failure
        await cleanup();

        if (msg.includes("No port selected") || msg.includes("cancelled")) {
            return { success: false, message: "No serial port selected" };
        }
        if (msg.includes("already open")) {
            return { success: false, message: "Port busy. Refresh the page and try again." };
        }
        return { success: false, message: `Connection failed: ${msg}` };
    }
}

export async function webSerialDisconnect(): Promise<void> {
    await cleanup();
    useTelemetryStore.getState().resetState();
}

/**
 * Full cleanup — stops reading, releases reader, closes port.
 * Safe to call multiple times. Safe to call even if already cleaned up.
 */
async function cleanup() {
    isConnected = false;
    reading = false;

    if (processTimer) {
        clearInterval(processTimer);
        processTimer = null;
    }

    // Cancel reader (signals for-await-of to exit)
    if (reader) {
        try { await reader.cancel(); } catch { /* ok */ }
        try { reader.releaseLock(); } catch { /* ok */ }
        reader = null;
    }

    // Close port
    if (port) {
        try { await port.close(); } catch { /* ok */ }
        port = null;
    }

    rawChunks = [];
    mavLen = 0;
    pending = {};
    hasPending = false;
}

export async function webSerialSend(data: Uint8Array): Promise<void> {
    if (!port?.writable) return;
    const writer = port.writable.getWriter();
    try { await writer.write(data); }
    finally { writer.releaseLock(); }
}

// ─── Read Loop (Betaflight async generator pattern) ────────

/**
 * Async generator that yields Uint8Array chunks from the reader.
 * Handles errors gracefully and always releases the reader lock.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function* streamIterable(rdr: any) {
    try {
        while (reading) {
            const { done, value } = await rdr.read();
            if (done) return;
            yield value;
        }
    } catch (error) {
        console.warn("[WebSerial] Read error:", error);
    } finally {
        try { rdr.releaseLock(); } catch { /* ok */ }
    }
}

/**
 * Read loop — just pushes raw chunks. Zero processing.
 * If the stream ends or errors, triggers full cleanup.
 */
async function readLoop() {
    try {
        for await (const chunk of streamIterable(reader)) {
            rawChunks.push(chunk);
        }
    } catch (error) {
        console.error("[WebSerial] readLoop error:", error);
    }

    // Stream ended — cleanup everything
    if (isConnected) {
        console.warn("[WebSerial] Stream ended unexpectedly");
        await cleanup();
        useTelemetryStore.getState().resetState();
    }
}

// ─── Process + Flush Timer ─────────────────────────────────

function processAndFlush() {
    if (!isConnected) return;

    // Drain raw chunks into MAVLink buffer
    if (rawChunks.length > 0) {
        const chunks = rawChunks;
        rawChunks = [];
        for (const chunk of chunks) {
            const space = mavBuf.length - mavLen;
            if (chunk.length <= space) {
                mavBuf.set(chunk, mavLen);
                mavLen += chunk.length;
            } else {
                // Buffer full — reset and start fresh
                mavLen = 0;
                if (chunk.length <= mavBuf.length) {
                    mavBuf.set(chunk, 0);
                    mavLen = chunk.length;
                }
            }
        }
    }

    // Parse MAVLink frames
    if (mavLen > 0) {
        mavLen = parseFrames(mavBuf, mavLen);
    }

    // Flush to React (single batch)
    if (hasPending) {
        useTelemetryStore.getState().updateState(pending);
        pending = {};
        hasPending = false;
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

// ─── Message parsers ───────────────────────────────────────

function m_hb(d: Uint8Array, o: number) {
    pending.connected = true;
    pending.heartbeat = { flight_mode: FM[i32(d, o)] || `MODE_${i32(d, o)}`, armed: !!(d[o + 6] & 0x80), system_status: d[o + 7] };
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
