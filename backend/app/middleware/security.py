import os
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from jose import jwt, JWTError
import redis.asyncio as redis

from app.core.security import ALGORITHM, SECRET_KEY
from app.core.redis import redis_client

# Paths that require JWT validation (all API endpoints except health, login, and static docs)
AUTH_REQUIRED_PATHS = ["/api/documents", "/api/chat", "/api/models", "/api/system", "/api/settings", "/api/auth/kick_all", "/api/admin"]
WS_PATHS = ["/ws/system"]


class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # 1. Check Lockdown state
        app_state = await redis_client.get("APP_STATE")
        if app_state == "LOCKDOWN":
            return JSONResponse(
                status_code=503,
                content={"detail": "Service Unavailable (Lockdown mode active)"}
            )

        # 2. Check IP blocking
        client_ip = request.headers.get("X-Real-IP", request.client.host if request.client else "unknown")
        is_blocked = await redis_client.sismember("BLOCKED_IPS", client_ip)
        if is_blocked:
            return JSONResponse(
                status_code=403,
                content={"detail": "Forbidden (IP Blocked)"}
            )

        # 3. JWT session_version validation for protected endpoints
        path = request.url.path
        needs_auth = any(path.startswith(prefix) for prefix in AUTH_REQUIRED_PATHS) or \
                     any(path.startswith(prefix) for prefix in WS_PATHS)

        # Skip auth for public endpoints
        if needs_auth:
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
                try:
                    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                    token_session_version = payload.get("session_version")
                    user_id = payload.get("user_id")

                    if token_session_version is not None and user_id is not None:
                        # Check session_version against DB
                        from app.db.session import SessionLocal
                        from app.db.models import User
                        db = SessionLocal()
                        try:
                            user = db.query(User).filter(User.id == user_id).first()
                            if user and user.session_version != token_session_version:
                                return JSONResponse(
                                    status_code=401,
                                    content={"detail": "Session expired. Please log in again."}
                                )
                        finally:
                            db.close()
                except JWTError:
                    pass  # Let the endpoint handle invalid tokens

        # 4. Rate Limiting for API requests (anti-abuse)
        # Skip rate limiting for /auth/login (has its own rate limiting) and non-API paths
        path = request.url.path
        if (path.startswith("/api/") or path == "/api/health") and not path.startswith("/api/auth/login"):
            rate_limit_key = f"API_RATE_LIMIT:{client_ip}"
            request_count = await redis_client.incr(rate_limit_key)
            if request_count == 1:
                await redis_client.expire(rate_limit_key, 60)

            if request_count > 1000:  # 1000 API requests per minute (SPA can be chatty)
                await redis_client.sadd("BLOCKED_IPS", client_ip)
                # Emit event for Telegram notification
                try:
                    from app.core.events import emit_event
                    await emit_event("IP_BLOCKED", {"ip": client_ip, "reason": f"Rate limit exceeded: {request_count} req/min"})
                except Exception:
                    pass
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too Many Requests. Your IP has been blocked."}
                )

        response = await call_next(request)
        return response
