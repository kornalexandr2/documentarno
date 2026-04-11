import time
import logging
import os
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from app.db.session import SessionLocal
from app.db.models import Document, SystemSetting

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fs_watchdog")

DOC_SOURCE_PATH = os.getenv("DOC_SOURCE_PATH", "/app/doc_source")

class DocumentHandler(FileSystemEventHandler):
    def get_sync_mode(self) -> str:
        db = SessionLocal()
        try:
            setting = db.query(SystemSetting).filter(SystemSetting.key == "sync_mode").first()
            return setting.value if setting else "SYNC_AUTO"
        finally:
            db.close()

    def on_created(self, event):
        if event.is_directory or not event.src_path.lower().endswith(".pdf"):
            return
            
        filename = os.path.basename(event.src_path)
        logger.info(f"Watchdog detected new file: {filename}")
        
        db = SessionLocal()
        try:
            # Check if exists
            exists = db.query(Document).filter(Document.source_path == filename).first()
            if not exists:
                new_doc = Document(
                    source_path=filename,
                    status="PENDING",
                    priority="NORMAL"
                )
                db.add(new_doc)
                db.commit()
                db.refresh(new_doc)
                
                # We should trigger celery task here, but to avoid circular imports 
                # in this script, we can just send it to celery via direct import or redis
                from app.worker.tasks import ocr_heavy
                ocr_heavy.delay(new_doc.id)
                logger.info(f"Added {filename} to processing queue.")
        except Exception as e:
            logger.error(f"Error handling new file {filename}: {e}")
        finally:
            db.close()

    def on_deleted(self, event):
        if event.is_directory or not event.src_path.lower().endswith(".pdf"):
            return
            
        filename = os.path.basename(event.src_path)
        mode = self.get_sync_mode()
        logger.info(f"Watchdog detected deletion: {filename}. Mode: {mode}")
        
        if mode == "SYNC_ADD_ONLY":
            logger.info("SYNC_ADD_ONLY mode: ignoring deletion.")
            return
            
        if mode == "SYNC_PROMPT":
            # Here we would send to Event Bus to ask admin
            from app.core.events import emit_event_sync
            emit_event_sync("SYNC_PROMPT", {"file": filename, "action": "delete"})
            logger.info("SYNC_PROMPT mode: event emitted for approval.")
            return

        # SYNC_AUTO mode
        db = SessionLocal()
        try:
            doc = db.query(Document).filter(Document.source_path == filename).first()
            if doc:
                doc_id = doc.id
                db.delete(doc)
                db.commit()
                logger.info(f"SYNC_AUTO: Removed {filename} (ID: {doc_id}) from database.")
                
                # Remove vectors from Qdrant
                try:
                    from app.core.qdrant import get_qdrant_client, COLLECTION_NAME
                    from qdrant_client.http.models import Filter, FieldCondition, MatchValue
                    
                    client = get_qdrant_client()
                    client.delete(
                        collection_name=COLLECTION_NAME,
                        points_selector=Filter(
                            must=[
                                FieldCondition(
                                    key="doc_id",
                                    match=MatchValue(value=doc_id)
                                )
                            ]
                        )
                    )
                    logger.info(f"Successfully removed vectors for doc_id {doc_id} from Qdrant.")
                except Exception as ve:
                    logger.error(f"Failed to remove vectors for doc_id {doc_id}: {ve}")
        except Exception as e:
            logger.error(f"Error handling deleted file {filename}: {e}")
        finally:
            db.close()

def start_watchdog():
    os.makedirs(DOC_SOURCE_PATH, exist_ok=True)
    event_handler = DocumentHandler()
    observer = Observer()
    observer.schedule(event_handler, DOC_SOURCE_PATH, recursive=False)
    observer.start()
    logger.info(f"Started Watchdog on {DOC_SOURCE_PATH}")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

if __name__ == "__main__":
    start_watchdog()
