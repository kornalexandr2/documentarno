from app.db.models import DocumentEvent


def add_document_event(db, document_id: int, event_type: str, message: str) -> DocumentEvent:
    event = DocumentEvent(
        document_id=document_id,
        event_type=event_type,
        message=message,
    )
    db.add(event)
    return event
