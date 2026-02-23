/**
 * Web Serial Service — browser-based SiK radio connection.
 *
 * APPROACH: ReadableStream.pipeTo() with native WritableStream
 * ============================================================
 * All previous approaches using reader.read() failed with BufferOverrunError
 * because the JavaScript event loop can't call reader.read() fast enough
 * when React is doing renders.
 *
 * pipeTo() uses the browser's NATIVE streaming pipeline which can read
 * data from the OS serial buffer independently of JS event loop scheduling.
 * The only JS callback is the WritableStream's write() method, which just
 * does array.push() — the fastest possible operation.
 *
 * If even this fails, the problem is at the OS/USB driver level and
 * Web Serial cannot handle this radio — a WebSocket relay would be needed.
 */

import { useTelemetryStore } from "@/store/telemetryStore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let port: any = null;
let isConnected = false;
let processTimer: ReturnType<typeof setInterval> | null = null;
let abortController: AbortController | null = null;

// Raw byte accumulator
let rawChunks: Uint8Array[] = [];

// MAVLink reassembly
const mavBuf = new Uint8Array(8192);
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

    // Clean up any previous connection
    if (port) {
        try { await cleanup(); } catch { /* ignore */ }
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        port = await (navigator as any).serial.requestPort();

        // Open with large buffer
        await port.open({ baudRate, bufferSize: 1000000 });

        isConnected = true;
        rawChunks = [];
        mavLen = 0;
        pending = {};
        hasPending = false;

        // Create abort controller for graceful shutdown
        abortController = new AbortController();

        // *** KEY DIFFERENCE: Use pipeTo() instead of reader.read() ***
        // pipeTo() uses the browser's native streaming pipeline which
        // operates more efficiently than manual JS reader.read() loops.
        const sink = new WritableStream({
            write(chunk: Uint8Array) {
                rawChunks.push(chunk);
            },
        });

        // pipeTo runs in the background — returns a promise that resolves
        // when the stream ends or is aborted
        port.readable.pipeTo(sink, { signal: abortController.signal }).catch((err: Error) => {
            // AbortError is expected when we disconnect
            if (err.name !== "AbortError") {
                console.warn("[WebSerial] Pipe ended:", err.message);
            }
            handleStreamEnd();
        });

        // Start process timer (parse + flush at 10Hz)
        processTimer = setInterval(processAndFlush, 100);

        return { success: true, message: `Connected at ${baudRate} baud` };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
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
    // Abort the pipe first
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    // Small delay for pipe to clean up
    await new Promise(r => setTimeout(r, 100));
    await cleanup();
    useTelemetryStore.getState().resetState();
}

function handleStreamEnd() {
    if (isConnected) {
        console.warn("[WebSerial] Stream ended unexpectedly");
        isConnected = false;
        if (processTimer) {
            clearInterval(processTimer);
            processTimer = null;
        }
        useTelemetryStore.getState().resetState();
    }
}

async function cleanup() {
    isConnected = false;

    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    if (processTimer) {
        clearInterval(processTimer);
        processTimer = null;
    }
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

// ─── Process + Flush (100ms timer) ─────────────────────────

function processAndFlush() {
    if (!isConnected) return;

    // Drain chunks
    if (rawChunks.length > 0) {
        const chunks = rawChunks;
        rawChunks = [];
        for (const chunk of chunks) {
            const space = mavBuf.length - mavLen;
            if (chunk.length <= space) {
                mavBuf.set(chunk, mavLen);
                mavLen += chunk.length;
            } else {
                // Buffer full — reset
                mavLen = 0;
                if (chunk.length <= mavBuf.length) {
                    mavBuf.set(chunk, 0);
                    mavLen = chunk.length;
                }
            }
        }
    }

    // Parse MAVLink
    if (mavLen > 0) {
        mavLen = parseFrames(mavBuf, mavLen);
    }

    // Flush to React
    if (hasPending) {
        useTelemetryStore.getState().updateState(pending);
        pending = {};
        hasPending = false;
    }
}

// ─── MAVLink Parser ────────────────────────────────────────

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
