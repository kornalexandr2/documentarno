from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, JSON, ForeignKey
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)
    session_version = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

class Document(Base):
    __tablename__ = 'documents'
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False) # Original name
    source_path = Column(String, nullable=False) # Path on disk
    status = Column(String, nullable=False)
    priority = Column(String, default='NORMAL')
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class ChatHistory(Base):
    __tablename__ = 'chat_history'
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    content = Column(String)
    is_incognito = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class AuditLog(Base):
    __tablename__ = 'audit_logs'
    id = Column(Integer, primary_key=True, index=True)
    event = Column(String)
    payload = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)

class EventSubscription(Base):
    __tablename__ = 'event_subscriptions'
    id = Column(Integer, primary_key=True, index=True)
    event_name = Column(String)
    channel = Column(String)
    enabled = Column(Boolean, default=True)

class SystemMetric(Base):
    __tablename__ = 'system_metrics'
    id = Column(Integer, primary_key=True, index=True)
    cpu_usage_percent = Column(Float, nullable=False)
    ram_usage_percent = Column(Float, nullable=False)
    gpu_utilization_percent = Column(Float)
    vram_used_mb = Column(Integer)
    vram_total_mb = Column(Integer)
    disk_system_used_gb = Column(Float)
    disk_system_total_gb = Column(Float)
    disk_source_used_gb = Column(Float)
    disk_source_total_gb = Column(Float)
    recorded_at = Column(DateTime, default=datetime.utcnow)

class SystemSetting(Base):
    __tablename__ = 'system_settings'
    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)

