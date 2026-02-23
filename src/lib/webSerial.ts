/**
 * Web Serial Service — browser-based SiK radio connection.
 * Uses the Web Serial API (Chrome/Edge only) to connect directly
 * to a USB serial device from the browser without Electron.
 *
 * This enables the GCS to work when deployed to Vercel or any web host
 * for SiK radio connections (serial over USB).
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
 * The browser will show a permission dialog.
 */
export async function webSerialConnect(baudRate: number): Promise<{ success: boolean; message: string }> {
    if (!isWebSerialAvailable()) {
        return {
            success: false,
            message: "Web Serial API not available. Use Chrome or Edge browser.",
        };
    }

    try {
        // Prompt user to select a serial port
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        port = await (navigator as any).serial.requestPort();
        await port.open({ baudRate });

        const store = useTelemetryStore.getState();
        store.updateState({ connected: true } as never);

        // Start reading
        keepReading = true;
        readLoop();

        return { success: true, message: `Connected at ${baudRate} baud` };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        // User cancelled the port picker or port failed to open
        if (msg.includes("No port selected")) {
            return { success: false, message: "No serial port selected" };
        }
        return { success: false, message: `Connection failed: ${msg}` };
    }
}

/**
 * Disconnect and close the serial port.
 */
export async function webSerialDisconnect(): Promise<void> {
    keepReading = false;

    if (reader) {
        try {
            await reader.cancel();
        } catch { /* ignore */ }
        reader = null;
    }

    if (port) {
        try {
            await port.close();
        } catch { /* ignore */ }
        port = null;
    }

    const store = useTelemetryStore.getState();
    store.resetState();
}

/**
 * Continuous read loop — reads raw MAVLink bytes from the serial port.
 * Parses enough of the MAVLink stream to extract basic telemetry.
 *
 * Note: Full MAVLink v2 parsing is complex. This is a simplified parser
 * that looks for HEARTBEAT and basic message IDs. For production use,
 * a proper MAVLink parser library should be integrated.
 */
async function readLoop() {
    if (!port?.readable) return;

    const buffer: number[] = [];

    while (keepReading && port.readable) {
        try {
            reader = port.readable.getReader();

            while (keepReading && reader) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) {
                    // Accumulate bytes
                    for (let i = 0; i < value.length; i++) {
                        buffer.push(value[i]);
                    }

                    // Try to parse MAVLink frames from buffer
                    parseMavlinkBuffer(buffer);
                }
            }
        } catch (err) {
            if (keepReading) {
                console.error("[WebSerial] Read error:", err);
            }
        } finally {
            if (reader) {
                try {
                    reader.releaseLock();
                } catch { /* ignore */ }
                reader = null;
            }
        }
    }
}

/**
 * Send raw bytes over the serial port.
 * Used for sending MAVLink commands (heartbeat, arm, mode change, etc.)
 */
export async function webSerialSend(data: Uint8Array): Promise<void> {
    if (!port?.writable) return;
    const writer = port.writable.getWriter();
    try {
        await writer.write(data);
    } finally {
        writer.releaseLock();
    }
}

/**
 * Simplified MAVLink v2 buffer parser.
 * Looks for MAVLink v2 start byte (0xFD) and extracts message ID + payload.
 *
 * This is a basic implementation that extracts HEARTBEAT (msg_id=0),
 * GLOBAL_POSITION_INT (33), ATTITUDE (30), VFR_HUD (74),
 * SYS_STATUS (1), GPS_RAW_INT (24), and STATUSTEXT (253).
 */
