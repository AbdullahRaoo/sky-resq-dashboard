/**
 * Sky ResQ Dashboard — Electron Main Process
 *
 * Creates a frameless BrowserWindow that loads the Next.js app.
 * Handles native serial telemetry via IPC to the renderer.
 */

const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");

// Load .env early so child modules (mavlink, sar_pipeline, payload_service)
// see the same configuration. dotenv is already a runtime dep.
try {
    require("dotenv").config({ path: path.join(__dirname, ".env") });
} catch { /* dotenv is optional at runtime */ }

let mainWindow = null;

/** @type {import('./electron/mavlink') | null} */
let mavlinkHandler = null;
/** @type {import('./electron/sar_pipeline') | null} */
let sarPipeline = null;
/** @type {import('./electron/payload_service') | null} */
let payloadService = null;
/** @type {import('./electron/link_router') | null} */
let linkRouter = null;

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        width: Math.min(1440, width),
        height: Math.min(900, height),
        minWidth: 1024,
        minHeight: 700,
        frame: false,
        fullscreen: true,
        backgroundColor: "#0a0e17",
        icon: path.join(__dirname, "public", "favicon.ico"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        show: false,
    });

    // Load Next.js dev server
    mainWindow.loadURL("http://localhost:3000");

    // Show fullscreen when ready
    mainWindow.once("ready-to-show", () => {
        mainWindow.show();
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });

    // Initialize MAVLink handler (deferred — window opens first)
    try {
        const { MAVLinkHandler } = require("./electron/mavlink");
        mavlinkHandler = new MAVLinkHandler(mainWindow);
        console.log("[Main] MAVLink handler initialized");
    } catch (err) {
        console.error("[Main] Failed to initialize MAVLink handler:", err.message);
        console.error("[Main] Serial telemetry will be unavailable");
    }

    // Initialize payload service first so the SAR pipeline can feed it.
    try {
        if (mavlinkHandler) {
            const { PayloadService } = require("./electron/payload_service");
            payloadService = new PayloadService(mainWindow, mavlinkHandler);
            payloadService.start();
            mavlinkHandler.setPayloadService(payloadService);
            console.log("[Main] Payload service initialized");
        }
    } catch (err) {
        console.error("[Main] Failed to initialize payload service:", err.message);
    }

    // Initialize link router (UDP MAVLink mirror + 4G/SiK failover)
    try {
        if (mavlinkHandler) {
            const { LinkRouter } = require("./electron/link_router");
            linkRouter = new LinkRouter(mainWindow, mavlinkHandler);
            linkRouter.start();
            mavlinkHandler.setLinkRouter(linkRouter);
            console.log("[Main] Link router initialized");
        }
    } catch (err) {
        console.error("[Main] Failed to initialize link router:", err.message);
    }

    // Initialize SAR pipeline (UDP receiver + mock generator)
    try {
        const { SarPipeline } = require("./electron/sar_pipeline");
        sarPipeline = new SarPipeline(mainWindow, {
            getDronePosition: () => {
                if (!mavlinkHandler) return null;
                const pos = mavlinkHandler.getCurrentPosition?.();
                return pos && (pos.lat !== 0 || pos.lon !== 0) ? pos : null;
            },
            onDetectionTick: (ts) => {
                if (payloadService) payloadService.noteDetection(ts);
            },
        });
        sarPipeline.start();
        console.log("[Main] SAR pipeline initialized");
    } catch (err) {
        console.error("[Main] Failed to initialize SAR pipeline:", err.message);
    }

    // ── IPC Handlers ──────────────────────────────────────────

    // Window controls (frameless)
    ipcMain.on("window-minimize", () => mainWindow?.minimize());
    ipcMain.on("window-maximize", () => {
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow?.maximize();
        }
    });
    ipcMain.on("window-close", () => mainWindow?.close());

    // Connection
    ipcMain.handle("mavlink-connect", async (_event, config) => {
        return mavlinkHandler.connect(config.connection_string, config.baud_rate);
    });

    ipcMain.handle("mavlink-disconnect", async () => {
        return mavlinkHandler.disconnect();
    });

    // Commands
    ipcMain.handle("mavlink-arm", async () => {
        return mavlinkHandler.arm();
    });

    ipcMain.handle("mavlink-disarm", async () => {
        return mavlinkHandler.disarm();
    });

    ipcMain.handle("mavlink-set-mode", async (_event, modeName) => {
        return mavlinkHandler.setMode(modeName);
    });

    // Profiles
    ipcMain.handle("get-connection-profiles", async () => {
        if (!mavlinkHandler) return [];
        return mavlinkHandler.getConnectionProfiles();
    });

    ipcMain.handle("mavlink-list-serial-ports", async () => {
        if (!mavlinkHandler) return [];
        return mavlinkHandler.listSerialPorts();
    });

    // ── Mission Commands ──────────────────────────────────────

    ipcMain.handle("mavlink-upload-mission", async (_event, waypoints) => {
        if (!mavlinkHandler) return { success: false, message: "No MAVLink handler" };
        const wps = Array.isArray(waypoints) ? waypoints : [];
        console.log(`[Main] Mission upload: ${wps.length} waypoints`);
        return mavlinkHandler.uploadMission(wps);
    });

    ipcMain.handle("mavlink-clear-mission", async () => {
        if (!mavlinkHandler) return { success: false, message: "No MAVLink handler" };
        // An empty MISSION_COUNT clears the FC's onboard mission.
        return mavlinkHandler.uploadMission([]).catch((err) => ({
            success: false,
            message: err?.message || "Clear failed",
        })).then((res) => res.success ? { success: true, message: "Mission cleared" } : res);
    });

    ipcMain.handle("mavlink-fly-to", async (_event, { lat, lon, alt }) => {
        if (!mavlinkHandler) return { success: false, message: "No MAVLink handler" };
        const a = Number(alt);
        const safeAlt = Number.isFinite(a) ? a : 0;
        console.log(`[Main] Fly-to: ${lat}, ${lon} @ ${safeAlt}m`);
        return mavlinkHandler.flyTo(lat, lon, safeAlt);
    });

    ipcMain.handle("mavlink-set-gimbal", async (_event, { pitch, yaw }) => {
        if (!mavlinkHandler) return { success: false, message: "No MAVLink handler" };
        return mavlinkHandler.setGimbalAngle(pitch, yaw);
    });

    ipcMain.handle("mavlink-set-active-link", async (_event, mode) => {
        if (!linkRouter) return { success: false, message: "Link router unavailable" };
        return linkRouter.setForced(mode);
    });

    // ── Payload ───────────────────────────────────────────────

    ipcMain.handle("mavlink-deploy-payload", async (_event, options) => {
        if (!mavlinkHandler) return { success: false, message: "No MAVLink handler" };
        return mavlinkHandler.deployPayload(options || {});
    });

    ipcMain.handle("mavlink-set-payload-policy", async (_event, policy) => {
        if (!mavlinkHandler) return { success: false, message: "No MAVLink handler" };
        return mavlinkHandler.setAutoDropPolicy(policy);
    });

    ipcMain.handle("mavlink-reset-mission", async () => {
        if (payloadService) payloadService.resetMissionFlags();
        console.log("[Main] Mission reset (payload flags cleared)");
        return { success: true, message: "Mission reset" };
    });

    ipcMain.handle("mavlink-get-payload-state", async () => {
        if (!mavlinkHandler) return null;
        return mavlinkHandler.getPayloadState();
    });

    // Simple toggle path: dashboard -> MAV_CMD_USER_1 -> Pi GPIO 16 servo.
    // Bypasses the auto-drop FSM; intended for bench/manual operation.
    ipcMain.handle("mavlink-payload-toggle", async (_event, action) => {
        if (!mavlinkHandler) return { success: false, message: "No MAVLink handler" };
        return mavlinkHandler.sendPayloadCommand(action || "toggle");
    });

    ipcMain.handle("mavlink-get-payload-open", async () => {
        if (!mavlinkHandler) return false;
        return mavlinkHandler.getPayloadOpen();
    });

    // SAR mission engage/disengage (Pi sar_orchestrator kill-switch)
    ipcMain.handle("mavlink-mission-enable", async (_event, enable) => {
        if (!mavlinkHandler) return { success: false, message: "No MAVLink handler" };
        return mavlinkHandler.sendMissionEnable(!!enable);
    });
}

// ── App Lifecycle ───────────────────────────────────────────

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
    if (linkRouter) linkRouter.stop();
    if (payloadService) payloadService.stop();
    if (sarPipeline) sarPipeline.stop();
    if (mavlinkHandler) mavlinkHandler.destroy();
    app.quit();
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
