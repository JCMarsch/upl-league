"""Draft timer modes and end seconds

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-04-23

"""
from alembic import op
import sqlalchemy as sa

revision = 'e2f3a4b5c6d7'
down_revision = 'd1e2f3a4b5c6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('seasons', sa.Column('draft_timer_mode', sa.String(), nullable=True, server_default='fixed'))
    op.add_column('seasons', sa.Column('draft_timer_end_seconds', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('seasons', 'draft_timer_end_seconds')
    op.drop_column('seasons', 'draft_timer_mode')
