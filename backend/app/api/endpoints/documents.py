import json
import os
import shutil
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin_user, get_current_user
from app.core.redis import get_redis
from app.db.models import Document, User
from app.db.session import get_db
from app.schemas.document import DocumentResponse
from app.worker.tasks import ocr_heavy

router = APIRouter()

DOC_SOURCE_PATH = os.getenv("DOC_SOURCE_PATH", "/app/doc_source")
ALLOWED_PRIORITIES = {"HIGH", "NORMAL", "LOW"}


def resolve_document_path(source_path: str) -> Path:
    source_dir = Path(DOC_SOURCE_PATH).resolve()
    # source_path here is the safe internal filename (UUID based)
    return source_dir / source_path


def apply_ocr_progress(doc: Document, progress_data: dict | None) -> DocumentResponse:
    response = DocumentResponse.model_validate(doc)
    if not progress_data or progress_data.get("doc_id") != doc.id:
        return response

    response.current_page = progress_data.get("current_page")
    response.total_pages = progress_data.get("total_pages")
    response.current_document_percent = progress_data.get("current_document_percent")
    response.current_document_index = progress_data.get("current_document_index")
    response.completed_docs = progress_data.get("completed_docs")
    response.total_docs = progress_data.get("total_docs")
    response.remaining_docs = progress_data.get("remaining_docs")
    response.overall_percent = progress_data.get("overall_percent")
    response.updated_at = progress_data.get("updated_at")
    return response


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    priority: str = Form("NORMAL"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    original_filename = file.filename or "unnamed_document"
    extension = os.path.splitext(original_filename.lower())[1]
    
    if extension not in {".pdf", ".docx"}:
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are allowed")

    # Create safe internal filename using UUID to avoid ANY issues with cyrillic/long names
    internal_filename = f"{uuid.uuid4()}{extension}"
    
    os.makedirs(DOC_SOURCE_PATH, exist_ok=True)
    file_path = resolve_document_path(internal_filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {e}") from e

    new_doc = Document(
        filename=original_filename,
        source_path=internal_filename,
        status="PENDING",
        priority=priority.upper() if priority.upper() in ALLOWED_PRIORITIES else "NORMAL"
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)

    ocr_heavy.apply_async(args=[new_doc.id], task_id=f"ocr_{new_doc.id}")

    return new_doc


@router.post("/reset-stuck")
async def reset_stuck_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    docs = db.query(Document).filter(Document.status.in_(["PROCESSING", "PENDING", "ERROR"])).all()
    for doc in docs:
        doc.status = "PENDING"
        doc.error_message = None
        ocr_heavy.apply_async(args=[doc.id], task_id=f"ocr_{doc.id}")
    
    db.commit()
    return {"status": "success", "reset_count": len(docs)}


@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
    redis_client = Depends(get_redis),
):
    docs = db.query(Document).order_by(Document.created_at.desc()).offset(skip).limit(limit).all()
    raw_progress = await redis_client.get("OCR_PROGRESS")
    progress_data = None
    if raw_progress:
        try:
            progress_data = json.loads(raw_progress)
        except json.JSONDecodeError:
            progress_data = None

    return [apply_ocr_progress(doc, progress_data) for doc in docs]


@router.get("/{doc_id}/download")
async def download_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = resolve_document_path(doc.source_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    media_type = "application/pdf"
    if doc.source_path.lower().endswith(".docx"):
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    return FileResponse(file_path, media_type=media_type, filename=doc.filename)


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = resolve_document_path(doc.source_path)
    if file_path.exists():
        os.remove(file_path)

    db.delete(doc)
    db.commit()
    return {"status": "deleted"}
