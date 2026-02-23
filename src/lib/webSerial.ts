/**
 * Web Serial Service — browser-based SiK radio connection.
 *
 * ROOT-CAUSE ARCHITECTURE:
 * ========================
 * Chrome's Web Serial API throws `BufferOverrunError` when the internal
 * buffer fills up before `reader.read()` is called. This permanently errors
 * the ReadableStream — it cannot be reused.
 *
 * At 57600 baud (~5.7 KB/s), even a 256KB buffer overruns if there's ANY
 * delay between reads (parsing, React renders, GC pauses, etc.)
 *
 * SOLUTION: Three-layer architecture:
 *
 * Layer 1 — READ LOOP (fastest possible)
 *   reader.read() → copy bytes to shared ArrayBuffer → reader.read()
 *   Does ZERO processing. Just copies bytes. Maximum throughput.
 *
 * Layer 2 — PARSE TIMER (every 100ms)
 *   Takes a snapshot of the raw buffer, parses MAVLink frames,
 *   accumulates results into a plain JS object (no React).
 *
 * Layer 3 — FLUSH TO REACT (every 100ms, after parse)
 *   Sends one batched update to Zustand store → single React re-render.
 *
 * RECOVERY: On BufferOverrunError, auto-close and reopen the port.
 */

import { useTelemetryStore } from "@/store/telemetryStore";

// ─── State ─────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let port: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let reader: any = null;
let keepReading = false;
let processTimer: ReturnType<typeof setInterval> | null = null;
let activeBaudRate = 57600;

// Shared raw buffer — written by read loop, consumed by parse timer
const RAW_CAPACITY = 131072; // 128KB
const rawBuf = new Uint8Array(RAW_CAPACITY);
let rawWritePos = 0;    // written by read loop
let rawReadPos = 0;     // read by parse timer

// Pending telemetry — accumulated by parser, flushed to React
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pending: any = {};
let hasPending = false;

// MAVLink reassembly buffer
const mavBuf = new Uint8Array(8192);
let mavLen = 0;

// ─── Public API ────────────────────────────────────────────

export function isWebSerialAvailable(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
}

export function isElectron(): boolean {
    return typeof window !== "undefined" && !!window.electron;
}

