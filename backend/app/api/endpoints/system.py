import logging
import os
import subprocess
import psutil
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import asyncio

from app.api import deps
from app.core.redis import get_redis
from app.db.models import SystemMetric
from app.schemas.settings import SystemStateResponse

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/metrics/logs")
def get_container_logs(
    container: str = Query("doc_backend", description="Container name to fetch logs from"),
    lines: int = Query(100, description="Number of lines to fetch"),
    current_user=Depends(deps.get_current_active_superuser)
):
    """
    Fetches logs from a specific Docker container.
    """
    try:
        # We use subprocess to call docker logs because we mapped the socket
        # If the backend is running inside docker, it needs docker CLI installed
        cmd = ["docker", "logs", "--tail", str(lines), container]
        output = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True)
        return {"logs": output}
    except subprocess.CalledProcessError as e:
        logger.error(f"Error fetching logs from Docker: {e.output}")
        return {"logs": f"Error: {e.output}"}
    except Exception as e:
        logger.error(f"Failed to get logs: {e}")
        return {"logs": f"Error: {str(e)}"}

@router.get("/metrics/state", response_model=SystemStateResponse)
async def get_system_state(
    current_user=Depends(deps.get_current_active_superuser)
):
    r = await get_redis()
    state = await r.get("APP_STATE")
    if not state:
        state = "SEARCH"
    else:
        # Handle bytes vs string from different redis clients
        if isinstance(state, bytes):
            state = state.decode('utf-8')
    
    return {"state": state}

@router.post("/metrics/state", response_model=SystemStateResponse)
async def set_system_state(
    new_state: str,
    current_user=Depends(deps.get_current_active_superuser)
):
    if new_state not in ["SEARCH", "PROCESSING", "LOCKDOWN"]:
        return {"state": "INVALID"}
        
    r = await get_redis()
    await r.set("APP_STATE", new_state)
    
    from app.core.events import emit_event
    await emit_event("STATE_CHANGED", {"new_state": new_state, "by": current_user.email})
    
    return {"state": new_state}

@router.websocket("/metrics/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    r = await get_redis()
    
    try:
        while True:
            # 1. Get State
            state = await r.get("APP_STATE") or "SEARCH"
            if isinstance(state, bytes): state = state.decode('utf-8')
            
            # 2. Get OCR Progress
            ocr_data = await r.get("OCR_PROGRESS")
            ocr_json = None
            if ocr_data:
                try:
                    if isinstance(ocr_data, bytes): ocr_data = ocr_data.decode('utf-8')
                    ocr_json = json.loads(ocr_data)
                except:
                    pass
            
            payload = {
                "app_state": state,
                "ocr_progress": ocr_json
            }
            
            await websocket.send_json(payload)
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        logger.info("Metrics WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
