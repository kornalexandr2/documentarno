from pydantic import BaseModel
from datetime import datetime

class DocumentResponse(BaseModel):
    id: int
    source_path: str
    status: str
    priority: str
    created_at: datetime

    class Config:
        from_attributes = True
