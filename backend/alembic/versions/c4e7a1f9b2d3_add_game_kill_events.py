"""add game_kill_events table

Revision ID: c4e7a1f9b2d3
Revises: 00114c2303af
Create Date: 2026-04-23

"""
from alembic import op
import sqlalchemy as sa

revision = 'c4e7a1f9b2d3'
down_revision = '00114c2303af'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'game_kill_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('game_id', sa.Integer(), nullable=False),
        sa.Column('turn_number', sa.Integer(), nullable=False),
        sa.Column('attacker_team_id', sa.Integer(), nullable=False),
        sa.Column('attacker_species_id', sa.Integer(), nullable=False),
        sa.Column('defender_team_id', sa.Integer(), nullable=False),
        sa.Column('defender_species_id', sa.Integer(), nullable=False),
        sa.Column('move_name', sa.String(), nullable=True),
        sa.Column('kill_type', sa.String(), nullable=False, server_default='direct'),
        sa.ForeignKeyConstraint(['game_id'], ['games.id']),
        sa.ForeignKeyConstraint(['attacker_team_id'], ['teams.id']),
        sa.ForeignKeyConstraint(['attacker_species_id'], ['pokemon_species.id']),
        sa.ForeignKeyConstraint(['defender_team_id'], ['teams.id']),
        sa.ForeignKeyConstraint(['defender_species_id'], ['pokemon_species.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_game_kill_events_game_id', 'game_kill_events', ['game_id'])


def downgrade() -> None:
    op.drop_index('ix_game_kill_events_game_id', table_name='game_kill_events')
    op.drop_table('game_kill_events')
