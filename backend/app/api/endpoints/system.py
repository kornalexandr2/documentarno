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

    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /api/ {
        proxy_pass http://backend:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /ws/ {
        proxy_pass http://backend:8000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}"""
LOCKDOWN_NGINX_CONFIG = "server { listen 80; return 503 'Service Unavailable (Lockdown)'; }"


def apply_nginx_config(config_text: str) -> None:
    result = subprocess.run(
        [
            "docker",
            "exec",
            "doc_nginx",
            "sh",
            "-c",
            f"cat > /etc/nginx/conf.d/default.conf << 'NGINX_EOF'\n{config_text}\nNGINX_EOF\nnginx -s reload",
        ],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    if result.returncode != 0:
        stderr = result.stderr.strip()
        stdout = result.stdout.strip()
        details = stderr or stdout or "Unknown Docker/Nginx error"
        raise RuntimeError(details)


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

    if user.role not in ["ADMIN", "SUPERADMIN"]:
        return None

    return user


@router.post("/lockdown")
async def trigger_lockdown(
    current_user: User = Depends(get_current_superadmin_user),
    redis_client: redis.Redis = Depends(get_redis),
    db: Session = Depends(get_db)
):
    try:
        apply_nginx_config(LOCKDOWN_NGINX_CONFIG)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to activate lockdown at Nginx level: {exc}") from exc

    await redis_client.set("APP_STATE", "LOCKDOWN")

    audit = AuditLog(event="LOCKDOWN_ACTIVATED", payload={"triggered_by": current_user.username})
    db.add(audit)
    db.commit()

    await emit_event("LOCKDOWN_ACTIVATED", {"by": current_user.username})
    return {"status": "Lockdown activated"}


@router.post("/unlock")
async def trigger_unlock(
    current_user: User = Depends(get_current_superadmin_user),
    redis_client: redis.Redis = Depends(get_redis),
    db: Session = Depends(get_db)
):
    try:
        apply_nginx_config(DEFAULT_NGINX_CONFIG)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to restore Nginx configuration: {exc}") from exc

    await redis_client.set("APP_STATE", "SEARCH")

    audit = AuditLog(event="UNLOCK_ACTIVATED", payload={"triggered_by": current_user.username})
    db.add(audit)
    db.commit()

    await emit_event("UNLOCK_ACTIVATED", {"by": current_user.username})
    return {"status": "Lockdown removed"}


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
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close()


@router.get("/history")
async def get_metrics_history(
    period: str = Query("24h", description="Period like 1h, 24h, 7d"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    hours = 24
    if period == "1h":
        hours = 1
    elif period == "7d":
        hours = 24 * 7

    since_date = datetime.utcnow() - timedelta(hours=hours)

    metrics = db.query(SystemMetric).filter(
        SystemMetric.recorded_at >= since_date
    ).order_by(SystemMetric.recorded_at.asc()).all()

    return [
        {
            "recorded_at": m.recorded_at.isoformat(),
            "cpu": m.cpu_usage_percent,
            "ram": m.ram_usage_percent,
            "gpu": m.gpu_utilization_percent,
            "vram_used": m.vram_used_mb,
            "vram_total": m.vram_total_mb,
            "disk_system_used_gb": m.disk_system_used_gb,
            "disk_system_total_gb": m.disk_system_total_gb,
            "disk_source_used_gb": m.disk_source_used_gb,
            "disk_source_total_gb": m.disk_source_total_gb
        }
        for m in metrics
    ]
