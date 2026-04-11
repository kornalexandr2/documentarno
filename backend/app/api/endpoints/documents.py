import json
import os
import shutil
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin_user, get_current_user
from app.core.redis import redis_client
from app.db.models import Document, User
from app.db.session import get_db
from app.schemas.document import DocumentResponse
from app.worker.tasks import ocr_heavy

router = APIRouter()

DOC_SOURCE_PATH = os.getenv("DOC_SOURCE_PATH", "/app/doc_source")
ALLOWED_PRIORITIES = {"HIGH", "NORMAL", "LOW"}


def sanitize_uploaded_filename(filename: str) -> str:
    if not filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    # Extract only the base name if a path was sent
    safe_name = os.path.basename(filename).strip()
    
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")

    allowed_extensions = {".pdf", ".docx"}
    file_ext = os.path.splitext(safe_name.lower())[1]
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are allowed")

    return safe_name


def resolve_document_path(filename: str) -> Path:
    # Ensure no path traversal
    safe_name = os.path.basename(filename)
    source_dir = Path(DOC_SOURCE_PATH).resolve()
    return source_dir / safe_name


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    priority: str = Form("NORMAL"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    safe_filename = sanitize_uploaded_filename(file.filename or "")
    normalized_priority = priority.upper()
    if normalized_priority not in ALLOWED_PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")

    os.makedirs(DOC_SOURCE_PATH, exist_ok=True)
    file_path = resolve_document_path(safe_filename)

    if file_path.exists():
        # Add a timestamp to prevent collision instead of failing
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        name, ext = os.path.splitext(safe_filename)
        safe_filename = f"{name}_{timestamp}{ext}"
        file_path = resolve_document_path(safe_filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {e}") from e

    new_doc = Document(
        source_path=safe_filename,
        status="PENDING",
        priority=normalized_priority
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
    # Reset all documents that are in PROCESSING or PENDING to PENDING
    # This is useful if the worker was restarted
    docs = db.query(Document).filter(Document.status.in_(["PROCESSING", "PENDING"])).all()
    for doc in docs:
        doc.status = "PENDING"
        ocr_heavy.apply_async(args=[doc.id], task_id=f"ocr_{doc.id}")
    
    db.commit()
    return {"status": "success", "reset_count": len(docs)}


@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    docs = db.query(Document).order_by(Document.created_at.desc()).offset(skip).limit(limit).all()
    return docs


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

    return FileResponse(file_path, media_type=media_type, filename=doc.source_path)


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
