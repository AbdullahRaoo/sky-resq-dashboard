# Sky ResQ Dashboard: Comprehensive Project Context

## 1. Project Overview & Architecture
The Sky ResQ Dashboard is an advanced, highly portable Ground Control Station (GCS) engineered for Unmanned Aerial Vehicles (UAVs) running ArduPilot/PX4 firmware. It fundamentally operates by communicating with the UAV’s flight controller via the **MAVLink protocol**, primarily utilizing 915MHz or 433MHz SiK Telemetry radios.

The architecture is uniquely bifurcated to support dual-deployment modes:
1. **Web Native (PWA/Browser-based):** Uses the HTML5 `Navigator.serial` (Web Serial API) to parse incoming MAVLink binary byte arrays directly inside the Chromium V8 engine using a custom TypeScript State Machine algorithm.
2. **Native Kiosk (Desktop App):** Uses an Electron wrapper that leverages a headless Node.js/Python (PyMAVLink) backend to natively connect to COM ports, decoding MAVLink and broadcasting the JSON dictionary to the React frontend at 10Hz via Inter-Process Communication (IPC).

The Frontend is built on **React and Next.js**, strictly relying on the **Zustand** atomic state management library. This guarantees that rapid >10Hz telemetry updates—like micro-fluctuations in pitch and roll—do not inadvertently trigger catastrophic re-renders of the entire React `VirtualDOM`. The UI features an aviation-standard layout: a persistent geospatial React-Leaflet map, critical VFR telemetry cards, and mathematically driven SVG Attitude Indicators (Artificial Horizon).

---

## 2. In-Depth Telemetry Flow (What is Fetched vs. Sent)

The GCS establishes bi-directional asynchronous communication with the drone at a base hardware baud rate of `57,600 bps`.

### A. Data Transmitted to the UAV (Tx / Sent)
The drone inherently acts passively regarding data streams. It generally only transmits a 1Hz `HEARTBEAT` until commanded otherwise by a GCS. The Sky ResQ Dashboard actively sends the following raw MAVLink packets:

1. **`HEARTBEAT` (Message ID: 0)**
   - **Trigger:** Generated at 1Hz in an infinite loop upon connection.
   - **Payload Content:** `type=MAV_TYPE_GCS (6)`, `autopilot=MAV_AUTOPILOT_INVALID (8)`, `base_mode=0`, `custom_mode=0`, `system_status=0`.
   - **Purpose:** Prevents the Flight Controller (Pixhawk) from triggering an arbitrary `<Heartbeat Loss -> Return-to-Launch (RTL)>` failsafe mid-flight. The UAV *must* know a GCS is actively connected.

2. **`REQUEST_DATA_STREAM` (Message ID: 66)**
   - **Trigger:** Sent exactly once right after the serial socket binds successfully.
   - **Payload Content:** `target_system=1`, `target_component=1`, `req_stream_id=0` (`MAV_DATA_STREAM_ALL`), `req_message_rate=4` (Hz), `start_stop=1`.
   - **Purpose:** This aggressively commands the flight controller to begin broadcasting all critical data strings (Attitude, GPS arrays, Battery cell voltages, VFR variables) at a predefined transmission frequency.

---

### B. Data Received from the UAV (Rx / Fetched)
The backend (or the TypeScript Web Serial parser) scans the incoming `Uint8Array` chunks for MAVLink magic bytes (`0xFE` for v1, `0xFD` for v2), verifies the 2-byte CRC-X25 checksum against hardcoded message matrices, and decodes the following payload primitives explicitly:

1. **`HEARTBEAT` (Message ID: 0)**
   - **Fetched:** `custom_mode` (mapped to ArduCopter string enumerations like "LOITER", "RTL", "STABILIZE"), `base_mode` (bitmasked to extract the `armed`/`disarmed` boolean toggle), `system_status`, and `mav_type` (e.g., Quadrotor).

2. **`ATTITUDE` (Message ID: 30)**
   - **Fetched:** `roll`, `pitch`, `yaw` (in radians/floats) and angular velocities `rollspeed`, `pitchspeed`, `yawspeed`.
   - **Usage:** These variables are directly bound to the CSS `transform: rotate() translateY()` vectors of the custom SVG Artificial Horizon, driving 60 FPS glass-cockpit physics.

