"""Add original_filename, file_size columns and status index

Revision ID: b7e3f2a91d4c
Revises: 06ef144bcff0
Create Date: 2025-01-25 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b7e3f2a91d4c'
down_revision = '06ef144bcff0'
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns
    with op.batch_alter_table('pdfs', schema=None) as batch_op:
        # Add original_filename column, initially copying from filename
        batch_op.add_column(
            sa.Column('original_filename', sa.String(length=255), nullable=True)
        )
        batch_op.add_column(
            sa.Column('file_size', sa.Integer(), nullable=True, default=0)
        )
        # Add index on status for faster filtering
        batch_op.create_index('ix_pdfs_status', ['status'], unique=False)

    # Populate original_filename from filename for existing records
    op.execute("UPDATE pdfs SET original_filename = filename WHERE original_filename IS NULL")
    op.execute("UPDATE pdfs SET file_size = 0 WHERE file_size IS NULL")

    # Make columns non-nullable after populating data
    with op.batch_alter_table('pdfs', schema=None) as batch_op:
        batch_op.alter_column('original_filename',
                              existing_type=sa.String(length=255),
                              nullable=False)
        batch_op.alter_column('file_size',
                              existing_type=sa.Integer(),
                              nullable=False)


def downgrade():
    with op.batch_alter_table('pdfs', schema=None) as batch_op:
        batch_op.drop_index('ix_pdfs_status')
        batch_op.drop_column('file_size')
        batch_op.drop_column('original_filename')
