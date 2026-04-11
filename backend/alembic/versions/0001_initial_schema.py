"""Initial schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-04-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('session_version', sa.Integer(), nullable=True, server_default=sa.text('1')),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('username')
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)

    op.create_table('documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('source_path', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('priority', sa.String(), nullable=True, server_default=sa.text("'NORMAL'")),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_documents_id'), 'documents', ['id'], unique=False)

    op.create_table('chat_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('content', sa.String(), nullable=True),
        sa.Column('is_incognito', sa.Boolean(), nullable=True, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_chat_history_id'), 'chat_history', ['id'], unique=False)

    op.create_table('audit_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event', sa.String(), nullable=True),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_id'), 'audit_logs', ['id'], unique=False)

    op.create_table('event_subscriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_name', sa.String(), nullable=True),
        sa.Column('channel', sa.String(), nullable=True),
        sa.Column('enabled', sa.Boolean(), nullable=True, server_default=sa.text('true')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_event_subscriptions_id'), 'event_subscriptions', ['id'], unique=False)

    op.create_table('system_metrics',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('cpu_usage_percent', sa.Float(), nullable=False),
        sa.Column('ram_usage_percent', sa.Float(), nullable=False),
        sa.Column('gpu_utilization_percent', sa.Float(), nullable=True),
        sa.Column('vram_used_mb', sa.Integer(), nullable=True),
        sa.Column('vram_total_mb', sa.Integer(), nullable=True),
        sa.Column('disk_system_used_gb', sa.Float(), nullable=True),
        sa.Column('disk_system_total_gb', sa.Float(), nullable=True),
        sa.Column('disk_source_used_gb', sa.Float(), nullable=True),
        sa.Column('disk_source_total_gb', sa.Float(), nullable=True),
        sa.Column('recorded_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_system_metrics_id'), 'system_metrics', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_system_metrics_id'), table_name='system_metrics')
    op.drop_table('system_metrics')
    op.drop_index(op.f('ix_event_subscriptions_id'), table_name='event_subscriptions')
    op.drop_table('event_subscriptions')
    op.drop_index(op.f('ix_audit_logs_id'), table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_index(op.f('ix_chat_history_id'), table_name='chat_history')
    op.drop_table('chat_history')
    op.drop_index(op.f('ix_documents_id'), table_name='documents')
    op.drop_table('documents')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_table('users')
