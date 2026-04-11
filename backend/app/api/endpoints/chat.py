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
    Model Switching Algorithm (OOM Protection):
    1. Unload current model (keep_alive: 0)
    2. Wait 2 sec for NVIDIA driver to free memory
    3. Check VRAM (skipped here since Ollama handles VRAM internally, but we simulate the delay)
    4. Load new model
    """
    timeout = httpx.Timeout(120.0, connect=30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(f"{OLLAMA_URL}/api/ps")
            resp.raise_for_status()
            running_models = resp.json().get("models", [])

            for m in running_models:
                if m["name"] != model_name:
                    logger.info(f"Unloading model {m['name']} to free VRAM...")
                    await client.post(
                        f"{OLLAMA_URL}/api/generate",
                        json={"model": m["name"], "prompt": "", "keep_alive": 0}
                    )
                    await asyncio.sleep(2.0)
        except Exception as e:
            logger.error(f"Error during model switching: {e}")

async def ollama_stream_generator(prompt: str, model_name: str):
    """
    Generator function to stream response from Ollama API.
    Converts Ollama NDJSON format to SSE format expected by frontend.
    """
    await ensure_model_loaded(model_name)

    payload = {
        "model": model_name,
        "prompt": prompt,
        "stream": True,
        "options": {
            "temperature": 0.1,
            "top_p": 0.5
        }
    }

    timeout = httpx.Timeout(120.0, connect=30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            async with client.stream("POST", f"{OLLAMA_URL}/api/generate", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        if "response" in data:
                            sse_data = json.dumps({"text": data["response"]})
                            yield f"data: {sse_data}\n\n"
                    except json.JSONDecodeError:
                        logger.warning(f"Failed to parse JSON from Ollama stream: {line}")
        except httpx.RequestError as e:
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
                must=[
                    FieldCondition(
                        key="doc_id",
                        match=MatchValue(value=request.document_id)
                    )
                ]
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
                logger.info(f"Found {len(search_result)} relevant chunks for document {request.document_id}")
            else:
                logger.info(f"No relevant context found for document {request.document_id}")

        except Exception as e:
            logger.error(f"Vector search failed: {e}")

    settings = {
        setting.key: setting.value
        for setting in db.query(SystemSetting)
        .filter(SystemSetting.key.in_(["system_prompt", "default_model"]))
        .all()
    }
    system_prompt = settings.get("system_prompt") or "Ты полезный ассистент."

    if context_text:
        full_prompt = f"{system_prompt}\n\nКОНТЕКСТ:\n{context_text}\n\nВОПРОС ПОЛЬЗОВАТЕЛЯ:\n{request.message}"
    else:
        full_prompt = f"{system_prompt}\n\nВОПРОС ПОЛЬЗОВАТЕЛЯ:\n{request.message}"

    model_name = request.model_name or settings.get("default_model") or "llama3.1:8b"

    return StreamingResponse(
        ollama_stream_generator(full_prompt, model_name),
        media_type="text/event-stream"
    )
