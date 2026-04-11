from pydantic import BaseModel
from typing import Optional

class ChatRequest(BaseModel):
    message: str
    document_id: Optional[int] = None
    model_name: Optional[str] = "llama3.1:8b" # Default tag
    is_incognito: Optional[bool] = False

