"""MAVLink connection manager — async wrapper around pymavlink."""

import asyncio
import logging
import time
from typing import Optional, Any

from pymavlink import mavutil

from config import settings

logger = logging.getLogger("skyresq.mavlink.connection")


class MAVLinkConnection:
    """Manages a single MAVLink connection (Serial, TCP, or UDP).

    Thread-safe async wrapper. All blocking I/O runs in an executor
    to avoid blocking the event loop.
    """

    def __init__(self) -> None:
        self._master: Optional[Any] = None
        self._connected: bool = False
        self._lock = asyncio.Lock()

    @property
    def is_connected(self) -> bool:
        return self._connected and self._master is not None

    @property
    def master(self) -> Optional[Any]:
        return self._master

    async def connect(
        self,
        connection_string: Optional[str] = None,
        baud_rate: Optional[int] = None,
    ) -> bool:
        """Open a MAVLink connection.

        Args:
            connection_string: MAVLink URI (e.g. 'COM3', 'tcp:127.0.0.1:5760').
            baud_rate: Serial baud rate (ignored for TCP/UDP).

        Returns:
            True if connection established successfully.
        """
        conn_str = connection_string or settings.mavlink_connection_string
        baud = baud_rate or settings.mavlink_baud_rate

        async with self._lock:
            try:
                # Close existing connection if any
                if self._master is not None:
                    await self.disconnect()

                logger.info(
                    "Connecting to MAVLink: %s @ %d baud", conn_str, baud
                )

                loop = asyncio.get_running_loop()
                self._master = await loop.run_in_executor(
                    None,
                    lambda: mavutil.mavlink_connection(
                        conn_str,
                        baud=baud,
                        autoreconnect=True,
                        source_system=255,
                        source_component=0,
                    ),
                )

                # Wait for first heartbeat (timeout 10s)
                logger.info("Waiting for heartbeat...")
                heartbeat = await loop.run_in_executor(
                    None,
                    lambda: self._master.wait_heartbeat(timeout=10),
                )

                if heartbeat is None:
                    logger.error("No heartbeat received within timeout")
                    self._connected = False
                    return False

                self._connected = True
                logger.info(
                    "Connected! System %d, Component %d",
                    self._master.target_system,
                    self._master.target_component,
                )

                # Request data streams at desired rate
                await self._request_data_streams()
                return True

            except Exception as e:
                logger.error("Connection failed: %s", str(e))
                self._connected = False
                self._master = None
                return False

    async def disconnect(self) -> None:
        """Close the MAVLink connection."""
        async with self._lock:
            if self._master is not None:
                try:
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, self._master.close)
                except Exception as e:
                    logger.warning("Error closing connection: %s", str(e))
                finally:
                    self._master = None
                    self._connected = False
                    logger.info("Disconnected from MAVLink")

    async def recv_match(
        self,
        msg_type: Optional[str] = None,
        blocking: bool = False,
        timeout: float = 0.01,
    ) -> Optional[Any]:
        """Receive a MAVLink message (non-blocking by default).

        Args:
            msg_type: Filter for specific message type.
            blocking: Whether to block until a message arrives.
            timeout: Timeout in seconds for blocking reads.

        Returns:
            MAVLink message or None.
        """
        if not self.is_connected:
            return None

        try:
            loop = asyncio.get_running_loop()
            msg = await loop.run_in_executor(
                None,
                lambda: self._master.recv_match(
                    type=msg_type,
                    blocking=blocking,
                    timeout=timeout,
                ),
            )
            return msg
        except Exception as e:
            logger.warning("recv_match error: %s", str(e))
            return None

    async def send_command(
        self,
        command: int,
        param1: float = 0,
        param2: float = 0,
        param3: float = 0,
        param4: float = 0,
        param5: float = 0,
        param6: float = 0,
        param7: float = 0,
    ) -> bool:
        """Send a MAVLink COMMAND_LONG.

        Returns:
            True if the command was sent (does not guarantee ACK).
        """
        if not self.is_connected:
            logger.warning("Cannot send command — not connected")
            return False

        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                None,
                lambda: self._master.mav.command_long_send(
                    self._master.target_system,
                    self._master.target_component,
                    command,
                    0,  # confirmation
                    param1,
                    param2,
                    param3,
                    param4,
                    param5,
                    param6,
                    param7,
                ),
            )
            logger.info("Sent command %d", command)
            return True
        except Exception as e:
            logger.error("Failed to send command %d: %s", command, str(e))
            return False

    async def set_mode(self, mode_name: str) -> bool:
        """Set the flight mode by name.

        Args:
            mode_name: ArduPilot mode name (e.g. 'LOITER', 'RTL').

        Returns:
            True if the mode-set command was sent successfully.
        """
        if not self.is_connected:
            return False

        try:
            mode_mapping = self._master.mode_mapping()
            if mode_name.upper() not in mode_mapping:
                logger.error("Unknown mode: %s", mode_name)
                return False

            mode_id = mode_mapping[mode_name.upper()]
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                None,
                lambda: self._master.set_mode(mode_id),
            )
            logger.info("Set mode to %s (ID: %d)", mode_name, mode_id)
            return True
        except Exception as e:
            logger.error("Failed to set mode: %s", str(e))
            return False

    async def _request_data_streams(self) -> None:
        """Request MAVLink data streams at the configured rate."""
        if not self.is_connected:
            return

        rate = settings.telemetry_rate_hz
        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                None,
                lambda: self._master.mav.request_data_stream_send(
                    self._master.target_system,
                    self._master.target_component,
                    mavutil.mavlink.MAV_DATA_STREAM_ALL,
                    rate,
                    1,  # start
                ),
            )
            logger.info("Requested all data streams at %d Hz", rate)
        except Exception as e:
            logger.warning("Failed to request data streams: %s", str(e))


# Singleton instance
mavlink_connection = MAVLinkConnection()
