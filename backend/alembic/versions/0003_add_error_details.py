"""add error message and filename to documents

Revision ID: 0003_add_error_details
Revises: 0002_add_settings
Create Date: 2026-04-11 21:50:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0003_add_error_details'
down_revision = '0002_add_settings'
branch_labels = None
depends_on = None

def upgrade():
    # 1. Add error_message column
    op.add_column('documents', sa.Column('error_message', sa.String(), nullable=True))
    
    # 2. Add filename column (nullable at first to handle existing records)
    op.add_column('documents', sa.Column('filename', sa.String(), nullable=True))
    
    # 3. Fill filename with source_path for existing records
    op.execute("UPDATE documents SET filename = source_path WHERE filename IS NULL")
    
    # 4. Make filename NOT NULL
    op.alter_column('documents', 'filename', nullable=False)

def downgrade():
    op.drop_column('documents', 'filename')
    op.drop_column('documents', 'error_message')
