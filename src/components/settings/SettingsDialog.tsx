/**
 * SettingsDialog — comprehensive GCS settings popup.
 * Reads/writes from settingsStore and themeStore.
 */

"use client";

import { useState } from "react";
import { useSettingsStore } from "@/store/settingsStore";
import { useThemeStore } from "@/store/themeStore";

interface SettingsDialogProps {
    open: boolean;
    onClose: () => void;
}

type SettingsTab = "connection" | "mission" | "failsafe" | "display" | "about";

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
    const settings = useSettingsStore();
    const { theme } = useThemeStore();
    const [tab, setTab] = useState<SettingsTab>("connection");

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
                <div className="settings-header">
                    <div className="settings-header__title">⚙ Settings</div>
                    <button className="settings-header__close" onClick={onClose}>✕</button>
                </div>

                <div className="settings-body">
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

                    <div className="settings-content">
                        {/* ═══ CONNECTION ═══ */}
                        {tab === "connection" && (
                            <div className="settings-section">
                                <h3 className="settings-section__title">Serial Connection (SiK Radio)</h3>
                                <div className="settings-field">
                                    <label className="settings-label">COM Port</label>
                                    <input className="settings-input" value={settings.comPort}
                                        onChange={(e) => settings.updateSettings({ comPort: e.target.value })} />
                                    <span className="settings-hint">Serial port for SiK telemetry radio (e.g. COM3, /dev/ttyUSB0)</span>
                                </div>
                                <div className="settings-field">
                                    <label className="settings-label">Baud Rate</label>
                                    <select className="settings-input" value={settings.baudRate}
                                        onChange={(e) => settings.updateSettings({ baudRate: Number(e.target.value) })}>
                                        <option value={9600}>9600</option>
                                        <option value={57600}>57600</option>
                                        <option value={115200}>115200</option>
                                        <option value={921600}>921600</option>
                                    </select>
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
                                            value={settings.defaultAltitude}
                                            onChange={(e) => settings.updateSettings({ defaultAltitude: Number(e.target.value) })} />
                                        <span className="settings-hint">Height above ground for survey scans</span>
                                    </div>
                                    <div className="settings-field">
                                        <label className="settings-label">Default Speed (m/s)</label>
                                        <input className="settings-input" type="number" min={1} max={15}
                                            value={settings.defaultSpeed}
                                            onChange={(e) => settings.updateSettings({ defaultSpeed: Number(e.target.value) })} />
                                        <span className="settings-hint">Cruise speed during survey grid</span>
                                    </div>
                                </div>
                                <div className="settings-field">
                                    <label className="settings-label">Camera Overlap (%)</label>
                                    <input className="settings-input" type="number" min={10} max={90}
                                        value={settings.defaultOverlap}
                                        onChange={(e) => settings.updateSettings({ defaultOverlap: Number(e.target.value) })} />
                                    <span className="settings-hint">How much each camera frame overlaps the next. Higher = denser grid, better detection but slower mission. 60% is recommended.</span>
                                </div>

                                <h3 className="settings-section__title">Payload Mechanism</h3>
                                <div className="settings-row">
                                    <div className="settings-field">
                                        <label className="settings-label">Servo Channel</label>
                                        <input className="settings-input" type="number" min={1} max={16}
                                            value={settings.servoChannel}
                                            onChange={(e) => settings.updateSettings({ servoChannel: Number(e.target.value) })} />
                                        <span className="settings-hint">Pixhawk AUX channel for payload latch</span>
                                    </div>
                                    <div className="settings-field">
                                        <label className="settings-label">Release PWM (µs)</label>
                                        <input className="settings-input" type="number" min={500} max={2500}
                                            value={settings.servoPwm}
                                            onChange={(e) => settings.updateSettings({ servoPwm: Number(e.target.value) })} />
                                        <span className="settings-hint">PWM value to open servo latch</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ═══ FAILSAFE ═══ */}
                        {tab === "failsafe" && (
                            <div className="settings-section">
                                <h3 className="settings-section__title">Connection Lost Behavior</h3>
                                <div className="settings-failsafe-diagram">
                                    <div className="failsafe-step">
                                        <div className="failsafe-step__time">{settings.loiterTimeoutSec}s</div>
                                        <div className="failsafe-step__action">⏸ LOITER<br /><span className="failsafe-step__desc">Hold position and wait</span></div>
                                    </div>
                                    <div className="failsafe-arrow">→</div>
                                    <div className="failsafe-step failsafe-step--critical">
                                        <div className="failsafe-step__time">{settings.rtlTimeoutSec}s</div>
                                        <div className="failsafe-step__action">🏠 RTL<br /><span className="failsafe-step__desc">Return to launch point</span></div>
                                    </div>
                                </div>
                                <div className="settings-row">
                                    <div className="settings-field">
                                        <label className="settings-label">LOITER after (seconds)</label>
                                        <input className="settings-input" type="number" min={3} max={30}
                                            value={settings.loiterTimeoutSec}
                                            onChange={(e) => settings.updateSettings({ loiterTimeoutSec: Number(e.target.value) })} />
                                        <span className="settings-hint">Heartbeat lost → hold current position</span>
                                    </div>
                                    <div className="settings-field">
                                        <label className="settings-label">RTL after (seconds)</label>
                                        <input className="settings-input" type="number" min={5} max={60}
                                            value={settings.rtlTimeoutSec}
                                            onChange={(e) => settings.updateSettings({ rtlTimeoutSec: Number(e.target.value) })} />
                                        <span className="settings-hint">Still no heartbeat → return to launch</span>
                                    </div>
                                </div>

                                <h3 className="settings-section__title">Return to Launch</h3>
                                <div className="settings-field">
                                    <label className="settings-label">RTL Altitude (m)</label>
                                    <input className="settings-input" type="number" min={10} max={100}
                                        value={settings.rtlAltitude}
                                        onChange={(e) => settings.updateSettings({ rtlAltitude: Number(e.target.value) })} />
                                    <span className="settings-hint">Safe clearance altitude for return flight</span>
                                </div>

                                <h3 className="settings-section__title">Battery Alerts</h3>
                                <div className="settings-row">
                                    <div className="settings-field">
                                        <label className="settings-label">Low Warning (%)</label>
                                        <input className="settings-input" type="number" min={10} max={50}
                                            value={settings.lowBatPercent}
                                            onChange={(e) => settings.updateSettings({ lowBatPercent: Number(e.target.value) })} />
                                    </div>
                                    <div className="settings-field">
                                        <label className="settings-label">Critical Alert (%)</label>
                                        <input className="settings-input" type="number" min={5} max={25}
                                            value={settings.critBatPercent}
                                            onChange={(e) => settings.updateSettings({ critBatPercent: Number(e.target.value) })} />
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
                                    <select className="settings-input" value={settings.mapStyle}
                                        onChange={(e) => settings.updateSettings({ mapStyle: e.target.value as "dark" | "osm" | "satellite" })}>
                                        <option value="dark">CartoDB Dark</option>
                                        <option value="osm">OpenStreetMap</option>
                                        <option value="satellite">Esri Satellite</option>
                                    </select>
                                </div>

                                <h3 className="settings-section__title">Units</h3>
                                <div className="settings-row">
                                    <div className="settings-field">
                                        <label className="settings-label">Altitude</label>
                                        <select className="settings-input" value={settings.altitudeUnit}
                                            onChange={(e) => settings.updateSettings({ altitudeUnit: e.target.value as "m" | "ft" })}>
                                            <option value="m">Meters (m)</option>
                                            <option value="ft">Feet (ft)</option>
                                        </select>
                                    </div>
                                    <div className="settings-field">
                                        <label className="settings-label">Speed</label>
                                        <select className="settings-input" value={settings.speedUnit}
                                            onChange={(e) => settings.updateSettings({ speedUnit: e.target.value as "m/s" | "km/h" | "knots" })}>
                                            <option value="m/s">m/s</option>
                                            <option value="km/h">km/h</option>
                                            <option value="knots">knots</option>
                                        </select>
                                    </div>
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
                                    <p><strong>Communication:</strong> SiK Radio + 4G/Tailscale VPN</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
