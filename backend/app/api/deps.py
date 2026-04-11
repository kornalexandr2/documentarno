from fastapi import Depends, HTTPException, status, Request
from jose import jwt, JWTError
from sqlalchemy.orm import Session
import os

from app.db.session import get_db
from app.db.models import User
from app.core.security import ALGORITHM, SECRET_KEY

def get_token_from_header(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return auth_header.split(" ")[1]

def get_current_user(
    token: str = Depends(get_token_from_header),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("user_id")
        session_version: int = payload.get("session_version")
        if user_id is None or session_version is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
        
    # 3. Валидация JWT: if jwt.session_version != DB.users.session_version
    if user.session_version != session_version:
        raise credentials_exception
        
    return user

def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ["ADMIN", "SUPERADMIN"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return current_user

def get_current_superadmin_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return current_user
