import asyncio
import json
import logging
import time
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from qdrant_client.http.models import FieldCondition, Filter, MatchValue
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.endpoints.models import OLLAMA_URL
from app.core.embeddings import get_query_embedding
from app.core.qdrant import COLLECTION_NAME, get_qdrant_client
from app.db.models import ChatHistory, SystemSetting, User
from app.db.session import get_db
from app.schemas.chat import ChatRequest

logger = logging.getLogger(__name__)
router = APIRouter()

DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant."
DEFAULT_MODEL_NAME = "gemma4:e2b"


def _shorten_error(text: str, limit: int = 300) -> str:
    normalized = " ".join(text.split())
    return normalized[:limit] + ("..." if len(normalized) > limit else "")


async def ensure_model_loaded(model_name: str, request_id: str) -> None:
    """
    Model switching logic. Ollama handles VRAM efficiently,
    but we verify the active model and log what is already running.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            started_at = time.perf_counter()
            resp = await client.get(f"{OLLAMA_URL}/api/ps")
            if resp.status_code == 200:
                running_models = resp.json().get("models", [])
                running_model_names = [model.get("name", "<unknown>") for model in running_models]
                is_running = any(model.get("name") == model_name for model in running_models)

                logger.info(
                    "chat_request_id=%s ollama_ps_ok status=%s elapsed_ms=%.2f target_model=%s running_models=%s is_running=%s",
                    request_id,
                    resp.status_code,
                    (time.perf_counter() - started_at) * 1000,
                    model_name,
                    running_model_names,
                    is_running,
                )

                if not is_running and running_models:
                    logger.info(
                        "chat_request_id=%s model_switch_wait target_model=%s running_models=%s wait_seconds=1.0",
                        request_id,
                        model_name,
                        running_model_names,
                    )
                    await asyncio.sleep(1.0)
            else:
                logger.warning(
                    "chat_request_id=%s ollama_ps_unexpected_status status=%s target_model=%s",
                    request_id,
                    resp.status_code,
                    model_name,
                )
        except Exception as exc:
            logger.warning(
                "chat_request_id=%s ollama_ps_failed target_model=%s error=%s",
                request_id,
                model_name,
                _shorten_error(str(exc)),
            )


async def ollama_stream_generator(prompt: str, model_name: str, request_id: str):
    """
    Stream response from Ollama API with diagnostics useful for production logs.
    """
    await ensure_model_loaded(model_name, request_id)

    payload = {
        "model": model_name,
        "prompt": prompt,
        "stream": True,
        "options": {
            "temperature": 0.3,
            "top_p": 0.9,
            "num_ctx": 4096,
        },
    }

    timeout = httpx.Timeout(300.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            started_at = time.perf_counter()
            first_token_at: float | None = None
            chunks_count = 0
            generated_chars = 0

            logger.info(
                "chat_request_id=%s ollama_generate_start model=%s prompt_chars=%s options=%s",
                request_id,
                model_name,
                len(prompt),
                payload["options"],
            )

            async with client.stream("POST", f"{OLLAMA_URL}/api/generate", json=payload) as response:
                if response.status_code == 404:
                    response_body = await response.aread()
                    available_models: list[str] = []

                    try:
                        tags_response = await client.get(f"{OLLAMA_URL}/api/tags")
                        if tags_response.status_code == 200:
                            available_models = [
                                item.get("name", "<unknown>")
                                for item in tags_response.json().get("models", [])
                            ]
                    except Exception as tags_exc:
                        logger.warning(
                            "chat_request_id=%s ollama_tags_failed_on_404 model=%s error=%s",
                            request_id,
                            model_name,
                            _shorten_error(str(tags_exc)),
                        )

                    logger.error(
                        "chat_request_id=%s ollama_generate_404 model=%s elapsed_ms=%.2f response=%s available_models=%s",
                        request_id,
                        model_name,
                        (time.perf_counter() - started_at) * 1000,
                        _shorten_error(response_body.decode("utf-8", errors="replace")),
                        available_models,
                    )
                    yield f"data: {{\"error\": \"Model '{model_name}' not found in Ollama. Please check settings.\"}}\n\n"
                    return

                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue

                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        logger.warning(
                            "chat_request_id=%s ollama_invalid_json_line model=%s line=%s",
                            request_id,
                            model_name,
                            _shorten_error(line),
                        )
                        continue

                    if "response" in data:
                        if first_token_at is None:
                            first_token_at = time.perf_counter()
                            logger.info(
                                "chat_request_id=%s ollama_first_token model=%s elapsed_ms=%.2f",
                                request_id,
                                model_name,
                                (first_token_at - started_at) * 1000,
                            )

                        chunks_count += 1
                        generated_chars += len(data["response"])
                        sse_data = json.dumps({"text": data["response"]})
                        yield f"data: {sse_data}\n\n"

                    if data.get("done"):
                        total_elapsed_ms = (time.perf_counter() - started_at) * 1000
                        first_token_elapsed_ms = (
                            (first_token_at - started_at) * 1000 if first_token_at is not None else None
                        )
                        logger.info(
                            "chat_request_id=%s ollama_generate_done model=%s elapsed_ms=%.2f first_token_ms=%s chunks=%s generated_chars=%s done_reason=%s",
                            request_id,
                            model_name,
                            total_elapsed_ms,
                            f"{first_token_elapsed_ms:.2f}" if first_token_elapsed_ms is not None else "none",
                            chunks_count,
                            generated_chars,
                            data.get("done_reason"),
                        )
                        break
        except Exception as exc:
            logger.exception(
                "chat_request_id=%s ollama_generate_failed model=%s error=%s",
                request_id,
                model_name,
                _shorten_error(str(exc)),
            )
            yield f"data: {{\"error\": \"LLM generation failed: {str(exc)}\"}}\n\n"


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not request.message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    request_id = uuid.uuid4().hex[:12]
    request_started_at = time.perf_counter()

    logger.info(
        "chat_request_id=%s chat_request_started user_id=%s client=%s document_id=%s incognito=%s message_chars=%s explicit_model=%s",
        request_id,
        current_user.id,
        req.client.host if req.client else "<unknown>",
        request.document_id,
        request.is_incognito,
        len(request.message),
        request.model_name or "",
    )

    chat_log = ChatHistory(
        user_id=current_user.id,
        content=None if request.is_incognito else request.message,
        is_incognito=request.is_incognito,
    )
    db.add(chat_log)
    db.commit()

    context_text = ""

    if request.document_id:
        try:
            vector_started_at = time.perf_counter()
            query_vector = await asyncio.to_thread(get_query_embedding, request.message)
            client = get_qdrant_client()
            search_filter = Filter(
                must=[FieldCondition(key="doc_id", match=MatchValue(value=request.document_id))]
            )
            search_result = client.search(
                collection_name=COLLECTION_NAME,
                query_vector=query_vector.tolist(),
                query_filter=search_filter,
                limit=5,
            )
            if search_result:
                context_chunks = [hit.payload.get("text", "") for hit in search_result]
                context_text = "\n\n---\n\n".join(context_chunks)

            logger.info(
                "chat_request_id=%s vector_search_done document_id=%s hits=%s context_chars=%s elapsed_ms=%.2f",
                request_id,
                request.document_id,
                len(search_result),
                len(context_text),
                (time.perf_counter() - vector_started_at) * 1000,
            )
        except Exception as exc:
            logger.exception(
                "chat_request_id=%s vector_search_failed document_id=%s error=%s",
                request_id,
                request.document_id,
                _shorten_error(str(exc)),
            )
    else:
        logger.info("chat_request_id=%s vector_search_skipped reason=no_document_id", request_id)

    settings_list = db.query(SystemSetting).filter(
        SystemSetting.key.in_(["system_prompt", "default_model"])
    ).all()
    settings = {setting.key: setting.value for setting in settings_list}

    system_prompt = settings.get("system_prompt") or DEFAULT_SYSTEM_PROMPT
    configured_default_model = settings.get("default_model")
    model_name_source = (
        "request" if request.model_name else "settings" if configured_default_model else "fallback"
    )
    model_name = request.model_name or configured_default_model or DEFAULT_MODEL_NAME

    logger.info(
        "chat_request_id=%s chat_model_selected source=%s explicit_model=%s settings_default_model=%s selected_model=%s system_prompt_chars=%s context_chars=%s prep_elapsed_ms=%.2f",
        request_id,
        model_name_source,
        request.model_name or "",
        configured_default_model or "",
        model_name,
        len(system_prompt),
        len(context_text),
        (time.perf_counter() - request_started_at) * 1000,
    )

    if context_text:
        full_prompt = (
            f"System instruction: {system_prompt}\n\n"
            f"Document context:\n{context_text}\n\n"
            f"User question: {request.message}\n\n"
            "Assistant answer:"
        )
    else:
        full_prompt = (
            f"System instruction: {system_prompt}\n\n"
            f"User question: {request.message}\n\n"
            "Assistant answer:"
        )

    return StreamingResponse(
        ollama_stream_generator(full_prompt, model_name, request_id),
        media_type="text/event-stream",
    )
