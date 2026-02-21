"""Pydantic models for drone telemetry state."""

from pydantic import BaseModel
from typing import Optional
from enum import Enum


class FlightMode(str, Enum):
    """ArduPilot Copter flight modes."""
    STABILIZE = "STABILIZE"
    ACRO = "ACRO"
    ALT_HOLD = "ALT_HOLD"
    AUTO = "AUTO"
    GUIDED = "GUIDED"
    LOITER = "LOITER"
    RTL = "RTL"
    CIRCLE = "CIRCLE"
    LAND = "LAND"
    DRIFT = "DRIFT"
    SPORT = "SPORT"
    FLIP = "FLIP"
    AUTOTUNE = "AUTOTUNE"
    POSHOLD = "POSHOLD"
    BRAKE = "BRAKE"
    THROW = "THROW"
    SMART_RTL = "SMART_RTL"
    UNKNOWN = "UNKNOWN"


class AttitudeData(BaseModel):
    """ATTITUDE message data — roll, pitch, yaw in degrees."""
    roll: float = 0.0
    pitch: float = 0.0
    yaw: float = 0.0
    rollspeed: float = 0.0
    pitchspeed: float = 0.0
    yawspeed: float = 0.0


class PositionData(BaseModel):
    """GLOBAL_POSITION_INT data — lat/lon in degrees, alt in meters."""
    lat: float = 0.0
    lon: float = 0.0
    alt: float = 0.0
    relative_alt: float = 0.0
    vx: float = 0.0
    vy: float = 0.0
    vz: float = 0.0
    heading: int = 0


class VfrHudData(BaseModel):
    """VFR_HUD data — airspeed, groundspeed, heading, throttle, alt, climb."""
    airspeed: float = 0.0
    groundspeed: float = 0.0
    heading: int = 0
    throttle: int = 0
    alt: float = 0.0
    climb: float = 0.0


class BatteryData(BaseModel):
    """SYS_STATUS battery data."""
    voltage: float = 0.0
    current: float = 0.0
    remaining: int = -1


class GpsData(BaseModel):
    """GPS_RAW_INT data."""
    fix_type: int = 0
    satellites_visible: int = 0
    hdop: float = 0.0


class HeartbeatData(BaseModel):
    """HEARTBEAT data — system status and mode."""
    armed: bool = False
    flight_mode: FlightMode = FlightMode.UNKNOWN
    system_status: int = 0
    mav_type: int = 0
    autopilot: int = 0


class DroneState(BaseModel):
    """Complete drone telemetry state broadcasted via WebSocket."""
    connected: bool = False
    last_heartbeat: float = 0.0
    heartbeat: HeartbeatData = HeartbeatData()
    attitude: AttitudeData = AttitudeData()
    position: PositionData = PositionData()
    vfr_hud: VfrHudData = VfrHudData()
    battery: BatteryData = BatteryData()
    gps: GpsData = GpsData()
    status_text: str = ""
    timestamp: float = 0.0


class ConnectionRequest(BaseModel):
    """Request to connect to a MAVLink source."""
    connection_string: str
    baud_rate: int = 57600


class CommandResponse(BaseModel):
    """Generic command response."""
    success: bool
    message: str
