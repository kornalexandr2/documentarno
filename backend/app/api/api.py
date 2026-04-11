from fastapi import APIRouter

from app.api.endpoints import auth
from app.api.endpoints import models
from app.api.endpoints import system
from app.api.endpoints import documents
from app.api.endpoints import chat
from app.api.endpoints import settings

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(models.router, prefix="/models", tags=["models"])
api_router.include_router(system.router, prefix="/system/metrics", tags=["system"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])





