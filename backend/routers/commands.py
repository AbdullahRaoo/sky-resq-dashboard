"""REST API endpoints for drone commands — connect, arm, disarm, mode."""

import logging

from fastapi import APIRouter, HTTPException
from pymavlink import mavutil

from config import settings
from mavlink.connection import mavlink_connection
from models.drone_state import CommandResponse, ConnectionRequest
from services.telemetry_service import telemetry_service

logger = logging.getLogger("skyresq.routers.commands")

router = APIRouter(prefix="/api", tags=["commands"])


@router.get("/status")
async def get_status() -> dict:
    """Get current drone state snapshot."""
    return telemetry_service.state.model_dump()


@router.post("/connect", response_model=CommandResponse)
async def connect_drone(request: ConnectionRequest) -> CommandResponse:
    """Connect to the drone via MAVLink.

    Args:
        request: Connection parameters (connection_string, baud_rate).
    """
    try:
        success = await mavlink_connection.connect(
            connection_string=request.connection_string,
            baud_rate=request.baud_rate,
        )

        if success:
            await telemetry_service.start()
            return CommandResponse(
                success=True,
                message=f"Connected to {request.connection_string}",
            )
        else:
            return CommandResponse(
                success=False,
                message="Connection failed — no heartbeat received",
            )
    except Exception as e:
        logger.error("Connect error: %s", str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/disconnect", response_model=CommandResponse)
async def disconnect_drone() -> CommandResponse:
    """Disconnect from the drone."""
    try:
        await telemetry_service.stop()
        await mavlink_connection.disconnect()
        return CommandResponse(success=True, message="Disconnected")
    except Exception as e:
        logger.error("Disconnect error: %s", str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/arm", response_model=CommandResponse)
async def arm_drone() -> CommandResponse:
    """Arm the drone motors.

    Safety: Only arms if connected and heartbeat is healthy.
    """
    if not mavlink_connection.is_connected:
        return CommandResponse(success=False, message="Not connected to drone")

    if not telemetry_service.state.connected:
        return CommandResponse(
            success=False, message="No heartbeat — drone may be offline"
        )

    success = await mavlink_connection.send_command(
        mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
        param1=1,  # 1 = arm
    )

    return CommandResponse(
        success=success,
        message="Arm command sent" if success else "Failed to send arm command",
    )


@router.post("/disarm", response_model=CommandResponse)
async def disarm_drone() -> CommandResponse:
    """Disarm the drone motors.

    Safety: Force-disarm available via param2=21196 (emergency).
    """
    if not mavlink_connection.is_connected:
        return CommandResponse(success=False, message="Not connected to drone")

    success = await mavlink_connection.send_command(
        mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
        param1=0,  # 0 = disarm
    )

    return CommandResponse(
        success=success,
        message="Disarm command sent" if success else "Failed to send disarm command",
    )


@router.post("/mode/{mode_name}", response_model=CommandResponse)
async def set_mode(mode_name: str) -> CommandResponse:
    """Set the flight mode.

    Args:
        mode_name: ArduPilot mode name (e.g. 'LOITER', 'RTL', 'STABILIZE').
    """
    if not mavlink_connection.is_connected:
        return CommandResponse(success=False, message="Not connected to drone")

    success = await mavlink_connection.set_mode(mode_name)

    return CommandResponse(
        success=success,
        message=f"Mode set to {mode_name}" if success else f"Failed to set mode {mode_name}",
    )


@router.get("/connection-profiles")
async def get_connection_profiles() -> list[dict]:
    """Return available connection profiles."""
    return [
        {
            "name": "Radio Telemetry",
            "connection_string": settings.mavlink_connection_string,
            "baud_rate": settings.mavlink_baud_rate,
            "description": "SiK Radio on Serial Port",
        },
        {
            "name": "SITL Simulator",
            "connection_string": "tcp:127.0.0.1:5760",
            "baud_rate": 115200,
            "description": "ArduPilot SITL over TCP",
        },
        {
            "name": "4G Tailscale",
            "connection_string": "udp:100.64.0.1:14550",
            "baud_rate": 0,
            "description": "MAVLink over Tailscale VPN",
        },
    ]
