/**
 * Dashboard Page — Enterprise GCS layout.
 * True fullscreen, sidebar view switching, theme support.
 */

"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useElectronTelemetry } from "@/hooks/useElectronTelemetry";
import { useStatusText } from "@/hooks/useTelemetry";
import { useNavStore } from "@/store/navStore";
import { useThemeStore } from "@/store/themeStore";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import AttitudeIndicator from "@/components/hud/AttitudeIndicator";
import CompassRose from "@/components/hud/CompassRose";
import HudCards from "@/components/hud/HudCards";
import FlightTimer from "@/components/status/FlightTimer";
import ArmButton from "@/components/controls/ArmButton";
import ModeSelector from "@/components/controls/ModeSelector";
import ConnectionPanel from "@/components/controls/ConnectionPanel";
import QuickActions from "@/components/controls/QuickActions";
import PayloadControl from "@/components/controls/PayloadControl";
import GimbalControl from "@/components/controls/GimbalControl";
import LinkStatus from "@/components/status/LinkStatus";
import AlertPanel from "@/components/status/AlertPanel";
import MissionPanel from "@/components/mission/MissionPanel";
import VideoFeed from "@/components/video/VideoFeed";
import ConsoleLog from "@/components/status/ConsoleLog";
import SettingsDialog from "@/components/settings/SettingsDialog";

const DroneMap = dynamic(
  () => import("@/components/map/DroneMap"),
  { ssr: false }
);

export default function DashboardPage() {
  useElectronTelemetry();
  const statusText = useStatusText();
  const activeView = useNavStore((s) => s.activeView);
  const theme = useThemeStore((s) => s.theme);
  const [videoOpen, setVideoOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Apply theme class to root
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div className="electron-app">
      <div className="dashboard-layout">
        <Sidebar onSettingsClick={() => setSettingsOpen(true)} />
        <Header />

        <main className="main-content">
          {/* ── Map Area ─────────────────────────────── */}
          <div className="map-area">
            <DroneMap />

            {videoOpen && activeView === "dashboard" && (
              <div className="video-overlay">
                <VideoFeed />
              </div>
            )}
            {activeView === "dashboard" && (
              <button
                className="video-toggle-btn"
                onClick={() => setVideoOpen(!videoOpen)}
                title={videoOpen ? "Hide video" : "Show video"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </button>
            )}

            <AlertPanel />
          </div>

          {/* ── Right Panel ──────────────────────────── */}
          <div className="right-panel">
            <div className="right-panel__view-header">
              {activeView === "dashboard" && "Dashboard"}
              {activeView === "mission" && "Mission Planner"}
              {activeView === "camera" && "Camera & Payload"}
            </div>

            <div className={`right-panel__content ${activeView === "camera" ? "right-panel__content--camera" : ""}`}>
              {/* ══ DASHBOARD VIEW ══ */}
              {activeView === "dashboard" && (
                <>
                  <div className="panel-section">
                    <div className="panel-section__title">Connection</div>
                    <ConnectionPanel />
                  </div>

                  <div className="panel-section">
                    <div className="panel-section__title">Orientation</div>
                    <div className="orientation-row">
                      <AttitudeIndicator />
                      <CompassRose />
                    </div>
                  </div>

                  <FlightTimer />

                  <div className="panel-section panel-section--flush">
                    <div className="panel-section__title">Telemetry</div>
                    <HudCards />
                  </div>

                  <div className="panel-section">
                    <div className="panel-section__title">Communication Links</div>
                    <LinkStatus />
                  </div>

                  <div className="panel-section">
                    <div className="panel-section__title">Quick Actions</div>
                    <QuickActions />
                  </div>

                  <div className="panel-section">
                    <div className="panel-section__title">Flight Mode</div>
                    <ModeSelector />
                  </div>

                  <div className="panel-section">
                    <div className="panel-section__title">Motor Control</div>
                    <ArmButton />
                  </div>

                  {statusText && (
                    <div className="panel-section">
                      <div className="panel-section__title">Status</div>
                      <div className="status-banner">{statusText}</div>
                    </div>
                  )}
                </>
              )}

              {/* ══ MISSION VIEW ══ */}
              {activeView === "mission" && <MissionPanel />}

              {/* ══ CAMERA VIEW ══ */}
              {activeView === "camera" && (
                <>
                  <div className="panel-section panel-section--camera-feed">
                    <div className="panel-section__title">Live Camera Feed</div>
                    <VideoFeed />
                  </div>
                  <div className="panel-section">
                    <div className="panel-section__title">Gimbal Control</div>
                    <GimbalControl />
                  </div>
                  <div className="panel-section">
                    <div className="panel-section__title">Rescue Payload</div>
                    <PayloadControl />
                  </div>
                </>
              )}
            </div>
          </div>
        </main>

        <ConsoleLog />
      </div>

      {/* Settings Popup */}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
