import asyncio
import logging
import subprocess
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.api.deps import get_current_superadmin_user
from app.core.events import emit_event
from app.core.metrics import get_live_metrics
from app.core.redis import get_redis
from app.core.security import ALGORITHM, SECRET_KEY
from app.db.models import SystemMetric, User
from app.db.session import SessionLocal, get_db
from app.schemas.settings import SystemStateResponse

router = APIRouter()
ws_router = APIRouter()
logger = logging.getLogger(__name__)


def _resolve_period(period: str) -> timedelta:
    periods = {
        "1h": timedelta(hours=1),
        "24h": timedelta(hours=24),
        "7d": timedelta(days=7),
    }
    try:
        return periods[period]
    except KeyError as exc:
        raise HTTPException(status_code=400, detail="Unsupported period") from exc


def _serialize_metric(metric: SystemMetric) -> dict:
    return {
        "recorded_at": metric.recorded_at.isoformat(),
        "cpu": metric.cpu_usage_percent,
        "ram": metric.ram_usage_percent,
        "gpu": metric.gpu_utilization_percent,
        "vram_used": metric.vram_used_mb,
        "vram_total": metric.vram_total_mb,
        "disk_system_used_gb": metric.disk_system_used_gb,
        "disk_system_total_gb": metric.disk_system_total_gb,
        "disk_source_used_gb": metric.disk_source_used_gb,
        "disk_source_total_gb": metric.disk_source_total_gb,
    }


def _get_user_from_token(token: str) -> User | None:
    db = SessionLocal()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        session_version = payload.get("session_version")
        if user_id is None or session_version is None:
            return None

        user = db.query(User).filter(User.id == user_id).first()
        if user is None or user.session_version != session_version:
            return None

        return user
    except JWTError:
        return None
    finally:
        db.close()


@router.get("/logs")
def get_container_logs(
    container: str = Query("doc_backend", description="Container name to fetch logs from"),
    lines: int = Query(100, ge=1, le=5000, description="Number of lines to fetch"),
    current_user: User = Depends(get_current_superadmin_user),
):
    try:
        cmd = ["docker", "logs", "--tail", str(lines), container]
        output = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True)
        return {"logs": output}
    except subprocess.CalledProcessError as exc:
        logger.error("Error fetching logs from Docker: %s", exc.output)
        return {"logs": f"Error: {exc.output}"}
    except Exception as exc:
        logger.error("Failed to get logs: %s", exc)
        return {"logs": f"Error: {exc}"}


@router.get("/state", response_model=SystemStateResponse)
async def get_system_state(
    current_user: User = Depends(get_current_superadmin_user),
):
    redis_client = await get_redis()
    state = await redis_client.get("APP_STATE")
    return {"state": state or "SEARCH"}


@router.post("/state", response_model=SystemStateResponse)
async def set_system_state(
    new_state: str,
    current_user: User = Depends(get_current_superadmin_user),
):
    if new_state not in {"SEARCH", "PROCESSING", "LOCKDOWN"}:
        raise HTTPException(status_code=400, detail="Invalid state")

    redis_client = await get_redis()
    await redis_client.set("APP_STATE", new_state)
    await emit_event("STATE_CHANGED", {"new_state": new_state, "by": current_user.username})
    return {"state": new_state}


@router.post("/lockdown", response_model=SystemStateResponse)
async def trigger_lockdown(
    current_user: User = Depends(get_current_superadmin_user),
):
    return await set_system_state("LOCKDOWN", current_user)


@router.post("/unlock", response_model=SystemStateResponse)
async def trigger_unlock(
    current_user: User = Depends(get_current_superadmin_user),
):
    return await set_system_state("SEARCH", current_user)


@router.get("/history")
async def get_metrics_history(
    period: str = Query("24h"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin_user),
):
    cutoff = datetime.utcnow() - _resolve_period(period)
    metrics = (
        db.query(SystemMetric)
        .filter(SystemMetric.recorded_at >= cutoff)
        .order_by(SystemMetric.recorded_at.asc())
        .all()
    )
    return [_serialize_metric(metric) for metric in metrics]


@ws_router.websocket("/live")
async def websocket_endpoint(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token or _get_user_from_token(token) is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()

    try:
        while True:
            live_metrics = get_live_metrics()
            live_metrics["recorded_at"] = datetime.utcnow().isoformat()
            await websocket.send_json(live_metrics)
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        logger.info("Metrics WebSocket disconnected")
    except Exception as exc:
        logger.error("WebSocket error: %s", exc)
        try:
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        except RuntimeError:
            pass
