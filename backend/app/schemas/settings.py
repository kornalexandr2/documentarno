from pydantic import BaseModel
from typing import Optional

class PromptUpdate(BaseModel):
    prompt: str

class PromptResponse(BaseModel):
    prompt: str

class AppSettings(BaseModel):
    system_prompt: Optional[str] = None
    sync_mode: Optional[str] = None
    default_model: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
