/**
 * Web Serial Service — browser-based SiK radio connection.
 *
 * ROOT CAUSE (finally identified):
 * ================================
 * Calling `store.updateState({ connected: true })` during webSerialConnect()
 * triggers a massive React re-render cascade (50+ component updates). This
 * blocks the single JavaScript thread for 1-2+ seconds. During this time,
 * `reader.read()` cannot execute, the OS serial buffer fills up, and Chrome
 * throws BufferOverrunError which permanently kills the ReadableStream.
 *
 * SOLUTION:
 * - ZERO React updates during connection. Read loop starts FIRST.
 * - `connected: true` comes from the heartbeat parser 100ms later.
 * - Reader is obtained SYNCHRONOUSLY after port.open(), before anything else.
 * - Hardware flow control (RTS/CTS) tried first, falls back to none.
 * - If overrun still occurs, auto-reopen with `flowControl: "hardware"`.
 */

import { useTelemetryStore } from "@/store/telemetryStore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let port: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let reader: any = null;
let keepReading = false;
let processTimer: ReturnType<typeof setInterval> | null = null;
let activeBaudRate = 57600;
let overrunCount = 0;

// Ring buffer for raw serial bytes
const RAW_CAP = 131072;
const rawBuf = new Uint8Array(RAW_CAP);
let rawWr = 0;
let rawRd = 0;

// MAVLink reassembly buffer
const mavBuf = new Uint8Array(8192);
let mavLen = 0;

// Pending telemetry (plain JS, NO React)
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
        activeBaudRate = baudRate;
        overrunCount = 0;

        // Try opening with hardware flow control first (SiK radios support RTS/CTS)
        const opened = await openPort(baudRate, true);
        if (!opened) {
            return { success: false, message: "Failed to open serial port" };
        }

        // *** CRITICAL: Do NOT call any React/store updates here! ***
        // The heartbeat parser will set connected: true on first heartbeat.
        // This prevents the React re-render cascade from blocking the read loop.

        return { success: true, message: `Connected at ${baudRate} baud` };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (msg.includes("No port selected") || msg.includes("cancelled")) {
            return { success: false, message: "No serial port selected" };
        }
        return { success: false, message: `Connection failed: ${msg}` };
    }
}

/**
 * Open (or reopen) the port with given settings.
 * Tries hardware flow control first, falls back to none.
 * Sets up reader and starts read loop + process timer.
 */
async function openPort(baudRate: number, tryHwFlow: boolean): Promise<boolean> {
    // Reset buffers
    rawWr = 0;
    rawRd = 0;
    mavLen = 0;
    pending = {};
    hasPending = false;
    keepReading = true;

    try {
        // Try with hardware flow control (prevents overrun at hardware level)
        await port.open({
            baudRate,
            bufferSize: 65536,
            flowControl: tryHwFlow ? "hardware" : "none",
        });
    } catch {
        if (tryHwFlow) {
            // Hardware flow control not supported, retry without
            try {
                await port.open({ baudRate, bufferSize: 65536, flowControl: "none" });
            } catch (e2) {
                console.error("[WebSerial] Open failed:", e2);
                return false;
            }
        } else {
            return false;
        }
    }

    // *** CRITICAL: Get reader IMMEDIATELY — synchronously after open ***
    // No other statements between open() and getReader()
    reader = port.readable.getReader();

    // Start process timer (parses + flushes at 10Hz)
    if (!processTimer) {
        processTimer = setInterval(processAndFlush, 100);
    }

    // Start read loop (async, returns immediately)
    readLoop();

    return true;
}

