/**
 * SettingsDialog — comprehensive GCS settings popup.
 * Connection, mission defaults, failsafe, display, and controls.
 */

"use client";

import { useState } from "react";
import { useThemeStore } from "@/store/themeStore";

interface SettingsDialogProps {
    open: boolean;
    onClose: () => void;
}

type SettingsTab = "connection" | "mission" | "failsafe" | "display" | "about";

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
    const { theme, toggleTheme } = useThemeStore();
    const [tab, setTab] = useState<SettingsTab>("connection");

    // Local state for settings
    const [baudRate, setBaudRate] = useState(57600);
    const [comPort, setComPort] = useState("COM3");
    const [altitudeDefault, setAltitudeDefault] = useState(30);
    const [overlapDefault, setOverlapDefault] = useState(60);
    const [speedDefault, setSpeedDefault] = useState(5);
    const [rtlAlt, setRtlAlt] = useState(40);
    const [heartbeatTimeout, setHeartbeatTimeout] = useState(5);
    const [lowBatWarn, setLowBatWarn] = useState(30);
    const [critBatWarn, setCritBatWarn] = useState(15);
    const [servoChannel, setServoChannel] = useState(9);
    const [servoPwm, setServoPwm] = useState(1100);
    const [telemetryRate, setTelemetryRate] = useState(10);

    if (!open) return null;

    const TABS: { id: SettingsTab; label: string; icon: string }[] = [
        { id: "connection", label: "Connection", icon: "🔌" },
        { id: "mission", label: "Mission", icon: "🗺" },
        { id: "failsafe", label: "Failsafe", icon: "⚠" },
        { id: "display", label: "Display", icon: "🎨" },
        { id: "about", label: "About", icon: "ℹ" },
    ];

    return (
        <div className="settings-overlay" onClick={onClose}>
            <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="settings-header">
                    <div className="settings-header__title">⚙ Settings</div>
                    <button className="settings-header__close" onClick={onClose}>✕</button>
                </div>

                <div className="settings-body">
                    {/* Tab sidebar */}
                    <div className="settings-tabs">
                        {TABS.map((t) => (
                            <button
                                key={t.id}
                                className={`settings-tab ${tab === t.id ? "settings-tab--active" : ""}`}
                                onClick={() => setTab(t.id)}
                            >
                                <span className="settings-tab__icon">{t.icon}</span>
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab content */}
                    <div className="settings-content">
                        {/* ═══ CONNECTION ═══ */}
                        {tab === "connection" && (
                            <div className="settings-section">
                                <h3 className="settings-section__title">Serial Connection (SiK Radio)</h3>
                                <div className="settings-field">
                                    <label className="settings-label">COM Port</label>
                                    <input className="settings-input" value={comPort} onChange={(e) => setComPort(e.target.value)} />
                                </div>
                                <div className="settings-field">
                                    <label className="settings-label">Baud Rate</label>
                                    <select className="settings-input" value={baudRate} onChange={(e) => setBaudRate(Number(e.target.value))}>
                                        <option value={9600}>9600</option>
                                        <option value={57600}>57600</option>
                                        <option value={115200}>115200</option>
                                        <option value={921600}>921600</option>
                                    </select>
                                </div>
                                <div className="settings-field">
                                    <label className="settings-label">Telemetry Rate (Hz)</label>
                                    <input className="settings-input" type="number" min={1} max={50} value={telemetryRate}
                                        onChange={(e) => setTelemetryRate(Number(e.target.value))} />
                                </div>

                                <h3 className="settings-section__title">4G / LTE Network</h3>
                                <div className="settings-field">
                                    <label className="settings-label">Tailscale IP (Drone)</label>
                                    <input className="settings-input" placeholder="100.x.x.x" disabled />
                                    <span className="settings-hint">Configure via Tailscale admin panel</span>
                                </div>
                                <div className="settings-field">
                                    <label className="settings-label">MAVLink UDP Port</label>
                                    <input className="settings-input" type="number" value={14550} disabled />
                                </div>
                            </div>
                        )}

                        {/* ═══ MISSION ═══ */}
                        {tab === "mission" && (
                            <div className="settings-section">
                                <h3 className="settings-section__title">Survey Defaults</h3>
                                <div className="settings-row">
                                    <div className="settings-field">
                                        <label className="settings-label">Default Altitude (m)</label>
                                        <input className="settings-input" type="number" min={5} max={120}
                                            value={altitudeDefault} onChange={(e) => setAltitudeDefault(Number(e.target.value))} />
                                    </div>
                                    <div className="settings-field">
                                        <label className="settings-label">Default Overlap (%)</label>
                                        <input className="settings-input" type="number" min={10} max={90}
                                            value={overlapDefault} onChange={(e) => setOverlapDefault(Number(e.target.value))} />
                                    </div>
                                    <div className="settings-field">
                                        <label className="settings-label">Default Speed (m/s)</label>
                                        <input className="settings-input" type="number" min={1} max={15}
                                            value={speedDefault} onChange={(e) => setSpeedDefault(Number(e.target.value))} />
                                    </div>
                                </div>

                                <h3 className="settings-section__title">Payload Mechanism</h3>
                                <div className="settings-row">
                                    <div className="settings-field">
                                        <label className="settings-label">Servo Channel</label>
                                        <input className="settings-input" type="number" min={1} max={16}
                                            value={servoChannel} onChange={(e) => setServoChannel(Number(e.target.value))} />
                                    </div>
                                    <div className="settings-field">
                                        <label className="settings-label">Release PWM (µs)</label>
                                        <input className="settings-input" type="number" min={500} max={2500}
                                            value={servoPwm} onChange={(e) => setServoPwm(Number(e.target.value))} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ═══ FAILSAFE ═══ */}
                        {tab === "failsafe" && (
                            <div className="settings-section">
                                <h3 className="settings-section__title">GCS Heartbeat</h3>
                                <div className="settings-field">
                                    <label className="settings-label">Heartbeat Timeout (seconds)</label>
                                    <input className="settings-input" type="number" min={3} max={30}
                                        value={heartbeatTimeout} onChange={(e) => setHeartbeatTimeout(Number(e.target.value))} />
                                    <span className="settings-hint">Drone triggers RTL if no heartbeat for this duration</span>
                                </div>
                                <div className="settings-field">
                                    <label className="settings-label">RTL Altitude (m)</label>
                                    <input className="settings-input" type="number" min={10} max={100}
                                        value={rtlAlt} onChange={(e) => setRtlAlt(Number(e.target.value))} />
                                    <span className="settings-hint">Safe altitude for return-to-launch clearance</span>
                                </div>

                                <h3 className="settings-section__title">Battery Alerts</h3>
                                <div className="settings-row">
                                    <div className="settings-field">
                                        <label className="settings-label">Low Warning (%)</label>
                                        <input className="settings-input" type="number" min={10} max={50}
                                            value={lowBatWarn} onChange={(e) => setLowBatWarn(Number(e.target.value))} />
                                    </div>
                                    <div className="settings-field">
                                        <label className="settings-label">Critical Alert (%)</label>
                                        <input className="settings-input" type="number" min={5} max={25}
                                            value={critBatWarn} onChange={(e) => setCritBatWarn(Number(e.target.value))} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ═══ DISPLAY ═══ */}
                        {tab === "display" && (
                            <div className="settings-section">
                                <h3 className="settings-section__title">Theme</h3>
                                <div className="settings-theme-toggle">
                                    <button
                                        className={`settings-theme-btn ${theme === "dark" ? "settings-theme-btn--active" : ""}`}
                                        onClick={() => useThemeStore.getState().setTheme("dark")}
                                    >
                                        🌙 Dark
                                    </button>
                                    <button
                                        className={`settings-theme-btn ${theme === "light" ? "settings-theme-btn--active" : ""}`}
                                        onClick={() => useThemeStore.getState().setTheme("light")}
                                    >
                                        ☀ Light
                                    </button>
                                </div>

                                <h3 className="settings-section__title">Map</h3>
                                <div className="settings-field">
                                    <label className="settings-label">Default Map Style</label>
                                    <select className="settings-input">
                                        <option>CartoDB Dark</option>
                                        <option>OpenStreetMap</option>
                                        <option>Esri Satellite</option>
                                    </select>
                                </div>

                                <h3 className="settings-section__title">Units</h3>
                                <div className="settings-field">
                                    <label className="settings-label">Altitude Unit</label>
                                    <select className="settings-input">
                                        <option>Meters (m)</option>
                                        <option>Feet (ft)</option>
                                    </select>
                                </div>
                                <div className="settings-field">
                                    <label className="settings-label">Speed Unit</label>
                                    <select className="settings-input">
                                        <option>m/s</option>
                                        <option>km/h</option>
                                        <option>knots</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* ═══ ABOUT ═══ */}
                        {tab === "about" && (
                            <div className="settings-section">
                                <h3 className="settings-section__title">Sky ResQ GCS</h3>
                                <div className="settings-about">
                                    <p><strong>Version:</strong> 1.0.0</p>
                                    <p><strong>System:</strong> Autonomous Aerial Search &amp; Rescue</p>
                                    <p><strong>Flight Controller:</strong> Cube Black (Pixhawk)</p>
                                    <p><strong>Companion Computer:</strong> Raspberry Pi 4</p>
                                    <p><strong>Camera:</strong> XF-Z-1MINI 3-Axis Gimbal</p>
                                    <p><strong>Protocol:</strong> MAVLink v2</p>
                                    <p><strong>Communication:</strong> SiK Radio + 4G/Tailscale</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
