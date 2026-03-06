"""Add unlock-attempt throttle persistence table.

Revision ID: 0011_add_unlock_attempts
Revises: 0010_add_item_position
Create Date: 2026-03-06
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0011_add_unlock_attempts"
down_revision = "0010_add_item_position"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "unlock_attempts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_ip", sa.String(length=64), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attempt_timestamps_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("locked_until", sa.Float(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.Float(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_ip", "item_id", name="uq_unlock_attempt_client_item"),
    )
    op.create_index(op.f("ix_unlock_attempts_item_id"), "unlock_attempts", ["item_id"], unique=False)
    op.create_index(op.f("ix_unlock_attempts_updated_at"), "unlock_attempts", ["updated_at"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_unlock_attempts_updated_at"), table_name="unlock_attempts")
    op.drop_index(op.f("ix_unlock_attempts_item_id"), table_name="unlock_attempts")
    op.drop_table("unlock_attempts")
