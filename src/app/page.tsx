/**
 * Dashboard Page — main entry assembling all GCS components.
 * Uses Electron IPC for telemetry (replaces old WebSocket hook).
 */

"use client";

import dynamic from "next/dynamic";
import { useElectronTelemetry } from "@/hooks/useElectronTelemetry";
import { useStatusText } from "@/hooks/useTelemetry";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import TitleBar from "@/components/layout/TitleBar";
import AttitudeIndicator from "@/components/hud/AttitudeIndicator";
import CompassRose from "@/components/hud/CompassRose";
import HudCards from "@/components/hud/HudCards";
import FlightTimer from "@/components/status/FlightTimer";
import ArmButton from "@/components/controls/ArmButton";
import ModeSelector from "@/components/controls/ModeSelector";
import ConnectionPanel from "@/components/controls/ConnectionPanel";
import QuickActions from "@/components/controls/QuickActions";
import ConsoleLog from "@/components/status/ConsoleLog";

// Leaflet requires window — load dynamically with SSR disabled
const DroneMap = dynamic(
  () => import("@/components/map/DroneMap"),
  { ssr: false }
);

export default function DashboardPage() {
  // Start Electron IPC telemetry listener on mount
  useElectronTelemetry();
  const statusText = useStatusText();

  return (
    <div className="electron-app">
      {/* Custom title bar for frameless window */}
      <TitleBar />

      <div className="dashboard-layout">
        <Sidebar />
        <Header />

        <main className="main-content">
          {/* Map (fills left area) */}
          <DroneMap />

          {/* Right Panel — telemetry + controls */}
          <div className="right-panel">
            {/* Connection */}
            <div className="panel-section">
              <div className="panel-section__title">Connection</div>
              <ConnectionPanel />
            </div>

            {/* Attitude + Compass side by side */}
            <div className="panel-section">
              <div className="panel-section__title">Orientation</div>
              <div className="orientation-row">
                <AttitudeIndicator />
                <CompassRose />
              </div>
            </div>

            {/* Flight Timer */}
            <FlightTimer />

            {/* Telemetry Data */}
            <div className="panel-section panel-section--flush">
              <div className="panel-section__title">Telemetry</div>
              <HudCards />
            </div>

            {/* Quick Actions */}
            <div className="panel-section">
              <div className="panel-section__title">Quick Actions</div>
              <QuickActions />
            </div>

            {/* Controls */}
            <div className="panel-section">
              <div className="panel-section__title">Flight Mode</div>
              <ModeSelector />
            </div>

            <div className="panel-section">
              <div className="panel-section__title">Motor Control</div>
              <ArmButton />
            </div>

            {/* Status Text */}
            {statusText && (
              <div className="panel-section">
                <div className="panel-section__title">Status</div>
                <div className="status-banner">{statusText}</div>
              </div>
            )}
          </div>
        </main>

        {/* Bottom console log panel */}
        <ConsoleLog />
      </div>
    </div>
  );
}
