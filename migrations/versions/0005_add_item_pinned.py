"""Add is_pinned column to items table.

Revision ID: 0005_add_item_pinned
Revises: 0004_add_spaces
Create Date: 2026-03-01
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0005_add_item_pinned"
down_revision = "0004_add_spaces"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.text("0"))
        )
        batch_op.create_index("ix_items_pinned_created", ["is_pinned", "created_at"])


def downgrade():
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.drop_index("ix_items_pinned_created")
        batch_op.drop_column("is_pinned")
