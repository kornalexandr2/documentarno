from pydantic import BaseModel
from typing import Optional, Dict, Any

class SettingBase(BaseModel):
    name: str
    value: str
    category: str = "general"
    description: Optional[str] = None

class SettingCreate(SettingBase):
    pass

class SettingUpdate(BaseModel):
    value: str

class Setting(SettingBase):
    id: int

    class Config:
        from_attributes = True

class SystemStateResponse(BaseModel):
    state: str
