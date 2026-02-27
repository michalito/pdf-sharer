"""Add item password hash.

Revision ID: 0003_add_item_password_hash
Revises: 0002_add_item_state
Create Date: 2026-02-27
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0003_add_item_password_hash"
down_revision = "0002_add_item_state"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.add_column(sa.Column("password_hash", sa.String(length=255), nullable=True))


def downgrade():
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.drop_column("password_hash")
