"""Add spaces table and item space_id FK.

Revision ID: 0004_add_spaces
Revises: 0003_add_item_password_hash
Create Date: 2026-02-28
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0004_add_spaces"
down_revision = "0003_add_item_password_hash"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "spaces",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "normalized_name",
            sa.String(length=120),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_spaces_normalized_name", "spaces", ["normalized_name"])

    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.add_column(sa.Column("space_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_items_space_id", ["space_id"])
        batch_op.create_foreign_key(
            "fk_items_space_id",
            "spaces",
            ["space_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade():
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.drop_constraint("fk_items_space_id", type_="foreignkey")
        batch_op.drop_index("ix_items_space_id")
        batch_op.drop_column("space_id")

    op.drop_index("ix_spaces_normalized_name", table_name="spaces")
    op.drop_table("spaces")