3. **`GLOBAL_POSITION_INT` (Message ID: 33)**
   - **Fetched:** `lat` and `lon` (scaled as `int32` by `1e7`, converted back to standard float vectors), `alt` (Mean Sea Level in mm $\rightarrow$ meters), `relative_alt` (Above Ground Level in mm $\rightarrow$ meters), and velocity vectors `vx`, `vy`, `vz`. Heading `hdg` (in centi-degrees).
   - **Usage:** Pinpoints the drone marker dynamically on the React-Leaflet GIS tile layer.

4. **`VFR_HUD` (Message ID: 74)**
   - **Fetched:** `airspeed` (m/s), `groundspeed` (m/s), `heading` (degrees 0-360), `throttle` (percentage 0-100%), and `climb` rate (m/s).
   - **Usage:** Rendered precisely in the right-hand Velocity mini-cards, with color-conditional formatting (e.g., green on positive climb, red on negative climb sink rate).

5. **`SYS_STATUS` (Message ID: 1)**
   - **Fetched:** `voltage_battery` (parsed in millivolts, divided by 1000 to Display V), `current_battery` (centi-amps), and `battery_remaining` (percentage).
   - **Usage:** Monitored rigorously by the UI to apply warning CSS stylings if voltage levels breach minimum threshold boundaries.

6. **`GPS_RAW_INT` (Message ID: 24)**
   - **Fetched:** `fix_type` (0=No GPS, 1=No Fix, 2=2D Fix, 3=3D Fix), `satellites_visible` (uint8), and `eph` (HDOP accuracy).
   - **Usage:** Triggers the green "3D FIX" UI badge. *(Note: During development troubleshooting, it was diagnosed that a stream producing 0 Satellites / 0 Fix is strictly an environmental/hardware block—e.g., operating indoors without sky view—and not a software bug).*

7. **`STATUSTEXT` (Message ID: 253)**
   - **Fetched:** `severity` index and string `text`.
   - **Usage:** Used to push toast notifications regarding internal pre-arm failures, GPS glitches, or RC calibration mandates directly to the pilot.

---

## 3. Engineering Feats & Bug Resolutions (Historical Context)

Throughout the active engineering of this codebase, severe operational hurdles regarding hardware connectivity explicitly dictated architectural changes.

### The "Port Busy" Hardware Lock
The most persistent bug originally encountered was Google Chrome and Electron persistently refusing access to the SiK radio with a `Port Busy` or `Access Denied` exception after rapid disconnects, tab reloads (HMR), or un-awaited un-mounts.
- **Cause:** Chromium's default implementation of `readable.pipeTo()` internally monopolized the OS-level file handler (`COMx`). If React unmounted a component, `pipeTo()` left the physical OS buffer dangling, permanently locking the hardware device until a hard machine reboot.
- **Resolution:**
  1. The Web Serial architecture was forcefully re-engineered directly in `webSerial.ts`. The opaque `pipeTo()` function was ripped out and replaced with a heavily governed, asynchronous `reader.read()` `while` loop.
  2. Integrated absolute `useEffect` cleanup procedures chained with `window.addEventListener("beforeunload")` to guarantee that `reader.cancel()` and `port.close()` definitively execute irrespective of routing faults.
  3. Forced `flowControl: "none"` explicitly inside the `requestPort` negotiation sequence to ensure 3-wire SiK radios didn't permanently stall the buffer polling loop.

### Auto-Reconnect Exponential Backoff (FSM)
To mitigate random field disconnects, a mathematical **Exponential Backoff Buffer Recovery Engine** was engineered.
- The web app dynamically monitors `Uint8Array` Chromium saturation. If an arbitrary buffer overrun occurs due to hyper-activity over the serial lane, the `reader.read` exception is caught.
- Instead of fatal-crashing, the Finite State Machine (FSM) initiates a stealth background polling script starting at 150ms delays. It recursively tests `port.open()`, instantly restoring the total active telemetry pipeline entirely transparently to the active UI pilot, rendering the GCS supremely robust against transient connection failures.
