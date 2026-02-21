"""Telemetry service — async loop reading MAVLink and broadcasting state."""

import asyncio
import json
import logging
import time
from typing import Set

from fastapi import WebSocket

from config import settings
from mavlink.connection import mavlink_connection
from mavlink.parser import update_drone_state
from models.drone_state import DroneState

logger = logging.getLogger("skyresq.services.telemetry")


class TelemetryService:
    """Manages the telemetry read loop and WebSocket broadcasting.

    Reads MAVLink messages at the configured rate, updates the shared
    DroneState, and broadcasts JSON to all connected WebSocket clients.
    """

    def __init__(self) -> None:
        self._state = DroneState()
        self._clients: Set[WebSocket] = set()
        self._running: bool = False
        self._task: asyncio.Task | None = None

    @property
    def state(self) -> DroneState:
        return self._state

    @property
    def client_count(self) -> int:
        return len(self._clients)

    def register_client(self, ws: WebSocket) -> None:
        """Register a WebSocket client for telemetry broadcasts."""
        self._clients.add(ws)
        logger.info("Client connected. Total: %d", len(self._clients))

    def unregister_client(self, ws: WebSocket) -> None:
        """Unregister a WebSocket client."""
        self._clients.discard(ws)
        logger.info("Client disconnected. Total: %d", len(self._clients))

    async def start(self) -> None:
        """Start the telemetry read loop."""
        if self._running:
            logger.warning("Telemetry service already running")
            return

        self._running = True
        self._task = asyncio.create_task(self._telemetry_loop())
        logger.info("Telemetry service started")

    async def stop(self) -> None:
        """Stop the telemetry read loop."""
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Telemetry service stopped")

    async def _telemetry_loop(self) -> None:
        """Main telemetry loop — read MAVLink, update state, broadcast."""
        interval = 1.0 / settings.telemetry_rate_hz
        heartbeat_timeout = settings.heartbeat_timeout_s

        while self._running:
            loop_start = time.monotonic()

            try:
                if mavlink_connection.is_connected:
                    # Read all available messages (non-blocking burst)
                    messages_read = 0
                    while messages_read < 50:  # cap per cycle
                        msg = await mavlink_connection.recv_match(
                            blocking=False, timeout=0.001
                        )
                        if msg is None:
                            break

                        msg_type = msg.get_type()
                        if msg_type == "BAD_DATA":
                            continue

                        # Track heartbeat timing
                        if msg_type == "HEARTBEAT":
                            # Skip GCS heartbeats (type 6 = GCS)
                            if msg.type == 6:
                                messages_read += 1
                                continue
                            self._state.last_heartbeat = time.time()

                        update_drone_state(self._state, msg, msg_type)
                        messages_read += 1

                    # Update connection state
                    now = time.time()
                    if self._state.last_heartbeat > 0:
                        time_since_hb = now - self._state.last_heartbeat
                        self._state.connected = time_since_hb < heartbeat_timeout
                    else:
                        self._state.connected = False

                    self._state.timestamp = now

                    # Broadcast to all WebSocket clients
                    if self._clients:
                        await self._broadcast()

                else:
                    self._state.connected = False
                    self._state.timestamp = time.time()

            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error("Telemetry loop error: %s", str(e))

            # Sleep remainder of interval
            elapsed = time.monotonic() - loop_start
            sleep_time = max(0, interval - elapsed)
            await asyncio.sleep(sleep_time)

    async def _broadcast(self) -> None:
        """Send current state JSON to all connected clients."""
        data = self._state.model_dump_json()
        dead_clients: list[WebSocket] = []

        for ws in self._clients:
            try:
                await ws.send_text(data)
            except Exception:
                dead_clients.append(ws)

        for ws in dead_clients:
            self._clients.discard(ws)


# Singleton instance
telemetry_service = TelemetryService()
