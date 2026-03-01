"""Add updated_at column to items table.

Revision ID: 0006_add_item_updated_at
Revises: 0005_add_item_pinned
Create Date: 2026-03-01
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0006_add_item_updated_at"
down_revision = "0005_add_item_pinned"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            )
        )
        batch_op.create_index("ix_items_updated_at", ["updated_at"])


def downgrade():
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.drop_index("ix_items_updated_at")
        batch_op.drop_column("updated_at")
