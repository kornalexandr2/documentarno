from pydantic import BaseModel, Field
from datetime import datetime

class DocumentEventResponse(BaseModel):
    id: int
    document_id: int
    event_type: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True

class DocumentResponse(BaseModel):
    id: int
    filename: str
    source_path: str
    status: str
    priority: str
    error_message: str | None = None
    created_at: datetime
    processed_at: datetime | None = None
    events: list[DocumentEventResponse] = Field(default_factory=list)
    current_page: int | None = None
    total_pages: int | None = None
    current_document_percent: float | None = None
    current_document_index: int | None = None
    completed_docs: int | None = None
    total_docs: int | None = None
    remaining_docs: int | None = None
    overall_percent: float | None = None
    updated_at: datetime | str | None = None

    class Config:
        from_attributes = True
