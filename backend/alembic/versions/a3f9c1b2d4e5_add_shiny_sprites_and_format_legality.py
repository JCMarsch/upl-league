"""add shiny sprites and format_legality to pokemon_species

Revision ID: a3f9c1b2d4e5
Revises: 00114c2303af
Create Date: 2026-04-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3f9c1b2d4e5'
down_revision: Union[str, None] = '00114c2303af'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('pokemon_species', sa.Column('shiny_sprite_url', sa.String(), nullable=True))
    op.add_column('pokemon_species', sa.Column('shiny_artwork_url', sa.String(), nullable=True))
    op.add_column('pokemon_species', sa.Column('format_legality', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('pokemon_species', 'format_legality')
    op.drop_column('pokemon_species', 'shiny_artwork_url')
    op.drop_column('pokemon_species', 'shiny_sprite_url')
