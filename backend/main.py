"""Sky ResQ Dashboard — FastAPI Backend Entrypoint."""

import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from mavlink.connection import mavlink_connection
from routers import commands, telemetry_ws
from services.telemetry_service import telemetry_service

# ── Logging Setup ─────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(name)-35s │ %(levelname)-8s │ %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("logs/gcs_backend.log", mode="a", encoding="utf-8"),
    ],
)
logger = logging.getLogger("skyresq")


# ── Application Lifespan ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown lifecycle."""
    logger.info("═══════════════════════════════════════════")
    logger.info("  Sky ResQ Dashboard — Backend Starting    ")
    logger.info("═══════════════════════════════════════════")
    logger.info("MAVLink target: %s @ %d baud",
                settings.mavlink_connection_string,
                settings.mavlink_baud_rate)

    yield

    # Shutdown: clean up connections
    logger.info("Shutting down telemetry service...")
    await telemetry_service.stop()
    await mavlink_connection.disconnect()
    logger.info("Backend shutdown complete.")


# ── FastAPI App ───────────────────────────────────────────────────────
app = FastAPI(
    title="Sky ResQ Dashboard API",
    description="Ground Control Station API for drone telemetry and commands.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(telemetry_ws.router)
app.include_router(commands.router)


@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "sky-resq-backend",
        "drone_connected": mavlink_connection.is_connected,
        "ws_clients": telemetry_service.client_count,
    }
