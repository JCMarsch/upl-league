"""Fix Pokemon forme display names and remove unwanted formes

Revision ID: d1e2f3a4b5c6
Revises: c4e7a1f9b2d3
Create Date: 2026-04-23

"""
from alembic import op
from sqlalchemy import text

revision = 'd1e2f3a4b5c6'
down_revision = 'c4e7a1f9b2d3'
branch_labels = None
depends_on = None


def _cascade_delete(conn, where_clause: str):
    """Delete pokemon_species rows matching where_clause, cascading through dependents."""
    conn.execute(text(f"""
        DELETE FROM game_kill_events
        WHERE attacker_species_id IN (SELECT id FROM pokemon_species WHERE {where_clause})
           OR defender_species_id IN (SELECT id FROM pokemon_species WHERE {where_clause})
    """))
    conn.execute(text(f"""
        DELETE FROM roster_pokemon WHERE season_pokemon_id IN (
            SELECT sp.id FROM season_pokemon sp
            JOIN pokemon_species ps ON sp.species_id = ps.id
            WHERE {where_clause}
        )
    """))
    conn.execute(text(f"""
        DELETE FROM season_pokemon WHERE species_id IN (
            SELECT id FROM pokemon_species WHERE {where_clause}
        )
    """))
    conn.execute(text(f"DELETE FROM pokemon_species WHERE {where_clause}"))


def upgrade() -> None:
    conn = op.get_bind()

    # ── Fix display names ──────────────────────────────────────────────────────

    # All formes: capitalize each hyphen-separated segment of the slug
    conn.execute(text("""
        UPDATE pokemon_species
        SET name = (
            SELECT string_agg(initcap(word), '-')
            FROM unnest(string_to_array(forme_name, '-')) AS word
        )
    """))

    # Override -f formes to show "Female" instead of "F"
    conn.execute(text("""
        UPDATE pokemon_species
        SET name = (
            SELECT string_agg(initcap(word), '-')
            FROM unnest(string_to_array(left(forme_name, length(forme_name) - 2), '-')) AS word
        ) || '-Female'
        WHERE forme_name LIKE '%-f'
        AND NOT is_base_forme
    """))

    # Special base formes that need a forme-specific display name
    conn.execute(text("UPDATE pokemon_species SET name = 'Lycanroc-Midday'    WHERE forme_name = 'lycanroc'"))
    conn.execute(text("UPDATE pokemon_species SET name = 'Meowstic-Male'      WHERE forme_name = 'meowstic'"))
    conn.execute(text("UPDATE pokemon_species SET name = 'Basculegion-Male'   WHERE forme_name = 'basculegion'"))

    # ── Delete unwanted formes ─────────────────────────────────────────────────

    # Pikachu formes — keep only base 'pikachu'
    _cascade_delete(conn, "forme_name LIKE 'pikachu-%'")

    # Castform weather formes — only base castform is draftable
    _cascade_delete(conn, "forme_name IN ('castform-sunny','castform-rainy','castform-snowy')")

    # Battle-bond Greninja — only base greninja
    _cascade_delete(conn, "forme_name = 'greninja-battle-bond'")

    # Battle-only / same-slot formes
    _cascade_delete(conn, "forme_name IN ('keldeo-resolute','meloetta-pirouette','zygarde-complete')")

    # Ogerpon mask formes — draft the Pokemon, choose mask in-game; only base ogerpon
    _cascade_delete(conn, "forme_name IN ('ogerpon-wellspring-mask','ogerpon-hearthflame-mask','ogerpon-cornerstone-mask')")


def downgrade() -> None:
    pass  # data migration — not reversible
