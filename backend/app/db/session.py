import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

def get_db_url():
    user = os.getenv("POSTGRES_USER", "doc_admin")
    password = os.getenv("POSTGRES_PASSWORD", "change_me_super_secret")
    server = os.getenv("POSTGRES_HOST", "postgres")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "documentarno")
    return f"postgresql://{user}:{password}@{server}:{port}/{db}"

engine = create_engine(get_db_url(), pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