export async function webSerialDisconnect(): Promise<void> {
    keepReading = false;

    if (processTimer) {
        clearInterval(processTimer);
        processTimer = null;
    }
    if (reader) {
        try { reader.releaseLock(); } catch { /* */ }
        reader = null;
    }
    if (port) {
        try { await port.close(); } catch { /* */ }
        port = null;
    }

    rawWr = 0;
    rawRd = 0;
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

// ─── Layer 1: Read Loop (absolute minimum work) ────────────

async function readLoop() {
    while (keepReading) {
        try {
            if (!reader && port?.readable) {
                reader = port.readable.getReader();
            }
            if (!reader) {
                await sleep(50);
                continue;
            }

            // TIGHT LOOP: read → copy to ring buf → read
            // Zero processing, zero state updates, zero React.
            while (keepReading && reader) {
                const result = await reader.read();
                if (result.done) break;
                const chunk = result.value;
                if (!chunk || chunk.length === 0) continue;

                // Write to ring buffer (simple overwrite-oldest strategy)
                const n = chunk.length;
                if (n >= RAW_CAP) {
                    // Chunk larger than buffer — just keep the tail
                    rawBuf.set(chunk.subarray(n - RAW_CAP), 0);
                    rawWr = 0;
                    rawRd = 0;
                } else {
                    const end = rawWr + n;
                    if (end <= RAW_CAP) {
                        rawBuf.set(chunk, rawWr);
                    } else {
                        const first = RAW_CAP - rawWr;
                        rawBuf.set(chunk.subarray(0, first), rawWr);
                        rawBuf.set(chunk.subarray(first), 0);
                    }
                    rawWr = end % RAW_CAP;
                }
            }
        } catch (err) {
            if (!keepReading) return;

            const msg = err instanceof Error ? err.message : String(err);

            // Release dead reader
            if (reader) {
                try { reader.releaseLock(); } catch { /* */ }
                reader = null;
            }

            if (msg.includes("overrun") || msg.includes("Overrun")) {
                overrunCount++;
                console.warn(`[WebSerial] Buffer overrun #${overrunCount}, reopening...`);

                // Close the broken port
                try { await port.close(); } catch { /* */ }
                await sleep(200);

                // Reopen — on repeated overruns, force no flow control
                // (some USB-serial adapters don't handle HW flow well)
                const useHwFlow = overrunCount <= 1;
                const ok = await openPort(activeBaudRate, useHwFlow);
                if (!ok) {
                    console.error("[WebSerial] Reopen failed, stopping");
                    keepReading = false;
                    return;
                }
                return; // openPort() starts a new readLoop()
            } else {
                console.warn("[WebSerial] Read error:", msg);
                await sleep(100);
            }
        }
    }
}

// ─── Layer 2+3: Process and Flush (100ms timer) ────────────

function processAndFlush() {
    if (!keepReading) return;

    // Drain ring buffer → MAVLink reassembly buffer
    drainRing();

    // Parse MAVLink frames → pending
    if (mavLen > 0) {
        mavLen = parseFrames(mavBuf, mavLen);
    }

    // Flush to React (single batch update)
    if (hasPending) {
        useTelemetryStore.getState().updateState(pending);
        pending = {};
        hasPending = false;
    }
}

function drainRing() {
    const wr = rawWr;
    const rd = rawRd;
    if (wr === rd) return;

    let avail: number;
    if (wr >= rd) {
        avail = wr - rd;
    } else {
        avail = (RAW_CAP - rd) + wr;
    }

    // Cap to available space in MAVLink buffer
    const space = mavBuf.length - mavLen;
    let toRead = Math.min(avail, space);
    if (toRead <= 0) {
        // MAVLink buffer full — skip oldest raw data
        rawRd = wr;
        mavLen = 0; // reset MAVLink buffer
        return;
    }

    let rd2 = rd;
    if (rd2 + toRead <= RAW_CAP) {
        mavBuf.set(rawBuf.subarray(rd2, rd2 + toRead), mavLen);
    } else {
        const first = RAW_CAP - rd2;
        mavBuf.set(rawBuf.subarray(rd2, RAW_CAP), mavLen);
        mavBuf.set(rawBuf.subarray(0, toRead - first), mavLen + first);
    }
    mavLen += toRead;
    rawRd = (rd2 + toRead) % RAW_CAP;
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

// ─── Message handlers → pending ────────────────────────────

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

// ─── Util ──────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
