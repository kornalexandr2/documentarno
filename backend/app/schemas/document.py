from pydantic import BaseModel
from datetime import datetime

class DocumentResponse(BaseModel):
    id: int
    filename: str
    source_path: str
    status: str
    priority: str
    error_message: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True
