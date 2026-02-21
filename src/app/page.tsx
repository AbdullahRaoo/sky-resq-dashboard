/**
 * Dashboard Page — main entry assembling all GCS components.
 * Client component because it uses the WebSocket hook.
 */

"use client";

import dynamic from "next/dynamic";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useStatusText } from "@/hooks/useTelemetry";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import AttitudeIndicator from "@/components/hud/AttitudeIndicator";
import HudCards from "@/components/hud/HudCards";
import BatteryIndicator from "@/components/status/BatteryIndicator";
import GpsStatus from "@/components/status/GpsStatus";
import ArmButton from "@/components/controls/ArmButton";
import ModeSelector from "@/components/controls/ModeSelector";
import ConnectionPanel from "@/components/controls/ConnectionPanel";

// Leaflet requires window — load dynamically with SSR disabled
const DroneMap = dynamic(
  () => import("@/components/map/DroneMap"),
  { ssr: false }
);

export default function DashboardPage() {
  // Start WebSocket connection on mount
  useWebSocket();
  const statusText = useStatusText();

  return (
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

          {/* Attitude */}
          <div className="panel-section">
            <div className="panel-section__title">Attitude</div>
            <AttitudeIndicator />
          </div>

          {/* Flight Data */}
          <div className="panel-section">
            <div className="panel-section__title">Flight Data</div>
            <HudCards />
          </div>

          {/* Battery */}
          <div className="panel-section">
            <div className="panel-section__title">Battery</div>
            <BatteryIndicator />
          </div>

          {/* GPS */}
          <div className="panel-section">
            <div className="panel-section__title">GPS</div>
            <GpsStatus />
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
    </div>
  );
}
