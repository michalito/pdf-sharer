"""Add item state.

Revision ID: 0002_add_item_state
Revises: 0001_initial_items
Create Date: 2026-02-04
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0002_add_item_state"
down_revision = "0001_initial_items"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("state", sa.String(length=20), nullable=False, server_default="active")
        )
        batch_op.create_index(batch_op.f("ix_items_state"), ["state"], unique=False)


def downgrade():
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_items_state"))
        batch_op.drop_column("state")

