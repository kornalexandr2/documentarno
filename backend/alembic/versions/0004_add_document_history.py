"""add document processing history

Revision ID: 0004_add_document_history
Revises: 0003_add_error_details
Create Date: 2026-05-09 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0004_add_document_history'
down_revision = '0003_add_error_details'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('documents', sa.Column('updated_at', sa.DateTime(), nullable=True))
    op.add_column('documents', sa.Column('processed_at', sa.DateTime(), nullable=True))
    op.execute("UPDATE documents SET updated_at = created_at WHERE updated_at IS NULL")

    op.create_table(
        'document_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(), nullable=False),
        sa.Column('message', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_document_events_id'), 'document_events', ['id'], unique=False)
    op.create_index(op.f('ix_document_events_document_id'), 'document_events', ['document_id'], unique=False)

    op.execute(
        """
        INSERT INTO document_events (document_id, event_type, message, created_at)
        SELECT id, 'uploaded', 'Document was added to the processing queue.', created_at
        FROM documents
        """
    )


def downgrade():
    op.drop_index(op.f('ix_document_events_document_id'), table_name='document_events')
    op.drop_index(op.f('ix_document_events_id'), table_name='document_events')
    op.drop_table('document_events')
    op.drop_column('documents', 'processed_at')
    op.drop_column('documents', 'updated_at')
