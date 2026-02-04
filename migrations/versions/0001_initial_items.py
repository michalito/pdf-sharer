"""Initial items table.

Revision ID: 0001_initial_items
Revises:
Create Date: 2026-02-04
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0001_initial_items"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("stored_name", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=True),
        sa.Column("size_bytes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("meta_json", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stored_name", name="uq_items_stored_name"),
    )

    op.create_index(op.f("ix_items_display_name"), "items", ["display_name"], unique=False)
    op.create_index(op.f("ix_items_kind"), "items", ["kind"], unique=False)
    op.create_index(op.f("ix_items_created_at"), "items", ["created_at"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_items_created_at"), table_name="items")
    op.drop_index(op.f("ix_items_kind"), table_name="items")
    op.drop_index(op.f("ix_items_display_name"), table_name="items")
    op.drop_table("items")
