"""Add wishlist_items table

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-04-23

"""
from alembic import op
import sqlalchemy as sa

revision = 'f3a4b5c6d7e8'
down_revision = 'e2f3a4b5c6d7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'wishlist_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('season_pokemon_id', sa.Integer(), sa.ForeignKey('season_pokemon.id', ondelete='CASCADE'), nullable=False),
        sa.Column('priority', sa.Integer(), nullable=False, default=0),
        sa.Column('conditions_operator', sa.String(), nullable=True),  # AND / OR / null
        sa.Column('conditions', sa.JSON(), nullable=True),  # [{type: 'already_have'|'pokemon_gone', species_id: int}]
    )


def downgrade():
    op.drop_table('wishlist_items')
