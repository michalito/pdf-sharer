"""Add user authentication

Revision ID: 6a1b2d059995
Revises: b7e3f2a91d4c
Create Date: 2026-01-25 20:57:52.689162

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '6a1b2d059995'
down_revision = 'b7e3f2a91d4c'
branch_labels = None
depends_on = None


def upgrade():
    # Create users table
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(length=80), nullable=False),
        sa.Column('password_hash', sa.String(length=256), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_username'), ['username'], unique=True)

    # Update pdfs table
    with op.batch_alter_table('pdfs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('user_id', sa.Integer(), nullable=True))
        batch_op.alter_column('filename',
               existing_type=sa.VARCHAR(length=100),
               type_=sa.String(length=255),
               existing_nullable=False)
        batch_op.alter_column('status',
               existing_type=sa.VARCHAR(length=20),
               nullable=False)
        batch_op.alter_column('upload_date',
               existing_type=sa.DATETIME(),
               nullable=False)
        batch_op.create_index(batch_op.f('ix_pdfs_user_id'), ['user_id'], unique=False)
        batch_op.create_unique_constraint('uq_pdfs_filename', ['filename'])
        batch_op.create_foreign_key('fk_pdfs_user_id', 'users', ['user_id'], ['id'], ondelete='CASCADE')


def downgrade():
    with op.batch_alter_table('pdfs', schema=None) as batch_op:
        batch_op.drop_constraint('fk_pdfs_user_id', type_='foreignkey')
        batch_op.drop_constraint('uq_pdfs_filename', type_='unique')
        batch_op.drop_index(batch_op.f('ix_pdfs_user_id'))
        batch_op.alter_column('upload_date',
               existing_type=sa.DATETIME(),
               nullable=True)
        batch_op.alter_column('status',
               existing_type=sa.VARCHAR(length=20),
               nullable=True)
        batch_op.alter_column('filename',
               existing_type=sa.String(length=255),
               type_=sa.VARCHAR(length=100),
               existing_nullable=False)
        batch_op.drop_column('user_id')
        batch_op.drop_column('updated_at')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_username'))

    op.drop_table('users')
