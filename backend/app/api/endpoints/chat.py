import json
import logging
import asyncio
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from qdrant_client.http.models import Filter, FieldCondition, MatchValue

from app.db.session import get_db
from app.db.models import User, SystemSetting, ChatHistory
from app.api.deps import get_current_user
from app.schemas.chat import ChatRequest
from app.core.qdrant import get_qdrant_client, COLLECTION_NAME
from app.core.embeddings import get_query_embedding
from app.api.endpoints.models import OLLAMA_URL

logger = logging.getLogger(__name__)
router = APIRouter()

async def ensure_model_loaded(model_name: str):
    """
    Model Switching logic. Ollama handles VRAM efficiently, 
    but we ensure the model name is valid and provide a small delay if switching.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{OLLAMA_URL}/api/ps")
            if resp.status_code == 200:
                running_models = resp.json().get("models", [])
                is_running = any(m["name"] == model_name for m in running_models)
                
                if not is_running and len(running_models) > 0:
                    logger.info(f"Switching to model {model_name}. Waiting for VRAM release...")
                    # Ollama will unload automatically, we just add a small grace period
                    await asyncio.sleep(1.0)
        except Exception as e:
            logger.warning(f"Optional model check failed: {e}")

async def ollama_stream_generator(prompt: str, model_name: str):
    """
    Generator function to stream response from Ollama API.
    """
    await ensure_model_loaded(model_name)

    payload = {
        "model": model_name,
        "prompt": prompt,
        "stream": True,
        "options": {
            "temperature": 0.3,
            "top_p": 0.9,
            "num_ctx": 4096
        }
    }

    # High timeout for generation
    timeout = httpx.Timeout(300.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            async with client.stream("POST", f"{OLLAMA_URL}/api/generate", json=payload) as response:
                if response.status_code == 404:
                    yield f"data: {{\"error\": \"Model '{model_name}' not found in Ollama. Please check settings.\"}}\n\n"
                    return
                
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        if "response" in data:
                            sse_data = json.dumps({"text": data["response"]})
                            yield f"data: {sse_data}\n\n"
                        if data.get("done"):
                            break
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            logger.error(f"Ollama API request failed: {e}")
            yield f"data: {{\"error\": \"LLM generation failed: {str(e)}\"}}\n\n"

@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not request.message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    chat_log = ChatHistory(
        user_id=current_user.id,
        content=None if request.is_incognito else request.message,
        is_incognito=request.is_incognito
    )
    db.add(chat_log)
    db.commit()

    context_text = ""

    if request.document_id:
        try:
            query_vector = await asyncio.to_thread(get_query_embedding, request.message)
            client = get_qdrant_client()
            search_filter = Filter(
                must=[FieldCondition(key="doc_id", match=MatchValue(value=request.document_id))]
            )
            search_result = client.search(
                collection_name=COLLECTION_NAME,
                query_vector=query_vector.tolist(),
                query_filter=search_filter,
                limit=5
            )
            if search_result:
                context_chunks = [hit.payload.get("text", "") for hit in search_result]
                context_text = "\n\n---\n\n".join(context_chunks)
        except Exception as e:
            logger.error(f"Vector search failed: {e}")

    settings_list = db.query(SystemSetting).filter(SystemSetting.key.in_(["system_prompt", "default_model"])).all()
    settings = {s.key: s.value for s in settings_list}
    
    system_prompt = settings.get("system_prompt") or "Ты полезный ассистент."
    model_name = request.model_name or settings.get("default_model") or "gemma4:e2b"

    if context_text:
        full_prompt = f"Системная установка: {system_prompt}\n\nКонтекст из документа:\n{context_text}\n\nВопрос пользователя: {request.message}\n\nОтвет ассистента:"
    else:
        full_prompt = f"Системная установка: {system_prompt}\n\nВопрос пользователя: {request.message}\n\nОтвет ассистента:"

    return StreamingResponse(
        ollama_stream_generator(full_prompt, model_name),
        media_type="text/event-stream"
    )
