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

def check_and_emit_alert(redis_conn: redis.Redis, alert_type: str, alert_key: str, message: str, db: Session):
    """
    Checks cooldown in Redis and emits alert if cooldown has expired.
    Cooldown is 1 hour (3600 seconds) for the same type of alert.
    """
    cooldown_key = f"ALERT_COOLDOWN:{alert_key}"
    if not redis_conn.exists(cooldown_key):
        # Log to DB
        audit = AuditLog(event=alert_type, payload={"message": message})
        db.add(audit)
        
        # Send to Telegram
        emit_event_sync(alert_type, {"message": message})
        
        # Set cooldown for 1 hour
        redis_conn.setex(cooldown_key, 3600, "1")
        logger.warning(f"Emitted alert: {message}")

@celery_app.task(name="app.worker.tasks.collect_system_metrics")
def collect_system_metrics():
    logger.info("Collecting system metrics...")
    db: Session = SessionLocal()
    redis_conn = None
    try:
        metrics = get_live_metrics()

        redis_host = os.getenv("REDIS_HOST", "redis")
        redis_port = os.getenv("REDIS_PORT", "6379")
        redis_conn = redis.Redis(host=redis_host, port=redis_port, db=0)

        new_metric = SystemMetric(**metrics)
        db.add(new_metric)
        
        # 1. System Disk
        if metrics['disk_system_total_gb'] > 0:
            free_pct = 1.0 - (metrics['disk_system_used_gb'] / metrics['disk_system_total_gb'])
            free_gb = metrics['disk_system_total_gb'] - metrics['disk_system_used_gb']
            
            if free_pct < 0.05:
                check_and_emit_alert(
                    redis_conn, "HARDWARE_CRITICAL", "sys_disk_crit", 
                    f"Системный диск заполнен на {(1-free_pct)*100:.1f}%! Осталось: {free_gb:.1f} ГБ. Возможна остановка БД.", db
                )
            elif free_pct < 0.15:
                check_and_emit_alert(
                    redis_conn, "HARDWARE_WARNING", "sys_disk_warn", 
                    f"Системный диск заполнен на {(1-free_pct)*100:.1f}%. Осталось: {free_gb:.1f} ГБ.", db
                )
                
        # 2. Source Disk
        if metrics['disk_source_total_gb'] > 0:
            free_pct_src = 1.0 - (metrics['disk_source_used_gb'] / metrics['disk_source_total_gb'])
            if free_pct_src < 0.10:
                check_and_emit_alert(
                    redis_conn, "HARDWARE_WARNING", "src_disk_warn", 
                    f"Диск-источник заполнен на {(1-free_pct_src)*100:.1f}%. Риск сбоя синхронизации новых документов.", db
                )

        # 3. RAM
        if metrics['ram_usage_percent'] > 95.0:
            check_and_emit_alert(
                redis_conn, "HARDWARE_CRITICAL", "ram_crit", 
                f"Утилизация оперативной памяти (RAM) превысила 95% ({metrics['ram_usage_percent']}%). Риск OOM.", db
            )

        # 4. GPU Temperature
        try:
            import pynvml
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            if temp > 85:
                check_and_emit_alert(
                    redis_conn, "HARDWARE_WARNING", "gpu_temp_warn", 
                    f"Температура GPU достигла {temp}°C.", db
                )
        except Exception:
            pass
            
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save system metrics: {e}")
        db.rollback()
    finally:
        db.close()
        if redis_conn is not None:
            redis_conn.close()

@celery_app.task(name="app.worker.tasks.cleanup_old_metrics")
def cleanup_old_metrics():
    logger.info("Cleaning up old system metrics...")
    db: Session = SessionLocal()
    try:
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        deleted_count = db.query(SystemMetric).filter(SystemMetric.recorded_at < thirty_days_ago).delete()
        db.commit()
        logger.info(f"Deleted {deleted_count} old system metric records.")
    except Exception as e:
        logger.error(f"Failed to clean up old metrics: {e}")
        db.rollback()
    finally:
        db.close()

@celery_app.task(name="app.worker.tasks.ocr_heavy", bind=True, max_retries=3)
def ocr_heavy(self, doc_id: int):
    logger.info(f"!!! [TASK START] Starting OCR/DOCX processing for document ID: {doc_id} !!!")
    db: Session = SessionLocal()
    doc = db.query(Document).filter(Document.id == doc_id).first()
    
    if not doc:
        logger.error(f"Document {doc_id} not found.")
        db.close()
        return

    doc.status = "PROCESSING"
    db.commit()

    try:
        # Import OCR and Embeddings logic locally to prevent circular imports and delayed loading
        from app.worker.ocr import process_pdf_to_markdown, process_docx_to_markdown
        from app.core.embeddings import process_and_store_document
        
        doc_source_path = os.getenv("DOC_SOURCE_PATH", "/app/doc_source")
        file_path = os.path.join(doc_source_path, doc.source_path)
        
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File {file_path} not found on disk")

        # Determine processing method based on file extension
        ext = os.path.splitext(doc.source_path.lower())[1]
        if ext == ".pdf":
            markdown_text = process_pdf_to_markdown(file_path)
        elif ext == ".docx":
            markdown_text = process_docx_to_markdown(file_path)
        else:
            raise ValueError(f"Unsupported file extension: {ext}")
        
        # Free GPU memory after OCR to ensure embedding model can fit
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            
        # 2. Split into chunks and save to Qdrant
        process_and_store_document(doc_id, markdown_text)
        
        # 3. Update status
        doc.status = "COMPLETED"
        db.commit()

        # Remove from OCR_QUEUE in Redis
        try:
            import redis as redis_sync
            r = redis_sync.Redis(host=os.getenv("REDIS_HOST", "redis"), port=os.getenv("REDIS_PORT", "6379"), db=0)
            # Remove the processed item from queue (iterate and remove matching doc_id)
            queue_items = r.lrange("OCR_QUEUE", 0, -1)
            for item in queue_items:
                try:
                    data = json.loads(item)
                    if data.get("doc_id") == doc_id:
                        r.lrem("OCR_QUEUE", 0, item)
                        break
                except Exception:
                    continue
            r.close()
        except Exception as e:
            logger.warning(f"Failed to update OCR_QUEUE: {e}")

        logger.info(f"Successfully processed document ID: {doc_id}")

    except Exception as e:
        logger.error(f"OCR Task failed for document ID {doc_id}: {str(e)}")
        doc.status = "ERROR"
        db.commit()
        raise self.retry(exc=e, countdown=60)  # Retry after 60 seconds
    finally:
        db.close()
        # CRITICAL: Clean up GPU memory as per spec
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            logger.info("Cleared CUDA cache after OCR/Embeddings task.")
