"""Add content_hash column to items table.

Revision ID: 0008_add_content_hash
Revises: 0007_add_item_expires_at
Create Date: 2026-03-03
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0008_add_content_hash"
down_revision = "0007_add_item_expires_at"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("content_hash", sa.String(64), nullable=True)
        )
        batch_op.create_index("ix_items_content_hash", ["content_hash"])


def downgrade():
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.drop_index("ix_items_content_hash")
        batch_op.drop_column("content_hash")
