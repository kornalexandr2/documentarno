from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models import User, SystemSetting
from app.api.deps import get_current_admin_user
from app.schemas.settings import PromptUpdate, PromptResponse, AppSettings

router = APIRouter()

@router.get("/prompt", response_model=PromptResponse)
async def get_prompt(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    setting = db.query(SystemSetting).filter(SystemSetting.key == "system_prompt").first()
    prompt = setting.value if setting else ""
    return {"prompt": prompt}

@router.put("/prompt", response_model=PromptResponse)
async def update_prompt(
    data: PromptUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    setting = db.query(SystemSetting).filter(SystemSetting.key == "system_prompt").first()
    if not setting:
        setting = SystemSetting(key="system_prompt", value=data.prompt)
        db.add(setting)
    else:
        setting.value = data.prompt
    
    db.commit()
    db.refresh(setting)
    return {"prompt": setting.value}

@router.get("/all", response_model=AppSettings)
async def get_all_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    settings = db.query(SystemSetting).all()
    settings_dict = {s.key: s.value for s in settings}
    return AppSettings(**settings_dict)

@router.put("/all", response_model=AppSettings)
async def update_all_settings(
    data: AppSettings,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    data_dict = data.model_dump(exclude_unset=True)
    for key, value in data_dict.items():
        if value is not None:
            setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
            if not setting:
                setting = SystemSetting(key=key, value=str(value))
                db.add(setting)
            else:
                setting.value = str(value)
    
    db.commit()
    return await get_all_settings(db, current_user)

