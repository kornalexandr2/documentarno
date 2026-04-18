import logging
import os
import torch
import redis
import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.db.models import SystemMetric, Document, AuditLog
from app.worker.celery_app import celery_app
from app.core.metrics import get_live_metrics
from app.core.events import emit_event_sync

logger = logging.getLogger(__name__)


def build_ocr_progress_payload(db: Session, redis_conn: redis.Redis, doc_id: int, filename: str, current: int, total: int) -> dict:
    pending_count = db.query(Document).filter(Document.status.in_(["PENDING", "PROCESSING"])).count()

    existing_raw = redis_conn.get("OCR_PROGRESS")
    existing_progress = {}
    if existing_raw:
        try:
            existing_progress = json.loads(existing_raw)
        except json.JSONDecodeError:
            existing_progress = {}

    previous_total_docs = int(existing_progress.get("total_docs", 0) or 0)
    previous_completed_docs = int(existing_progress.get("completed_docs", 0) or 0)

    total_docs = max(previous_total_docs, pending_count + previous_completed_docs, 1)
    completed_docs = max(total_docs - pending_count, 0)
    current_doc_progress_percent = round((current / total) * 100, 1) if total > 0 else 0.0
    overall_percent = round(((completed_docs + (current_doc_progress_percent / 100.0)) / total_docs) * 100, 1)

    return {
        "doc_id": doc_id,
        "filename": filename,
        "current_page": current,
        "total_pages": total,
        "current_document_percent": current_doc_progress_percent,
        "current_document_index": min(completed_docs + 1, total_docs),
        "completed_docs": completed_docs,
        "total_docs": total_docs,
        "remaining_docs": pending_count,
        "overall_percent": overall_percent,
        "updated_at": datetime.utcnow().isoformat(),
    }

def check_and_emit_alert(redis_conn: redis.Redis, alert_type: str, alert_key: str, message: str, db: Session):
    cooldown_key = f"ALERT_COOLDOWN:{alert_key}"
    if not redis_conn.exists(cooldown_key):
        audit = AuditLog(event=alert_type, payload={"message": message})
        db.add(audit)
        emit_event_sync(alert_type, {"message": message})
        redis_conn.setex(cooldown_key, 3600, "1")
        logger.warning(f"Emitted alert: {message}")

@celery_app.task(name="app.worker.tasks.collect_system_metrics")
def collect_system_metrics():
    logger.info("Collecting system metrics...")
    db: Session = SessionLocal()
    redis_conn = None
    try:
        metrics = get_live_metrics()
        metric_row = {
            "cpu_usage_percent": metrics["cpu_usage_percent"],
            "ram_usage_percent": metrics["ram_usage_percent"],
            "gpu_utilization_percent": metrics["gpu_utilization_percent"],
            "vram_used_mb": metrics["vram_used_mb"],
            "vram_total_mb": metrics["vram_total_mb"],
            "disk_system_used_gb": metrics["disk_system_used_gb"],
            "disk_system_total_gb": metrics["disk_system_total_gb"],
            "disk_source_used_gb": metrics["disk_source_used_gb"],
            "disk_source_total_gb": metrics["disk_source_total_gb"],
        }
        redis_host = os.getenv("REDIS_HOST", "redis")
        redis_port = os.getenv("REDIS_PORT", "6379")
        redis_conn = redis.Redis(host=redis_host, port=redis_port, db=0)
        new_metric = SystemMetric(**metric_row)
        db.add(new_metric)
        
        if metrics['disk_system_total_gb'] > 0:
            free_pct = 1.0 - (metrics['disk_system_used_gb'] / metrics['disk_system_total_gb'])
            free_gb = metrics['disk_system_total_gb'] - metrics['disk_system_used_gb']
            if free_pct < 0.05:
                check_and_emit_alert(redis_conn, "HARDWARE_CRITICAL", "sys_disk_crit", f"Системный диск заполнен на {(1-free_pct)*100:.1f}%!", db)
            elif free_pct < 0.15:
                check_and_emit_alert(redis_conn, "HARDWARE_WARNING", "sys_disk_warn", f"Системный диск заполнен на {(1-free_pct)*100:.1f}%.", db)
        
        if metrics['ram_usage_percent'] > 95.0:
            check_and_emit_alert(redis_conn, "HARDWARE_CRITICAL", "ram_crit", f"RAM > 95% ({metrics['ram_usage_percent']}%).", db)
            
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save system metrics: {e}")
    finally:
        db.close()
        if redis_conn: redis_conn.close()

@celery_app.task(name="app.worker.tasks.ocr_heavy", bind=True, max_retries=3)
def ocr_heavy(self, doc_id: int):
    logger.info(f"!!! [TASK START] Processing document ID: {doc_id} !!!")
    db: Session = SessionLocal()
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        db.close()
        return

    doc.status = "PROCESSING"
    doc.error_message = None
    db.commit()

    redis_host = os.getenv("REDIS_HOST", "redis")
    redis_port = os.getenv("REDIS_PORT", "6379")
    r_sync = redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)

    try:
        from app.worker.ocr import process_pdf_to_markdown, process_docx_to_markdown
        from app.core.embeddings import process_and_store_document
        
        doc_source_path = os.getenv("DOC_SOURCE_PATH", "/app/doc_source")
        file_path = os.path.join(doc_source_path, doc.source_path)
        r_sync.set("APP_STATE", "PROCESSING")
        initial_progress = build_ocr_progress_payload(db, r_sync, doc_id, doc.filename, 0, 0)
        r_sync.set("OCR_PROGRESS", json.dumps(initial_progress), ex=300)
        
        def update_redis_progress(current, total):
            progress_data = build_ocr_progress_payload(db, r_sync, doc_id, doc.filename, current, total)
            r_sync.set("OCR_PROGRESS", json.dumps(progress_data), ex=300)

        ext = os.path.splitext(doc.source_path.lower())[1]
        if ext == ".pdf":
            markdown_text = process_pdf_to_markdown(file_path, progress_callback=update_redis_progress)
        elif ext == ".docx":
            update_redis_progress(1, 1)
            markdown_text = process_docx_to_markdown(file_path)
        else:
            raise ValueError(f"Unsupported extension: {ext}")
        
        process_and_store_document(doc_id, markdown_text)
        
        doc.status = "COMPLETED"
        db.commit()
        logger.info(f"Successfully processed document ID: {doc_id}")

    except Exception as e:
        error_msg = str(e)
        logger.error(f"OCR Task failed for document ID {doc_id}: {error_msg}")
        doc.status = "ERROR"
        doc.error_message = error_msg
        db.commit()
    finally:
        # Check if queue is empty to auto-switch state
        pending_remaining = db.query(Document).filter(Document.status.in_(["PENDING", "PROCESSING"])).count()
        if pending_remaining == 0:
            logger.info("Queue empty. Switching state to SEARCH.")
            r_sync.set("APP_STATE", "SEARCH")
            emit_event_sync("STATE_CHANGED", {"new_state": "SEARCH", "by": "system"})
        
        r_sync.delete("OCR_PROGRESS")
        db.close()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
