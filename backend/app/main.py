from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import logging

# Configure Logging to file and console
log_file = "/app/app.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

from app.api.api import api_router
from app.api.endpoints.system import ws_router as system_ws_router
from app.middleware.security import SecurityMiddleware

app = FastAPI(title="Documentarno API", version="1.0.0")

# Setup CORS
origins = os.getenv("CORS_ORIGINS", "http://localhost:8080,http://frontend:80,http://nginx:80").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add Security Middleware (Lockdown and IP blocking)
app.add_middleware(SecurityMiddleware)

app.include_router(api_router, prefix="/api")
app.include_router(system_ws_router, prefix="/ws/system/metrics", tags=["system_ws"])

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
