"""remove gmax and totem formes from pokemon_species

Revision ID: b7e2d3f1a8c9
Revises: a3f9c1b2d4e5
Create Date: 2026-04-22 00:01:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b7e2d3f1a8c9'
down_revision: Union[str, None] = 'a3f9c1b2d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Delete season_pokemon rows referencing these species first (FK constraint)
    op.execute("""
        DELETE FROM season_pokemon
        WHERE species_id IN (
            SELECT id FROM pokemon_species
            WHERE forme_name LIKE '%-gmax'
               OR forme_name LIKE '%-totem'
        )
    """)
    op.execute("""
        DELETE FROM pokemon_species
        WHERE forme_name LIKE '%-gmax'
           OR forme_name LIKE '%-totem'
    """)


def downgrade() -> None:
    pass  # re-run seed script to restore
