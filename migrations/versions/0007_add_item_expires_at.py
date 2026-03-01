"""Add expires_at column to items table.

Revision ID: 0007_add_item_expires_at
Revises: 0006_add_item_updated_at
Create Date: 2026-03-01
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0007_add_item_expires_at"
down_revision = "0006_add_item_updated_at"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.create_index("ix_items_expires_at", ["expires_at"])


def downgrade():
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.drop_index("ix_items_expires_at")
        batch_op.drop_column("expires_at")