function parseMavlinkBuffer(buffer: number[]) {
    const store = useTelemetryStore.getState();

    while (buffer.length >= 12) {
        // Find MAVLink v2 start byte
        const startIdx = buffer.indexOf(0xfd);
        if (startIdx === -1) {
            buffer.length = 0;
            return;
        }
        if (startIdx > 0) {
            buffer.splice(0, startIdx);
        }

        // MAVLink v2 header: 10 bytes + payload_len + 2 CRC
        if (buffer.length < 12) return;

        const payloadLen = buffer[1];
        const frameLen = 12 + payloadLen;
        if (buffer.length < frameLen) return;

        // Extract message ID (3 bytes, little-endian, but typically < 256)
        const msgId = buffer[7] | (buffer[8] << 8) | (buffer[9] << 16);
        const payload = buffer.slice(10, 10 + payloadLen);

        // Parse known messages
        try {
            switch (msgId) {
                case 0: // HEARTBEAT
                    parseHeartbeat(payload, store);
                    break;
                case 1: // SYS_STATUS
                    parseSysStatus(payload, store);
                    break;
                case 24: // GPS_RAW_INT
                    parseGpsRawInt(payload, store);
                    break;
                case 30: // ATTITUDE
                    parseAttitude(payload, store);
                    break;
                case 33: // GLOBAL_POSITION_INT
                    parseGlobalPositionInt(payload, store);
                    break;
                case 74: // VFR_HUD
                    parseVfrHud(payload, store);
                    break;
                case 253: // STATUSTEXT
                    parseStatusText(payload, store);
                    break;
            }
        } catch {
            // Skip malformed messages
        }

        buffer.splice(0, frameLen);
    }
}

// ─── Individual Message Parsers ────────────────────────────

function readInt32LE(data: number[], offset: number): number {
    return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
}

function readUint16LE(data: number[], offset: number): number {
    return data[offset] | (data[offset + 1] << 8);
}

function readInt16LE(data: number[], offset: number): number {
    const val = readUint16LE(data, offset);
    return val > 0x7fff ? val - 0x10000 : val;
}

function readFloatLE(data: number[], offset: number): number {
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    view.setUint8(0, data[offset]);
    view.setUint8(1, data[offset + 1]);
    view.setUint8(2, data[offset + 2]);
    view.setUint8(3, data[offset + 3]);
    return view.getFloat32(0, true);
}

const FLIGHT_MODES: Record<number, string> = {
    0: "STABILIZE", 2: "ALT_HOLD", 3: "AUTO", 4: "GUIDED",
    5: "LOITER", 6: "RTL", 9: "LAND", 16: "POSHOLD",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseHeartbeat(p: number[], store: any) {
    if (p.length < 9) return;
    const customMode = readInt32LE(p, 0);
    const baseMode = p[6];
    const armed = !!(baseMode & 0x80);
    const mode = FLIGHT_MODES[customMode] || `MODE_${customMode}`;
    store.updateState({
        connected: true,
        heartbeat: { flight_mode: mode, armed, system_status: p[7] },
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSysStatus(p: number[], store: any) {
    if (p.length < 31) return;
    const voltage = readUint16LE(p, 14) / 1000; // mV → V
    const current = readInt16LE(p, 16) / 100;    // cA → A
    const remaining = p[30];                      // %
    store.updateState({
        battery: { voltage, current, remaining: remaining === 255 ? -1 : remaining },
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGpsRawInt(p: number[], store: any) {
    if (p.length < 30) return;
    const fixType = p[28];
    const sats = p[29];
    store.updateState({
        gps: { fix_type: fixType, satellites_visible: sats },
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseAttitude(p: number[], store: any) {
    if (p.length < 28) return;
    const roll = readFloatLE(p, 4) * (180 / Math.PI);
    const pitch = readFloatLE(p, 8) * (180 / Math.PI);
    const yaw = readFloatLE(p, 12) * (180 / Math.PI);
    store.updateState({
        attitude: { roll, pitch, yaw },
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGlobalPositionInt(p: number[], store: any) {
    if (p.length < 28) return;
    const lat = readInt32LE(p, 4) / 1e7;
    const lon = readInt32LE(p, 8) / 1e7;
    const alt = readInt32LE(p, 12) / 1000;
    const relAlt = readInt32LE(p, 16) / 1000;
    store.updateState({
        position: { lat, lon, alt, relative_alt: relAlt },
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseVfrHud(p: number[], store: any) {
    if (p.length < 20) return;
    const airspeed = readFloatLE(p, 0);
    const groundspeed = readFloatLE(p, 4);
    const heading = readInt16LE(p, 8);
    const throttle = readUint16LE(p, 10);
    const alt = readFloatLE(p, 12);
    const climb = readFloatLE(p, 16);
    store.updateState({
        vfr_hud: { airspeed, groundspeed, heading, throttle, alt, climb },
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseStatusText(p: number[], store: any) {
    if (p.length < 2) return;
    // severity = p[0], text starts at p[1]
    const textBytes = p.slice(1).filter((b) => b !== 0);
    const text = String.fromCharCode(...textBytes);
    if (text.length > 0) {
        store.updateState({ status_text: text });
    }
}
