"""Add position column to spaces table for user-defined ordering.

Revision ID: 0009_add_space_position
Revises: 0008_add_content_hash
Create Date: 2026-03-03
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0009_add_space_position"
down_revision = "0008_add_content_hash"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("spaces", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("position", sa.Integer, nullable=True)
        )

    # Backfill positions in current alphabetical order
    conn = op.get_bind()
    spaces = conn.execute(
        sa.text("SELECT id FROM spaces ORDER BY normalized_name ASC")
    ).fetchall()
    for idx, row in enumerate(spaces):
        conn.execute(
            sa.text("UPDATE spaces SET position = :pos WHERE id = :id"),
            {"pos": idx, "id": row[0]},
        )


def downgrade():
    with op.batch_alter_table("spaces", schema=None) as batch_op:
        batch_op.drop_column("position")
