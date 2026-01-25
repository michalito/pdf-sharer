"""Fix filename constraint for multi-tenancy

Drop global unique constraint on filename and replace with composite
unique constraint on (filename, user_id) to allow different users to
have files with the same name.

Revision ID: a1b2c3d4e5f6
Revises: 6a1b2d059995
Create Date: 2026-01-25 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '6a1b2d059995'
branch_labels = None
depends_on = None


def upgrade():
    # Drop the global unique constraint on filename
    # and add composite unique constraint on (filename, user_id)
    with op.batch_alter_table('pdfs', schema=None) as batch_op:
        batch_op.drop_constraint('uq_pdfs_filename', type_='unique')
        batch_op.create_unique_constraint(
            'uq_pdfs_filename_user_id',
            ['filename', 'user_id']
        )


def downgrade():
    with op.batch_alter_table('pdfs', schema=None) as batch_op:
        batch_op.drop_constraint('uq_pdfs_filename_user_id', type_='unique')
        batch_op.create_unique_constraint('uq_pdfs_filename', ['filename'])
