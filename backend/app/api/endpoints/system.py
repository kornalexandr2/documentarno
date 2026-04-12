import asyncio
import subprocess
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
import redis.asyncio as redis
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin_user, get_current_superadmin_user
from app.core.events import emit_event
from app.core.metrics import get_live_metrics
from app.core.redis import get_redis
from app.core.security import ALGORITHM, SECRET_KEY
from app.db.models import AuditLog, SystemMetric, User
from app.db.session import SessionLocal, get_db

router = APIRouter()
ws_router = APIRouter()

DEFAULT_NGINX_CONFIG = """server {
    listen 80;
    server_name localhost;
    client_max_body_size 500M;

    location / {
        proxy_pass http|//frontend:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /api/ {
        client_max_body_size 500M;
        proxy_pass http|//backend:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 1800s;
    }

    location /ws/ {
        proxy_pass http|//backend:8000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}""".replace('|', '') # Fix for literal string escaping

async def get_user_from_token(token: str, db: Session) -> User | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("user_id")
        session_version: int = payload.get("session_version")
        if user_id is None or session_version is None:
            return None
    except JWTError:
        return None
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.session_version != session_version:
        return None
    return user

@router.get("/state")
async def get_system_state(
    redis_client: redis.Redis = Depends(get_redis),
    current_user: User = Depends(get_current_admin_user)
):
    state = await redis_client.get("APP_STATE")
    if not state:
        return {"state": "SEARCH"}
    final_state = state if isinstance(state, str) else state.decode()
    return {"state": final_state}

@router.post("/state")
async def set_system_state(
    new_state: str = Query(..., regex="^(SEARCH|PROCESSING|LOCKDOWN)$"),
    redis_client: redis.Redis = Depends(get_redis),
    current_user: User = Depends(get_current_superadmin_user),
    db: Session = Depends(get_db)
):
    await redis_client.set("APP_STATE", new_state)
    audit = AuditLog(event="STATE_CHANGED", payload={"new_state": new_state, "by": current_user.username})
    db.add(audit)
    db.commit()
    await emit_event("STATE_CHANGED", {"new_state": new_state, "by": current_user.username})
    return {"status": "success", "new_state": new_state}

@router.get("/logs")
async def get_system_logs(
    lines: int = Query(100, ge=1, le=1000),
    container: str = Query("doc_backend", regex="^(doc_backend|doc_celery_worker|doc_ollama|doc_nginx)$"),
    current_user: User = Depends(get_current_superadmin_user)
):
    try:
        # Read logs directly from Docker via the mapped socket
        result = subprocess.run(
            ["docker", "logs", "--tail", str(lines), container],
            capture_output=True, text=True, timeout=5
        )
        return {"logs": result.stdout + result.stderr}
    except Exception as e:
        return {"logs": f"Error fetching logs from Docker: {e}"}

@ws_router.websocket("/live")
async def websocket_metrics(websocket: WebSocket, token: str = Query(...)):
    db = SessionLocal()
    user = await get_user_from_token(token, db)
    db.close()
    if not user:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    try:
        while True:
            metrics = get_live_metrics()
            metrics["recorded_at"] = datetime.utcnow().isoformat()
            await websocket.send_json(metrics)
            await asyncio.sleep(1)
    except:
        pass

@router.get("/history")
async def get_metrics_history(
    period: str = Query("24h"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    hours = 1 if period == "1h" else 168 if period == "7d" else 24
    since_date = datetime.utcnow() - timedelta(hours=hours)
    metrics = db.query(SystemMetric).filter(SystemMetric.recorded_at >= since_date).order_by(SystemMetric.recorded_at.asc()).all()
    return [
        {
            "recorded_at": m.recorded_at.isoformat(),
            "cpu": m.cpu_usage_percent, "ram": m.ram_usage_percent,
            "gpu": m.gpu_utilization_percent, "vram_used": m.vram_used_mb,
            "vram_total": m.vram_total_mb, "disk_system_used_gb": m.disk_system_used_gb,
            "disk_source_used_gb": m.disk_source_used_gb
        }
        for m in metrics
    ]
