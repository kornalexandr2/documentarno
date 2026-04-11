import logging
import os
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.db.models import User, SystemSetting
from app.core.security import get_password_hash

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEFAULT_PROMPT = (
    "Ты — полезный и точный AI-ассистент системы Documentarno.\n"
    "Отвечай на вопрос пользователя строго на основе предоставленного контекста.\n"
    "Если в контексте нет ответа на вопрос, честно скажи об этом.\n"
    "Для ответа используй форматирование Markdown."
)

def init_db(db: Session) -> None:
    # Check if a superadmin already exists
    superadmin = db.query(User).filter(User.role == "SUPERADMIN").first()
    if not superadmin:
        logger.info("Creating initial superadmin user...")
        default_username = os.getenv("FIRST_SUPERUSER", "admin")
        default_password = os.getenv("FIRST_SUPERUSER_PASSWORD", "admin")
        
        user = User(
            username=default_username,
            password_hash=get_password_hash(default_password),
            role="SUPERADMIN"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info(f"Superadmin user '{default_username}' created successfully.")
    else:
        logger.info("Superadmin already exists. Skipping initialization.")

    # Initialize default prompt
    prompt_setting = db.query(SystemSetting).filter(SystemSetting.key == "system_prompt").first()
    if not prompt_setting:
        logger.info("Creating default system prompt...")
        setting = SystemSetting(key="system_prompt", value=DEFAULT_PROMPT)
        db.add(setting)

    # Initialize sync mode
    sync_setting = db.query(SystemSetting).filter(SystemSetting.key == "sync_mode").first()
    if not sync_setting:
        logger.info("Creating default sync mode...")
        setting = SystemSetting(key="sync_mode", value="SYNC_AUTO")
        db.add(setting)

    # Initialize default model
    model_setting = db.query(SystemSetting).filter(SystemSetting.key == "default_model").first()
    if not model_setting:
        logger.info("Creating default model setting...")
        setting = SystemSetting(key="default_model", value="llama3.1:8b")
        db.add(setting)
    
    db.commit()

def main() -> None:
    logger.info("Initializing database...")
    db = SessionLocal()
    try:
        init_db(db)
    except Exception as e:
        logger.error(f"Error during database initialization: {e}")
    finally:
        db.close()
    logger.info("Database initialization finished.")

if __name__ == "__main__":
    main()

