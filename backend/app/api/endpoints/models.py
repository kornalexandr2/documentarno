import os
import aiofiles
import httpx
import psutil
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from pydantic import BaseModel

from app.db.models import User
from app.api.deps import get_current_superadmin_user, get_current_admin_user

router = APIRouter()
OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")

class PullRequest(BaseModel):
    model_name: str

def check_ram_warning() -> str:
    """Returns a warning string if RAM is low, else empty string."""
    ram = psutil.virtual_memory()
    available_gb = ram.available / (1024**3)
    if available_gb < 6.0:
        return f"Warning: Available RAM is low ({available_gb:.1f} GB). Model loading might fail or cause Out-of-Memory errors."
    return ""

@router.post("/upload")
async def upload_model(
    file: UploadFile = File(...),
    model_name: str = Form(...),
    current_user: User = Depends(get_current_superadmin_user)
):
    if not file.filename.endswith(".gguf"):
        raise HTTPException(status_code=400, detail="Only .gguf files are allowed")

    ram_warning = check_ram_warning()

    models_dir = "/app/models"
    os.makedirs(models_dir, exist_ok=True)
    file_path = os.path.join(models_dir, file.filename)
    
    # Save file in chunks (Multipart upload)
    try:
        async with aiofiles.open(file_path, 'wb') as out_file:
            while content := await file.read(1024 * 1024):  # 1MB chunks
                await out_file.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
            
    # Register with Ollama
    # The volume is shared: /app/models (backend) = /root/.ollama (ollama container)
    # Ollama needs the path inside its own filesystem
    modelfile_content = f"FROM /root/.ollama/{file.filename}\nTEMPLATE \"{{{{.Prompt}}}}\""
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{OLLAMA_URL}/api/create",
                json={"name": model_name, "modelfile": modelfile_content},
                timeout=120.0
            )
            resp.raise_for_status()
        except httpx.RequestError as e:
            raise HTTPException(status_code=500, detail=f"Ollama API error: {str(e)}")
            
    response_data = {"status": "Model successfully installed", "model_name": model_name}
    if ram_warning:
        response_data["warning"] = ram_warning
        
    return response_data

@router.post("/pull")
async def pull_model(
    request: PullRequest,
    current_user: User = Depends(get_current_superadmin_user)
):
    ram_warning = check_ram_warning()
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{OLLAMA_URL}/api/pull",
                json={"name": request.model_name, "stream": False},
                timeout=1800.0  # 30 minutes timeout for very large models
            )
            resp.raise_for_status()
        except httpx.RequestError as e:
            raise HTTPException(status_code=500, detail=f"Ollama API error: {str(e)}")
            
    response_data = {"status": "Model successfully pulled", "model_name": request.model_name}
    if ram_warning:
        response_data["warning"] = ram_warning
        
    return response_data

@router.get("")
async def list_models(
    current_user: User = Depends(get_current_admin_user)
):
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{OLLAMA_URL}/api/tags", timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
            return {"models": data.get("models", [])}
        except httpx.RequestError as e:
            raise HTTPException(status_code=500, detail=f"Ollama API error: {str(e)}")
