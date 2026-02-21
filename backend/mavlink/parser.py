"""MAVLink message parser — converts raw pymavlink messages to Pydantic models."""

import math
import logging
from typing import Any, Optional

from models.drone_state import (
    AttitudeData,
    BatteryData,
    DroneState,
    FlightMode,
    GpsData,
    HeartbeatData,
    PositionData,
    VfrHudData,
)

logger = logging.getLogger("skyresq.mavlink.parser")

# ArduPilot Copter mode mapping (custom_mode → name)
COPTER_MODES: dict[int, str] = {
    0: "STABILIZE",
    1: "ACRO",
    2: "ALT_HOLD",
    3: "AUTO",
    4: "GUIDED",
    5: "LOITER",
    6: "RTL",
    7: "CIRCLE",
    9: "LAND",
    11: "DRIFT",
    13: "SPORT",
    14: "FLIP",
    15: "AUTOTUNE",
    16: "POSHOLD",
    17: "BRAKE",
    18: "THROW",
    21: "SMART_RTL",
}


def parse_heartbeat(msg: Any) -> HeartbeatData:
    """Parse HEARTBEAT message."""
    try:
        armed = (msg.base_mode & 128) != 0  # MAV_MODE_FLAG_SAFETY_ARMED
        custom_mode = msg.custom_mode
        mode_name = COPTER_MODES.get(custom_mode, "UNKNOWN")

        return HeartbeatData(
            armed=armed,
            flight_mode=FlightMode(mode_name),
            system_status=msg.system_status,
            mav_type=msg.type,
            autopilot=msg.autopilot,
        )
    except Exception as e:
        logger.warning("Failed to parse HEARTBEAT: %s", str(e))
        return HeartbeatData()


def parse_attitude(msg: Any) -> AttitudeData:
    """Parse ATTITUDE message — convert radians to degrees."""
    try:
        return AttitudeData(
            roll=round(math.degrees(msg.roll), 2),
            pitch=round(math.degrees(msg.pitch), 2),
            yaw=round(math.degrees(msg.yaw), 2),
            rollspeed=round(math.degrees(msg.rollspeed), 2),
            pitchspeed=round(math.degrees(msg.pitchspeed), 2),
            yawspeed=round(math.degrees(msg.yawspeed), 2),
        )
    except Exception as e:
        logger.warning("Failed to parse ATTITUDE: %s", str(e))
        return AttitudeData()


def parse_global_position(msg: Any) -> PositionData:
    """Parse GLOBAL_POSITION_INT — lat/lon scaled by 1e7, alt in mm."""
    try:
        return PositionData(
            lat=msg.lat / 1e7,
            lon=msg.lon / 1e7,
            alt=msg.alt / 1000.0,
            relative_alt=msg.relative_alt / 1000.0,
            vx=msg.vx / 100.0,
            vy=msg.vy / 100.0,
            vz=msg.vz / 100.0,
            heading=msg.hdg if msg.hdg != 65535 else 0,
        )
    except Exception as e:
        logger.warning("Failed to parse GLOBAL_POSITION_INT: %s", str(e))
        return PositionData()


def parse_vfr_hud(msg: Any) -> VfrHudData:
    """Parse VFR_HUD message."""
    try:
        return VfrHudData(
            airspeed=round(msg.airspeed, 2),
            groundspeed=round(msg.groundspeed, 2),
            heading=msg.heading,
            throttle=msg.throttle,
            alt=round(msg.alt, 2),
            climb=round(msg.climb, 2),
        )
    except Exception as e:
        logger.warning("Failed to parse VFR_HUD: %s", str(e))
        return VfrHudData()


def parse_sys_status(msg: Any) -> BatteryData:
    """Parse SYS_STATUS for battery info."""
    try:
        return BatteryData(
            voltage=msg.voltage_battery / 1000.0 if msg.voltage_battery != -1 else 0.0,
            current=msg.current_battery / 100.0 if msg.current_battery != -1 else 0.0,
            remaining=msg.battery_remaining,
        )
    except Exception as e:
        logger.warning("Failed to parse SYS_STATUS: %s", str(e))
        return BatteryData()


def parse_gps_raw(msg: Any) -> GpsData:
    """Parse GPS_RAW_INT message."""
    try:
        return GpsData(
            fix_type=msg.fix_type,
            satellites_visible=msg.satellites_visible,
            hdop=msg.eph / 100.0 if msg.eph != 65535 else 0.0,
        )
    except Exception as e:
        logger.warning("Failed to parse GPS_RAW_INT: %s", str(e))
        return GpsData()


def update_drone_state(
    state: DroneState,
    msg: Any,
    msg_type: str,
) -> DroneState:
    """Update the DroneState model with a new MAVLink message.

    Args:
        state: Current drone state (mutated in place).
        msg: Raw pymavlink message.
        msg_type: Message type string.

    Returns:
        Updated DroneState.
    """
    if msg_type == "HEARTBEAT":
        state.heartbeat = parse_heartbeat(msg)
    elif msg_type == "ATTITUDE":
        state.attitude = parse_attitude(msg)
    elif msg_type == "GLOBAL_POSITION_INT":
        state.position = parse_global_position(msg)
    elif msg_type == "VFR_HUD":
        state.vfr_hud = parse_vfr_hud(msg)
    elif msg_type == "SYS_STATUS":
        state.battery = parse_sys_status(msg)
    elif msg_type == "GPS_RAW_INT":
        state.gps = parse_gps_raw(msg)
    elif msg_type == "STATUSTEXT":
        try:
            state.status_text = msg.text
        except Exception:
            pass

    return state
