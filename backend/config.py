"""Sky ResQ Dashboard — Backend Configuration."""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # MAVLink Connection
    mavlink_connection_string: str = "COM3"
    mavlink_baud_rate: int = 57600

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    # Telemetry
    telemetry_rate_hz: int = 10
    heartbeat_timeout_s: int = 5

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]

    model_config = {
        "env_file": "../.env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
