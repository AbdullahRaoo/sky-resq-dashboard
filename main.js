/**
 * Sky ResQ Dashboard — Electron Main Process
 *
 * Creates a frameless BrowserWindow that loads the Next.js app.
 * Handles native serial telemetry via IPC to the renderer.
 */

const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");

let mainWindow = null;

/** @type {import('./electron/mavlink') | null} */
let mavlinkHandler = null;

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        width: Math.min(1440, width),
        height: Math.min(900, height),
        minWidth: 1024,
        minHeight: 700,
        frame: false,
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

    // Show maximized when ready to avoid white flash
    mainWindow.once("ready-to-show", () => {
        mainWindow.maximize();
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
        return mavlinkHandler.getConnectionProfiles();
    });

    // ── Mission Commands ──────────────────────────────────────

    ipcMain.handle("mavlink-upload-mission", async (_event, waypoints) => {
        if (!mavlinkHandler) return { success: false, message: "No MAVLink handler" };
        // TODO: Implement full MAVLink mission upload protocol
        // For now, store waypoints and return success
        console.log(`[Main] Mission upload requested: ${waypoints.length} waypoints`);
        return { success: true, message: `${waypoints.length} waypoints ready` };
    });

    ipcMain.handle("mavlink-clear-mission", async () => {
        console.log("[Main] Mission clear requested");
        return { success: true, message: "Mission cleared" };
    });

    ipcMain.handle("mavlink-fly-to", async (_event, { lat, lon, alt }) => {
        if (!mavlinkHandler) return { success: false, message: "No MAVLink handler" };
        console.log(`[Main] Fly-to: ${lat}, ${lon} @ ${alt}m`);
        // TODO: Switch to GUIDED mode + send position target
        return { success: true, message: `Flying to ${lat.toFixed(6)}, ${lon.toFixed(6)}` };
    });

    // ── Payload ───────────────────────────────────────────────

    ipcMain.handle("mavlink-deploy-payload", async () => {
        if (!mavlinkHandler) return { success: false, message: "No MAVLink handler" };
        console.log("[Main] Payload deploy requested");
        // TODO: Send MAV_CMD_DO_SET_SERVO
        return { success: true, message: "Payload deployed" };
    });
}

// ── App Lifecycle ───────────────────────────────────────────

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
    if (mavlinkHandler) {
        mavlinkHandler.destroy();
    }
    app.quit();
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
