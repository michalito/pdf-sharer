"""Add audit logs table

Create audit_logs table for tracking user actions and system events.
Includes indexes for efficient querying by timestamp, request_id, user_id,
action type, and resource.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-01-25 22:02:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('audit_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('request_id', sa.String(length=36), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.String(length=512), nullable=True),
        sa.Column('action', sa.String(length=50), nullable=False),
        sa.Column('resource_type', sa.String(length=20), nullable=True),
        sa.Column('resource_id', sa.Integer(), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('success', sa.Boolean(), nullable=False),
        sa.Column('error_message', sa.String(length=500), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.create_index('ix_audit_logs_timestamp', ['timestamp'], unique=False)
        batch_op.create_index('ix_audit_logs_request_id', ['request_id'], unique=False)
        batch_op.create_index('ix_audit_logs_user_id', ['user_id'], unique=False)
        batch_op.create_index('ix_audit_logs_action', ['action'], unique=False)
        batch_op.create_index('ix_audit_logs_resource_type', ['resource_type'], unique=False)
        batch_op.create_index('ix_audit_logs_resource', ['resource_type', 'resource_id'], unique=False)


def downgrade():
    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.drop_index('ix_audit_logs_resource')
        batch_op.drop_index('ix_audit_logs_resource_type')
        batch_op.drop_index('ix_audit_logs_action')
        batch_op.drop_index('ix_audit_logs_user_id')
        batch_op.drop_index('ix_audit_logs_request_id')
        batch_op.drop_index('ix_audit_logs_timestamp')

    op.drop_table('audit_logs')
