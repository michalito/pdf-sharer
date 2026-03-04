"""Add position column to items table for user-defined ordering.

Revision ID: 0010_add_item_position
Revises: 0009_add_space_position
Create Date: 2026-03-04
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0010_add_item_position"
down_revision = "0009_add_space_position"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("position", sa.Integer, nullable=True)
        )

    # Backfill positions matching current default sort (pinned first, newest first)
    conn = op.get_bind()
    items = conn.execute(
        sa.text("SELECT id FROM items ORDER BY is_pinned DESC, created_at DESC, id DESC")
    ).fetchall()
    for idx, row in enumerate(items):
        conn.execute(
            sa.text("UPDATE items SET position = :pos WHERE id = :id"),
            {"pos": idx, "id": row[0]},
        )


def downgrade():
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.drop_column("position")
