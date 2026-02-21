"""WebSocket endpoint for real-time telemetry streaming."""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.telemetry_service import telemetry_service

logger = logging.getLogger("skyresq.routers.telemetry_ws")

router = APIRouter()


@router.websocket("/ws/telemetry")
async def telemetry_websocket(websocket: WebSocket) -> None:
    """WebSocket endpoint that streams DroneState JSON at 10Hz.

    Clients connect and receive a continuous stream of telemetry data.
    No messages need to be sent from the client side.
    """
    await websocket.accept()
    telemetry_service.register_client(websocket)

    try:
        # Keep connection alive — listen for client disconnect
        while True:
            try:
                # Wait for any client message (ping/pong or close)
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
    except Exception as e:
        logger.warning("WebSocket error: %s", str(e))
    finally:
        telemetry_service.unregister_client(websocket)