export async function webSerialConnect(baudRate: number): Promise<{ success: boolean; message: string }> {
    if (!isWebSerialAvailable()) {
        return { success: false, message: "Web Serial API not available. Use Chrome or Edge." };
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        port = await (navigator as any).serial.requestPort();
        activeBaudRate = baudRate;

        // Open with largest practical buffer
        await port.open({ baudRate, bufferSize: 65536 });

        // Reset buffers
        rawWritePos = 0;
        rawReadPos = 0;
        mavLen = 0;
        pending = {};
        hasPending = false;
        keepReading = true;

        // CRITICAL: get reader IMMEDIATELY — minimize gap after open
        reader = port.readable.getReader();

        // Start process timer BEFORE read loop — ready to consume
        processTimer = setInterval(processAndFlush, 100);

        // Start read loop (non-blocking, returns immediately)
        readLoop();

        useTelemetryStore.getState().updateState({ connected: true });
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
    keepReading = false;
    stopTimers();
    await releasePort();
    rawWritePos = 0;
    rawReadPos = 0;
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

// ─── Layer 1: Read Loop (fastest possible) ─────────────────

/**
 * Tight read loop. Does ZERO processing — only copies bytes to the
 * shared ring buffer. This ensures reader.read() is called as fast
 * as possible with no synchronous work in between.
 */
async function readLoop() {
    while (keepReading) {
        try {
            // If reader was lost (e.g., after error recovery), recreate
            if (!reader && port?.readable) {
                reader = port.readable.getReader();
            }
            if (!reader) {
                await sleep(100);
                continue;
            }

            // TIGHT LOOP: read → copy → read → copy
            while (keepReading && reader) {
                const { value, done } = await reader.read();
                if (done) break;
                if (!value || value.length === 0) continue;

                // Copy to ring buffer (wrap around if needed)
                const len = value.length;
                const space = RAW_CAPACITY - rawWritePos;

                if (len <= space) {
                    rawBuf.set(value, rawWritePos);
                    rawWritePos += len;
                } else {
                    // Wrap: write what fits, then restart from 0
                    rawBuf.set(value.subarray(0, space), rawWritePos);
                    rawBuf.set(value.subarray(space), 0);
                    rawWritePos = len - space;
                }
            }
        } catch (err) {
            if (!keepReading) return;

            const msg = err instanceof Error ? err.message : String(err);
            console.warn("[WebSerial] Stream error:", msg);

            // Release the dead reader
            if (reader) {
                try { reader.releaseLock(); } catch { /* */ }
                reader = null;
            }

            // BufferOverrunError = stream is dead. Must reopen port.
            if (msg.includes("Buffer overrun") || msg.includes("BufferOverrun")) {
                console.log("[WebSerial] Recovering: reopening port...");
                await reopenPort();
            } else {
                await sleep(200);
            }
        }
    }
}

/**
 * Close and reopen the port after a fatal stream error.
 * Preserves the user's selected port — no need to re-pick.
 */
async function reopenPort() {
    if (!port) return;

    // Close the broken port
    try { await port.close(); } catch { /* already closed */ }

    // Small delay for OS to release the port
    await sleep(300);

    // Reopen with same settings
    try {
        await port.open({ baudRate: activeBaudRate, bufferSize: 65536 });
        rawWritePos = 0;
        rawReadPos = 0;
        mavLen = 0;

        // Get fresh reader immediately
        reader = port.readable.getReader();
        console.log("[WebSerial] Port reopened successfully");
    } catch (err) {
        console.error("[WebSerial] Reopen failed:", err);
        await sleep(1000);
    }
}

// ─── Layer 2 + 3: Process and Flush (100ms timer) ──────────

/**
 * Called every 100ms by setInterval.
 * 1. Drains raw bytes from the ring buffer into the MAVLink reassembly buffer
 * 2. Parses complete MAVLink frames → writes to `pending`
 * 3. Flushes `pending` to Zustand store (triggers one React re-render)
 */
function processAndFlush() {
    // Step 1: Drain raw ring buffer into MAVLink buffer
    drainRawBuffer();

    // Step 2: Parse complete MAVLink frames
    if (mavLen > 0) {
        mavLen = parseFrames(mavBuf, mavLen);
    }

    // Step 3: Flush pending telemetry to React
    if (hasPending) {
        useTelemetryStore.getState().updateState(pending);
        pending = {};
        hasPending = false;
    }
}

/**
 * Copy available bytes from the ring buffer into the linear MAVLink buffer.
 */
function drainRawBuffer() {
    let rp = rawReadPos;
    const wp = rawWritePos;

    if (rp === wp) return; // nothing new

    // Calculate how many bytes are available
    let available: number;
    if (wp >= rp) {
        available = wp - rp;
    } else {
        available = (RAW_CAPACITY - rp) + wp;
    }

    // Cap to available space in MAVLink buffer
    const space = mavBuf.length - mavLen;
    if (available > space) {
        // Too much data — skip oldest, jump read pointer forward
        const skip = available - space;
        rp = (rp + skip) % RAW_CAPACITY;
        available = space;
    }

    // Copy from ring buffer to MAVLink buffer
    if (rp + available <= RAW_CAPACITY) {
        // Contiguous region
        mavBuf.set(rawBuf.subarray(rp, rp + available), mavLen);
    } else {
        // Wraps around
        const firstChunk = RAW_CAPACITY - rp;
        mavBuf.set(rawBuf.subarray(rp, RAW_CAPACITY), mavLen);
        mavBuf.set(rawBuf.subarray(0, available - firstChunk), mavLen + firstChunk);
    }

    mavLen += available;
    rawReadPos = (rp + available) % RAW_CAPACITY;
}

// ─── MAVLink Frame Parser ──────────────────────────────────

const MV1 = 0xfe;
const MV2 = 0xfd;

function parseFrames(buf: Uint8Array, len: number): number {
    let pos = 0;

    while (pos < len) {
        while (pos < len && buf[pos] !== MV2 && buf[pos] !== MV1) pos++;
        if (pos >= len) break;

        const isV2 = buf[pos] === MV2;
        const hdrLen = isV2 ? 10 : 6;

        if (pos + hdrLen + 2 > len) break;

        const plen = buf[pos + 1];
        const frameLen = hdrLen + plen + 2;
        if (pos + frameLen > len) break;

        const msgId = isV2
            ? (buf[pos + 7] | (buf[pos + 8] << 8) | (buf[pos + 9] << 16))
            : buf[pos + 5];

        const o = pos + hdrLen;

        try {
            switch (msgId) {
                case 0: if (plen >= 9) msg_hb(buf, o); break;
                case 1: if (plen >= 31) msg_ss(buf, o); break;
                case 24: if (plen >= 30) msg_gps(buf, o); break;
                case 30: if (plen >= 28) msg_att(buf, o); break;
                case 33: if (plen >= 28) msg_gpi(buf, o); break;
                case 74: if (plen >= 20) msg_vfr(buf, o); break;
                case 253: if (plen >= 2) msg_stx(buf, o, plen); break;
            }
        } catch { /* skip */ }

        pos += frameLen;
    }

    if (pos > 0 && pos < len) buf.copyWithin(0, pos, len);
    return len - pos;
}

// ─── Binary readers ────────────────────────────────────────

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

// ─── Message handlers (write to `pending`) ─────────────────

function msg_hb(d: Uint8Array, o: number) {
    const cm = i32(d, o);
    pending.connected = true;
    pending.heartbeat = { flight_mode: MODES[cm] || `MODE_${cm}`, armed: !!(d[o + 6] & 0x80), system_status: d[o + 7] };
    hasPending = true;
}

function msg_ss(d: Uint8Array, o: number) {
    const rem = d[o + 30];
    pending.battery = { voltage: u16(d, o + 14) / 1000, current: i16(d, o + 16) / 100, remaining: rem === 255 ? -1 : rem };
    hasPending = true;
}

function msg_gps(d: Uint8Array, o: number) {
    pending.gps = { fix_type: d[o + 28], satellites_visible: d[o + 29] };
    hasPending = true;
}

function msg_att(d: Uint8Array, o: number) {
    const r2d = 180 / Math.PI;
    pending.attitude = { roll: f32(d, o + 4) * r2d, pitch: f32(d, o + 8) * r2d, yaw: f32(d, o + 12) * r2d };
    hasPending = true;
}

function msg_gpi(d: Uint8Array, o: number) {
    pending.position = { lat: i32(d, o + 4) / 1e7, lon: i32(d, o + 8) / 1e7, alt: i32(d, o + 12) / 1000, relative_alt: i32(d, o + 16) / 1000 };
    hasPending = true;
}

function msg_vfr(d: Uint8Array, o: number) {
    pending.vfr_hud = { airspeed: f32(d, o), groundspeed: f32(d, o + 4), heading: i16(d, o + 8), throttle: u16(d, o + 10), alt: f32(d, o + 12), climb: f32(d, o + 16) };
    hasPending = true;
}

function msg_stx(d: Uint8Array, o: number, plen: number) {
    let end = o + 1;
    const limit = o + plen;
    while (end < limit && d[end] !== 0) end++;
    const text = String.fromCharCode(...d.subarray(o + 1, end));
    if (text.length > 0) { pending.status_text = text; hasPending = true; }
}

// ─── Helpers ───────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function stopTimers() {
    if (processTimer) { clearInterval(processTimer); processTimer = null; }
}

async function releasePort() {
    if (reader) {
        try { reader.releaseLock(); } catch { /* */ }
        reader = null;
    }
    if (port) {
        try { await port.close(); } catch { /* */ }
        port = null;
    }
}
