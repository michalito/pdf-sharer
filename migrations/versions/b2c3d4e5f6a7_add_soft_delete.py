"""Add soft delete support

Add deleted_at column to pdfs table to enable soft-delete functionality.
PDFs with a non-null deleted_at value are considered deleted and will be
filtered out of normal queries. They can be recovered within a retention
period before being permanently deleted by a cleanup job.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-01-25 22:01:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('pdfs', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.create_index('ix_pdfs_deleted_at', ['deleted_at'], unique=False)


def downgrade():
    with op.batch_alter_table('pdfs', schema=None) as batch_op:
        batch_op.drop_index('ix_pdfs_deleted_at')
        batch_op.drop_column('deleted_at')
