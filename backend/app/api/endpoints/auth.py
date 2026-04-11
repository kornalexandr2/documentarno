from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
import redis.asyncio as redis

from app.db.session import get_db
from app.db.models import User, AuditLog
from app.schemas.auth import LoginRequest, TokenResponse
from app.core.security import verify_password, create_access_token
from app.core.redis import get_redis
from app.api.deps import get_current_superadmin_user

router = APIRouter()

@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    login_data: LoginRequest,
    db: Session = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    client_ip = request.headers.get("X-Real-IP", request.client.host if request.client else "unknown")
    login_attempts_key = f"LOGIN_ATTEMPTS:{client_ip}"

    user = db.query(User).filter(User.username == login_data.username).first()

    if not user or not verify_password(login_data.password, user.password_hash):
        attempts = await redis_client.incr(login_attempts_key)
        if attempts == 1:
            await redis_client.expire(login_attempts_key, 60)

        if attempts > 10:
            await redis_client.sadd("BLOCKED_IPS", client_ip)
            audit = AuditLog(event="IP_BLOCKED", payload={"ip": client_ip, "reason": "Too many failed login attempts"})
            db.add(audit)
            db.commit()
            raise HTTPException(status_code=403, detail="Too many attempts. IP blocked.")

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )

    await redis_client.delete(login_attempts_key)

    access_token = create_access_token(
        user_id=user.id,
        role=user.role,
        session_version=user.session_version
    )

    return {"access_token": access_token}

@router.post("/kick_all")
async def kick_all(
    current_user: User = Depends(get_current_superadmin_user),
    db: Session = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """
    Forces all users (including admins) to re-login by incrementing
    the session_version in the DB for all accounts.
    """
    global_version = await redis_client.incr("GLOBAL_SESSION_VERSION")

    users = db.query(User).all()
    for u in users:
        u.session_version += 1

    audit = AuditLog(event="KICK_ALL", payload={"triggered_by": current_user.username, "new_global_version": global_version})
    db.add(audit)
    db.commit()

    return {"status": "All users kicked", "global_session_version": global_version}
