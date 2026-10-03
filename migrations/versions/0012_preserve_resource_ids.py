"""Keep deleted resource IDs from being reused by SQLite.

Revision ID: 0012_preserve_resource_ids
Revises: 0011_add_unlock_attempts
"""

from alembic import op
import sqlalchemy as sa


revision = "0012_preserve_resource_ids"
down_revision = "0011_add_unlock_attempts"
branch_labels = None
depends_on = None


def _rebuild_sqlite_tables(autoincrement):
    if op.get_bind().dialect.name != "sqlite":
        return
    for table in ("items", "spaces"):
        with op.batch_alter_table(
            table, recreate="always",
            table_kwargs={"sqlite_autoincrement": autoincrement},
        ) as batch:
            batch.alter_column("id", existing_type=sa.Integer(), existing_nullable=False)


def upgrade():
    # Older SQLite connections did not enforce foreign keys.
    op.execute(sa.text(
        "UPDATE items SET space_id = NULL WHERE space_id IS NOT NULL "
        "AND NOT EXISTS (SELECT 1 FROM spaces WHERE spaces.id = items.space_id)"
    ))
    op.execute(sa.text(
        "DELETE FROM unlock_attempts WHERE NOT EXISTS "
        "(SELECT 1 FROM items WHERE items.id = unlock_attempts.item_id)"
    ))
    _rebuild_sqlite_tables(True)


def downgrade():
    _rebuild_sqlite_tables(False)
